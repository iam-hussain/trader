import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@trader/db";
import { alertQueue } from "../jobs/queue.js";

const Symbol = z.string().regex(/^[A-Z][A-Z0-9.\-]{0,9}$/);
const Kind = z.enum(["price", "iv", "news", "breakout"]);

const PriceRule = z.object({
  op: z.enum(["above", "below", "crosses_above", "crosses_below"]),
  value: z.number().finite(),
});

const IvRule = z.object({
  op: z.enum(["above", "below"]),
  value: z.number().finite(),
  ivPercentile: z.boolean().default(false),
});

const NewsRule = z.object({
  keywords: z.array(z.string().min(1)).min(1),
  source: z.string().optional(),
});

const BreakoutRule = z.object({
  lookbackDays: z.number().int().min(1).max(365),
  direction: z.enum(["up", "down"]),
});

const Rule = z.union([PriceRule, IvRule, NewsRule, BreakoutRule]);

const CreateAlert = z.object({
  ticker: Symbol,
  kind: Kind,
  rule: Rule,
});

const PatchAlert = z.object({
  enabled: z.boolean().optional(),
  rule: Rule.optional(),
});

export async function alertRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  app.get("/", async (req) => {
    const alerts = await prisma.alert.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "desc" },
    });
    return { alerts };
  });

  app.post("/", async (req, reply) => {
    const body = CreateAlert.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.flatten() });
    }

    const alert = await prisma.alert.create({
      data: {
        userId: req.userId,
        ticker: body.data.ticker,
        kind: body.data.kind,
        rule: body.data.rule,
        enabled: true,
      },
    });

    // Kick off an immediate check; the worker stub re-enqueues itself.
    await alertQueue().add(
      "alert",
      { userId: req.userId, alertId: alert.id },
      { jobId: `alert:${req.userId}:${alert.id}:initial` }
    );

    req.log.info({ alertId: alert.id }, "alert created");
    return reply.code(201).send(alert);
  });

  app.patch("/:id", async (req, reply) => {
    const params = z.object({ id: z.string().min(1) }).safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }
    const body = PatchAlert.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.flatten() });
    }

    const existing = await prisma.alert.findUnique({
      where: { id: params.data.id },
    });
    if (!existing || existing.userId !== req.userId) {
      return reply.code(404).send({ error: "not_found" });
    }

    return prisma.alert.update({
      where: { id: params.data.id },
      data: body.data,
    });
  });

  app.delete("/:id", async (req, reply) => {
    const params = z.object({ id: z.string().min(1) }).safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }
    const existing = await prisma.alert.findUnique({
      where: { id: params.data.id },
    });
    if (!existing || existing.userId !== req.userId) {
      return reply.code(404).send({ error: "not_found" });
    }
    await prisma.alert.delete({ where: { id: params.data.id } });
    return { ok: true };
  });
}
