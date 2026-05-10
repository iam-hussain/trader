import { z } from "zod";
import {
  type BracketOrder,
  type BrokerAdapter,
  type BrokerOrderStatus,
  type Position,
  getBrokerAdapter,
} from "@trader/brokers";
import type { Signal, Trade } from "@trader/db";
import { prisma } from "@trader/db";
import { env } from "../env.js";
import { runRiskCheck } from "../middleware/risk-middleware.js";
import { attachToTrade } from "./journal-service.js";
import {
  publishOrderEvent,
  publishPositionUpdate,
} from "./order-events.js";

// ── input shapes ─────────────────────────────────────────────────────────

const OptionLegInput = z.object({
  expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  strike: z.number().positive(),
  right: z.enum(["C", "P"]),
});

export const StageOrderInputSchema = z
  .object({
    signalId: z.string().optional(),
    ticker: z
      .string()
      .regex(/^[A-Z][A-Z0-9.\-]{0,9}$/)
      .optional(),
    side: z.enum(["buy", "sell"]).optional(),
    qty: z.number().int().positive().optional(),
    entryPrice: z.number().positive().optional(),
    takeProfit: z.number().positive().optional(),
    stopLoss: z.number().positive().optional(),
    optionLeg: OptionLegInput.optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine(
    (v) =>
      Boolean(v.signalId) ||
      Boolean(v.ticker && v.side && v.qty && v.takeProfit && v.stopLoss),
    {
      message: "either signalId or {ticker,side,qty,takeProfit,stopLoss} is required",
    }
  );

export type StageOrderInput = z.input<typeof StageOrderInputSchema>;

export class BrokerError extends Error {
  readonly kind = "broker_error" as const;
  constructor(message: string, public readonly code: string = "unknown") {
    super(message);
    this.name = "BrokerError";
  }
}

export interface OpenPositionsResult {
  positions: Position[];
  asOf: string;
  source: "broker" | "cache";
}

// ── helpers ──────────────────────────────────────────────────────────────

/** Pure mapping from a Signal row to the BracketOrder the broker expects. */
export function mapSignalToBracket(signal: Signal): BracketOrder {
  const side: "buy" | "sell" = signal.direction === "long" ? "buy" : "sell";
  const base: BracketOrder = {
    symbol: signal.ticker,
    side,
    qty: signal.qty,
    entryType: "limit",
    entryPrice: signal.entry,
    takeProfit: signal.target1,
    stopLoss: signal.stop,
    tif: "DAY",
  };
  if (signal.instrument === "option" && signal.optionLeg && typeof signal.optionLeg === "object") {
    const leg = signal.optionLeg as {
      expiry?: string;
      strike?: number;
      type?: "call" | "put";
      right?: "C" | "P";
    };
    const right: "C" | "P" =
      leg.right ?? (leg.type === "put" ? "P" : "C");
    return {
      ...base,
      option: { expiry: leg.expiry ?? "", strike: leg.strike ?? 0, right },
    };
  }
  return base;
}

/** Map a Trade row → BracketOrder (manual / non-signal orders). */
function mapTradeToBracket(
  trade: Trade,
  optionLeg?: BracketOrder["option"]
): BracketOrder {
  const side: "buy" | "sell" = trade.side === "buy" ? "buy" : "sell";
  if (
    trade.entryPrice == null ||
    trade.targetPrice == null ||
    trade.stopPrice == null
  ) {
    throw new BrokerError(
      "trade is missing entry/target/stop prices",
      "invalid_trade"
    );
  }
  const order: BracketOrder = {
    symbol: trade.ticker,
    side,
    qty: trade.qty,
    entryType: "limit",
    entryPrice: trade.entryPrice,
    takeProfit: trade.targetPrice,
    stopLoss: trade.stopPrice,
    tif: "DAY",
  };
  if (optionLeg) order.option = optionLeg;
  return order;
}

async function brokerAdapter(): Promise<BrokerAdapter> {
  const adapter = getBrokerAdapter({
    host: env.IBKR_HOST,
    port: env.IBKR_PORT,
    clientId: env.IBKR_CLIENT_ID,
    mode: env.IBKR_MODE,
  });
  if (!adapter.isConnected()) {
    await adapter.connect();
  }
  return adapter;
}

/** Subscribe to an adapter's orderStatus stream and persist updates. */
function attachOrderListener(
  adapter: BrokerAdapter,
  userId: string,
  tradeId: string,
  brokerOrderId: string
): void {
  const emitter = adapter as unknown as {
    on?: (event: string, fn: (s: BrokerOrderStatus) => void) => void;
  };
  if (typeof emitter.on !== "function") return;
  const handler = async (status: BrokerOrderStatus): Promise<void> => {
    if (status.brokerOrderId !== brokerOrderId) return;
    const data: Record<string, unknown> = {
      brokerStatus: status.status,
      filledQty: status.filledQty,
    };
    if (status.avgFillPrice != null) data.entryPrice = status.avgFillPrice;
    if (status.status === "filled") data.openedAt = new Date();
    if (status.status === "cancelled" || status.status === "rejected") {
      data.closedAt = new Date();
    }
    try {
      await prisma.trade.update({ where: { id: tradeId }, data });
      await publishOrderEvent(userId, {
        type:
          status.status === "filled"
            ? "order.fill"
            : status.status === "cancelled"
              ? "order.cancel"
              : status.status === "rejected"
                ? "order.reject"
                : "order.update",
        tradeId,
        data: status,
      });
    } catch {
      /* listener must not crash the adapter */
    }
  };
  emitter.on("orderStatus", handler);
}

// ── public api ───────────────────────────────────────────────────────────

/**
 * Stage a Trade in DB without sending it to the broker. Two modes:
 *   1. signalId: copy entry/target/stop/qty/option from the signal row.
 *   2. raw: use the supplied fields verbatim.
 * In mode 1, updates Signal.status="staged".
 */
export async function stageOrder(
  userId: string,
  input: StageOrderInput
): Promise<Trade> {
  const parsed = StageOrderInputSchema.parse(input);

  if (parsed.signalId) {
    const signalId = parsed.signalId;
    const trade = await prisma.$transaction(async (tx) => {
      const signal = await tx.signal.findUnique({ where: { id: signalId } });
      if (!signal) throw new Error(`signal ${signalId} not found`);
      if (signal.userId !== userId) {
        throw new Error("signal does not belong to user");
      }
      const created = await tx.trade.create({
        data: {
          userId,
          signalId: signal.id,
          ticker: signal.ticker,
          side: signal.direction === "long" ? "buy" : "sell",
          qty: parsed.qty ?? signal.qty,
          entryPrice: parsed.entryPrice ?? signal.entry,
          targetPrice: parsed.takeProfit ?? signal.target1,
          stopPrice: parsed.stopLoss ?? signal.stop,
          brokerStatus: "staged",
          notes: parsed.notes ?? null,
          tags: [],
        },
      });
      await tx.signal.update({
        where: { id: signal.id },
        data: { status: "staged" },
      });
      return created;
    });

    try {
      await attachToTrade(trade.id, signalId);
    } catch {
      /* ignore journal binding errors */
    }
    await publishOrderEvent(userId, { type: "order.staged", tradeId: trade.id });
    return trade;
  }

  // raw mode — guarded by the zod refine
  const trade = await prisma.trade.create({
    data: {
      userId,
      ticker: parsed.ticker!,
      side: parsed.side!,
      qty: parsed.qty!,
      entryPrice: parsed.entryPrice ?? null,
      targetPrice: parsed.takeProfit!,
      stopPrice: parsed.stopLoss!,
      brokerStatus: "staged",
      notes: parsed.notes ?? null,
      tags: [],
    },
  });
  await publishOrderEvent(userId, { type: "order.staged", tradeId: trade.id });
  return trade;
}

/**
 * Confirm a staged order: re-runs the authoritative risk check, then
 * sends a bracket to the broker. On success, persists brokerOrderId +
 * brokerStatus="submitted" and wires up the live orderStatus listener.
 *
 * On broker placement failure, rolls back the brokerStatus → "staged" so
 * the user can retry without a phantom "submitted" row.
 */
export async function confirmOrder(
  userId: string,
  tradeId: string
): Promise<Trade> {
  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade) throw new Error(`trade ${tradeId} not found`);
  if (trade.userId !== userId) throw new Error("trade does not belong to user");

  // 1. Authoritative server-side risk check (throws RiskError on reject).
  const riskResult = await runRiskCheck(userId, {
    qty: trade.qty,
    entryPrice: trade.entryPrice,
    stopPrice: trade.stopPrice,
    targetPrice: trade.targetPrice,
    ticker: trade.ticker,
    side: trade.side,
    signalId: trade.signalId,
  });

  // Apply adjustedQty if the engine resized us.
  const finalQty = riskResult.adjustedQty ?? trade.qty;

  // 2. Build bracket. If linked signal is an option, carry the leg through.
  let bracket: BracketOrder;
  let signal: Signal | null = null;
  if (trade.signalId) {
    signal = await prisma.signal.findUnique({ where: { id: trade.signalId } });
    if (!signal) throw new Error(`linked signal ${trade.signalId} missing`);
    bracket = mapSignalToBracket({ ...signal, qty: finalQty });
    if (trade.entryPrice != null) bracket.entryPrice = trade.entryPrice;
    if (trade.targetPrice != null) bracket.takeProfit = trade.targetPrice;
    if (trade.stopPrice != null) bracket.stopLoss = trade.stopPrice;
  } else {
    bracket = mapTradeToBracket({ ...trade, qty: finalQty });
  }

  // 3. Send to broker.
  const adapter = await brokerAdapter();
  let status: BrokerOrderStatus;
  try {
    status = await adapter.placeBracket(bracket);
  } catch (err) {
    await prisma.trade.update({
      where: { id: tradeId },
      data: { brokerStatus: "staged" },
    });
    await publishOrderEvent(userId, {
      type: "order.reject",
      tradeId,
      data: { error: (err as Error).message },
    });
    throw new BrokerError(
      `broker rejected order: ${(err as Error).message}`,
      "placement_failed"
    );
  }

  // 4. Persist broker ids.
  const updated = await prisma.trade.update({
    where: { id: tradeId },
    data: {
      qty: finalQty,
      brokerOrderId: status.brokerOrderId,
      brokerStatus: "submitted",
      filledQty: status.filledQty,
    },
  });

  // 5. Wire fill listener.
  attachOrderListener(adapter, userId, tradeId, status.brokerOrderId);

  await publishOrderEvent(userId, {
    type: "order.confirmed",
    tradeId,
    data: status,
  });

  if (signal) {
    await prisma.signal.update({
      where: { id: signal.id },
      data: { status: status.status === "filled" ? "filled" : "staged" },
    });
  }

  return updated;
}

export async function cancelOrder(
  userId: string,
  tradeId: string
): Promise<void> {
  const trade = await prisma.trade.findUnique({ where: { id: tradeId } });
  if (!trade) throw new Error(`trade ${tradeId} not found`);
  if (trade.userId !== userId) throw new Error("trade does not belong to user");
  if (!trade.brokerOrderId) {
    await prisma.trade.update({
      where: { id: tradeId },
      data: { brokerStatus: "cancelled", closedAt: new Date() },
    });
    await publishOrderEvent(userId, { type: "order.cancel", tradeId });
    return;
  }

  const adapter = await brokerAdapter();
  await adapter.cancelOrder(trade.brokerOrderId);
  await prisma.trade.update({
    where: { id: tradeId },
    data: { brokerStatus: "cancelled", closedAt: new Date() },
  });
  await publishOrderEvent(userId, { type: "order.cancel", tradeId });
}

/** Cancel every working order for this user. Returns count cancelled. */
export async function cancelAll(userId: string): Promise<number> {
  const adapter = await brokerAdapter();
  const brokerCount = await adapter.cancelAll();
  const open = await prisma.trade.findMany({
    where: {
      userId,
      brokerStatus: { in: ["submitted", "partial", "staged"] },
      closedAt: null,
    },
  });
  if (open.length > 0) {
    await prisma.$transaction(
      open.map((t) =>
        prisma.trade.update({
          where: { id: t.id },
          data: { brokerStatus: "cancelled", closedAt: new Date() },
        })
      )
    );
    for (const t of open) {
      await publishOrderEvent(userId, { type: "order.cancel", tradeId: t.id });
    }
  }
  return Math.max(brokerCount, open.length);
}

/**
 * Flatten every live position with opposite-side market orders. Returns
 * the count of positions for which a closing order was successfully sent.
 */
export async function flattenAll(userId: string): Promise<number> {
  const adapter = await brokerAdapter();
  const positions = await adapter.getPositions();
  let closed = 0;
  for (const pos of positions) {
    if (pos.qty === 0) continue;
    const closingSide: "buy" | "sell" = pos.qty > 0 ? "sell" : "buy";
    const qty = Math.abs(pos.qty);
    const last = pos.marketPrice ?? pos.avgCost;
    // OCA bracket children still required by adapter contract; pick wide
    // bands so they never trigger before the parent market entry fills.
    const tp = closingSide === "sell" ? last * 0.5 : last * 1.5;
    const sl = closingSide === "sell" ? last * 1.5 : last * 0.5;
    const bracket: BracketOrder = {
      symbol: pos.symbol,
      side: closingSide,
      qty,
      entryType: "market",
      takeProfit: tp,
      stopLoss: sl,
      tif: "DAY",
    };
    try {
      const status = await adapter.placeBracket(bracket);
      const matching = await prisma.trade.findMany({
        where: { userId, ticker: pos.symbol, closedAt: null },
      });
      for (const t of matching) {
        await prisma.trade.update({
          where: { id: t.id },
          data: { brokerStatus: "cancelled", closedAt: new Date() },
        });
        await publishOrderEvent(userId, {
          type: "order.cancel",
          tradeId: t.id,
          data: { reason: "flatten", broker: status },
        });
      }
      closed += 1;
    } catch {
      /* keep iterating */
    }
  }
  try {
    await publishPositionUpdate(userId, await adapter.getPositions());
  } catch {
    /* publish failure is not fatal */
  }
  return closed;
}

export async function listStagedOrders(userId: string): Promise<Trade[]> {
  return prisma.trade.findMany({
    where: {
      userId,
      brokerStatus: { in: ["staged", "submitted", "partial"] },
      closedAt: null,
    },
    orderBy: { openedAt: "desc" },
  });
}

/**
 * Live positions when the broker is connected; falls back to a Trade-row
 * derived view when disconnected so the UI never goes blank.
 */
export async function listOpenPositions(
  userId: string
): Promise<OpenPositionsResult> {
  const asOf = new Date().toISOString();
  try {
    const adapter = getBrokerAdapter({
      host: env.IBKR_HOST,
      port: env.IBKR_PORT,
      clientId: env.IBKR_CLIENT_ID,
      mode: env.IBKR_MODE,
    });
    if (adapter.isConnected()) {
      const positions = await adapter.getPositions();
      return { positions, asOf, source: "broker" };
    }
  } catch {
    /* fallthrough */
  }

  // DB fallback: aggregate open trades by symbol.
  const open = await prisma.trade.findMany({
    where: {
      userId,
      closedAt: null,
      brokerStatus: { in: ["submitted", "filled", "partial"] },
    },
  });
  const bySymbol = new Map<string, Position>();
  for (const t of open) {
    const symbol = t.ticker;
    const signed = t.side === "buy" ? t.qty : -t.qty;
    const filled = t.filledQty || signed;
    const existing = bySymbol.get(symbol);
    if (existing) {
      const totalQty = existing.qty + filled;
      if (totalQty !== 0 && t.entryPrice != null) {
        existing.avgCost =
          (existing.avgCost * existing.qty + t.entryPrice * filled) / totalQty;
      }
      existing.qty = totalQty;
    } else {
      bySymbol.set(symbol, {
        symbol,
        qty: filled,
        avgCost: t.entryPrice ?? 0,
      });
    }
  }
  const positions = Array.from(bySymbol.values()).filter((p) => p.qty !== 0);
  return { positions, asOf, source: "cache" };
}
