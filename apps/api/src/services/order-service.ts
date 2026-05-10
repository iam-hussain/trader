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
    userId: z.string().min(1),
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

// ── helpers ──────────────────────────────────────────────────────────────

/** Pure mapping from a Signal row to the BracketOrder the broker expects. */
export function mapSignalToBracket(signal: Signal): BracketOrder {
  const side: "buy" | "sell" = signal.direction === "long" ? "buy" : "sell";
  const base = {
    symbol: signal.ticker,
    side,
    qty: signal.qty,
    entryType: "limit" as const,
    entryPrice: signal.entry,
    takeProfit: signal.target1,
    stopLoss: signal.stop,
    tif: "DAY" as const,
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
    const expiry = leg.expiry ?? "";
    const strike = leg.strike ?? 0;
    return {
      ...base,
      option: { expiry, strike, right },
    };
  }
  return base;
}

/** Map a Trade row → BracketOrder (for manual / non-signal orders). */
function mapTradeToBracket(trade: Trade, optionLeg?: BracketOrder["option"]): BracketOrder {
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

async function getAdapter(): Promise<BrokerAdapter> {
  return getBrokerAdapter({
    host: env.IBKR_HOST,
    port: env.IBKR_PORT,
    clientId: env.IBKR_CLIENT_ID,
    mode: env.IBKR_MODE,
  });
}

/** Subscribe to an adapter's orderStatus stream and persist updates. */
function attachOrderListener(
  adapter: BrokerAdapter,
  userId: string,
  tradeId: string,
  brokerOrderId: string
): void {
  // adapter is also an EventEmitter — guard for non-emitter adapters in tests.
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
    if (status.status === "filled") {
      data.openedAt = new Date();
    }
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
      /* swallow — listener must not crash the adapter */
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
export async function stageOrder(input: StageOrderInput): Promise<Trade> {
  const parsed = StageOrderInputSchema.parse(input);

  if (parsed.signalId) {
    const trade = await prisma.$transaction(async (tx) => {
      const signal = await tx.signal.findUnique({
        where: { id: parsed.signalId! },
      });
      if (!signal) throw new Error(`signal ${parsed.signalId} not found`);
      if (signal.userId !== parsed.userId) {
        throw new Error("signal does not belong to user");
      }
      const created = await tx.trade.create({
        data: {
          userId: parsed.userId,
          signalId: signal.id,
          ticker: signal.ticker,
          side: signal.direction === "long" ? "buy" : "sell",
          qty: parsed.qty ?? signal.qty,
          entryPrice: parsed.entryPrice ?? signal.entry,
          targetPrice: signal.target1,
          stopPrice: signal.stop,
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

    // Best-effort: attach the floating journal entry.
    try {
      await attachToTrade(trade.id, parsed.signalId);
    } catch {
      /* ignore journal binding errors */
    }
    await publishOrderEvent(parsed.userId, { type: "order.staged", tradeId: trade.id });
    return trade;
  }

  // raw mode — guard already by zod refine
  const trade = await prisma.trade.create({
    data: {
      userId: parsed.userId,
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
  await publishOrderEvent(parsed.userId, { type: "order.staged", tradeId: trade.id });
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
  const tradeForOrder: Trade =
    finalQty === trade.qty ? trade : { ...trade, qty: finalQty };

  // 2. Build bracket. If linked signal is an option, carry the leg through.
  let bracket: BracketOrder;
  if (trade.signalId) {
    const signal = await prisma.signal.findUnique({
      where: { id: trade.signalId },
    });
    if (!signal) throw new Error(`linked signal ${trade.signalId} missing`);
    bracket = mapSignalToBracket({ ...signal, qty: finalQty });
    // Override prices from the (possibly user-tweaked) trade row.
    if (trade.entryPrice != null) bracket.entryPrice = trade.entryPrice;
    if (trade.targetPrice != null) bracket.takeProfit = trade.targetPrice;
    if (trade.stopPrice != null) bracket.stopLoss = trade.stopPrice;
  } else {
    bracket = mapTradeToBracket(tradeForOrder);
  }

  // 3. Send to broker.
  const adapter = await getAdapter();
  let status: BrokerOrderStatus;
  try {
    status = await adapter.placeBracket(bracket);
  } catch (err) {
    // Rollback to staged so the user can retry.
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

  // If the linked signal exists, mark as filled-pending.
  if (trade.signalId) {
    await prisma.signal.update({
      where: { id: trade.signalId },
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
    // Wasn't submitted — just mark staged → cancelled.
    await prisma.trade.update({
      where: { id: tradeId },
      data: { brokerStatus: "cancelled", closedAt: new Date() },
    });
    await publishOrderEvent(userId, { type: "order.cancel", tradeId });
    return;
  }

  const adapter = await getAdapter();
  await adapter.cancelOrder(trade.brokerOrderId);
  await prisma.trade.update({
    where: { id: tradeId },
    data: { brokerStatus: "cancelled", closedAt: new Date() },
  });
  await publishOrderEvent(userId, { type: "order.cancel", tradeId });
}

export async function cancelAll(userId: string): Promise<{ cancelled: number }> {
  const adapter = await getAdapter();
  const cancelled = await adapter.cancelAll();
  const open = await prisma.trade.findMany({
    where: {
      userId,
      brokerStatus: { in: ["submitted", "partial", "staged"] },
      closedAt: null,
    },
  });
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
  return { cancelled: Math.max(cancelled, open.length) };
}

/**
 * Flatten every live position by submitting opposite-side market orders.
 * Sized to fully close (abs(qty) of the broker position). Updates the
 * matching open Trade rows when we can find them.
 */
export async function flattenAll(userId: string): Promise<{ closed: number }> {
  const adapter = await getAdapter();
  const positions = await adapter.getPositions();
  let closed = 0;
  for (const pos of positions) {
    if (pos.qty === 0) continue;
    const closingSide: "buy" | "sell" = pos.qty > 0 ? "sell" : "buy";
    const qty = Math.abs(pos.qty);
    // Synthesize a tight protective bracket. Take-profit and stop are set
    // far apart with a market entry so the parent fires immediately and
    // the OCA children act as paper protections; for a flatten we mostly
    // care about the parent fill.
    const last = pos.marketPrice ?? pos.avgCost;
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
      // Best-effort: locate matching open trade rows by ticker and mark closed.
      const matching = await prisma.trade.findMany({
        where: { userId, ticker: pos.symbol, closedAt: null },
      });
      for (const t of matching) {
        await prisma.trade.update({
          where: { id: t.id },
          data: {
            brokerStatus: "cancelled",
            closedAt: new Date(),
          },
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
  await publishPositionUpdate(userId, await adapter.getPositions());
  return { closed };
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
export async function listOpenPositions(userId: string): Promise<Position[]> {
  try {
    const adapter = await getAdapter();
    if (adapter.isConnected()) {
      const positions = await adapter.getPositions();
      return positions;
    }
  } catch {
    /* fallthrough */
  }
  // DB fallback.
  const open = await prisma.trade.findMany({
    where: { userId, closedAt: null, brokerStatus: { in: ["submitted", "filled", "partial"] } },
  });
  const bySymbol = new Map<string, Position>();
  for (const t of open) {
    const symbol = t.ticker;
    const signed = t.side === "buy" ? t.qty : -t.qty;
    const filled = t.filledQty || signed;
    const existing = bySymbol.get(symbol);
    if (existing) {
      // Weighted-avg cost.
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
  return Array.from(bySymbol.values()).filter((p) => p.qty !== 0);
}
