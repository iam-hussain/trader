import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@trader/db";
import {
  stageOrder,
  confirmOrder,
  cancelOrder,
  cancelAll,
  flattenAll,
  listStagedOrders,
} from "../services/order-service.js";
import { RiskError } from "../middleware/risk-middleware.js";

const Symbol = z.string().regex(/^[A-Z][A-Z0-9.\-]{0,9}$/);
const Side = z.enum(["buy", "sell"]);

const OptionLegBody = z.object({
  expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  strike: z.number().positive(),
  right: z.enum(["C", "P"]),
});

const StageOrderBody = z
  .object({
    signalId: z.string().min(1).optional(),
    ticker: Symbol.optional(),
    side: Side.optional(),
    qty: z.number().int().positive().optional(),
    entryPrice: z.number().positive().optional(),
    takeProfit: z.number().positive().optional(),
    stopLoss: z.number().positive().optional(),
    optionLeg: OptionLegBody.optional(),
    notes: z.string().max(2000).optional(),
  })
  .superRefine((b, ctx) => {
    if (b.signalId) return;
    const required = [
      "ticker",
      "side",
      "qty",
      "entryPrice",
      "takeProfit",
      "stopLoss",
    ] as const;
    for (const k of required) {
      if (b[k] === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${k} required when signalId is omitted`,
          path: [k],
        });
      }
    }
  });
export type StageOrderBody = z.infer<typeof StageOrderBody>;

const HistoryQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ticker: Symbol.optional(),
  outcome: z.enum(["win", "loss"]).optional(),
});

const EditBody = z
  .object({
    entryPrice: z.number().positive().optional(),
    takeProfit: z.number().positive().optional(),
    stopLoss: z.number().positive().optional(),
    qty: z.number().int().positive().optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: "at least one field required",
  });

const FlattenBody = z.object({ confirm: z.literal(true) });
const IdParams = z.object({ id: z.string().min(1) });

class BrokerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrokerError";
  }
}

function isRiskError(err: unknown): err is RiskError {
  return err instanceof RiskError || (err as { name?: string })?.name === "RiskError";
}

function isBrokerError(err: unknown): err is BrokerError {
  return (
    err instanceof BrokerError || (err as { name?: string })?.name === "BrokerError"
  );
}

export async function ordersRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  // List staged + submitted orders for the user.
  app.get("/", async (req) => {
    const orders = await listStagedOrders(req.userId);
    return { orders };
  });

  // History — last 200 closed/finalized trades, newest first.
  app.get("/history", async (req, reply) => {
    const query = HistoryQuery.safeParse(req.query);
    if (!query.success) {
      return reply.code(400).send({ error: query.error.flatten() });
    }

    const where: Record<string, unknown> = { userId: req.userId };
    if (query.data.from || query.data.to) {
      const range: { gte?: Date; lte?: Date } = {};
      if (query.data.from) range.gte = new Date(query.data.from);
      if (query.data.to) range.lte = new Date(query.data.to);
      where.openedAt = range;
    }
    if (query.data.ticker) where.ticker = query.data.ticker;
    if (query.data.outcome) {
      where.pnl = query.data.outcome === "win" ? { gt: 0 } : { lt: 0 };
    }

    const trades = await prisma.trade.findMany({
      where,
      orderBy: { openedAt: "desc" },
      take: 200,
    });
    return { trades };
  });

  // Stage a new order (from signal or freeform).
  app.post("/stage", async (req, reply) => {
    const body = StageOrderBody.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.flatten() });
    }
    try {
      const trade = await stageOrder(req.userId, body.data);
      return reply.code(201).send(trade);
    } catch (err) {
      req.log.error({ err }, "stageOrder failed");
      const message = err instanceof Error ? err.message : "stage_failed";
      return reply.code(400).send({ error: "stage_failed", message });
    }
  });

  // Confirm — runs risk checks and dispatches to broker.
  app.post("/:id/confirm", async (req, reply) => {
    const params = IdParams.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }
    try {
      const trade = await confirmOrder(req.userId, params.data.id);
      return { trade };
    } catch (err) {
      if (isRiskError(err)) {
        req.log.warn({ result: err.result }, "risk_rejected");
        return reply
          .code(422)
          .send({ error: "risk_rejected", result: err.result });
      }
      if (isBrokerError(err)) {
        req.log.error({ err }, "broker_error");
        return reply
          .code(502)
          .send({ error: "broker_error", message: err.message });
      }
      req.log.error({ err }, "confirmOrder failed");
      const message = err instanceof Error ? err.message : "confirm_failed";
      return reply.code(500).send({ error: "confirm_failed", message });
    }
  });

  // Cancel a single order by trade id.
  app.post("/:id/cancel", async (req, reply) => {
    const params = IdParams.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }
    try {
      await cancelOrder(req.userId, params.data.id);
      return { ok: true };
    } catch (err) {
      req.log.error({ err }, "cancelOrder failed");
      const message = err instanceof Error ? err.message : "cancel_failed";
      return reply.code(400).send({ error: "cancel_failed", message });
    }
  });

  // Cancel all working orders for the user.
  app.post("/cancel-all", async (req, reply) => {
    try {
      const cancelled = await cancelAll(req.userId);
      return { cancelled };
    } catch (err) {
      req.log.error({ err }, "cancelAll failed");
      const message = err instanceof Error ? err.message : "cancel_all_failed";
      return reply.code(502).send({ error: "cancel_all_failed", message });
    }
  });

  // Flatten — close all open positions. Requires explicit { confirm: true }.
  app.post("/flatten-all", async (req, reply) => {
    const body = FlattenBody.safeParse(req.body);
    if (!body.success) {
      return reply
        .code(400)
        .send({ error: "confirm_required", message: "body.confirm must be true" });
    }
    try {
      const closed = await flattenAll(req.userId);
      return { closed };
    } catch (err) {
      req.log.error({ err }, "flattenAll failed");
      const message = err instanceof Error ? err.message : "flatten_failed";
      return reply.code(502).send({ error: "flatten_failed", message });
    }
  });

  // Edit a still-staged order. Disallowed once it has been sent to the broker.
  app.post("/:id/edit", async (req, reply) => {
    const params = IdParams.safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }
    const body = EditBody.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.flatten() });
    }

    const existing = await prisma.trade.findUnique({
      where: { id: params.data.id },
    });
    if (!existing || existing.userId !== req.userId) {
      return reply.code(404).send({ error: "not_found" });
    }
    if (existing.brokerStatus !== "staged") {
      return reply
        .code(409)
        .send({ error: "not_editable", message: "order already sent to broker" });
    }

    const data: Record<string, number> = {};
    if (body.data.entryPrice !== undefined) data.entryPrice = body.data.entryPrice;
    if (body.data.takeProfit !== undefined) data.targetPrice = body.data.takeProfit;
    if (body.data.stopLoss !== undefined) data.stopPrice = body.data.stopLoss;
    if (body.data.qty !== undefined) data.qty = body.data.qty;

    const updated = await prisma.trade.update({
      where: { id: params.data.id },
      data,
    });
    return updated;
  });
}
