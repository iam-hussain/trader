import type { Trade } from "@trader/db";
import { prisma } from "@trader/db";
import type { RiskCheckResult, TradeSignal } from "@trader/schemas";
import {
  aggregateRiskState,
  checkRisk,
  type RiskLimitsInput,
} from "../services/risk-engine.js";

export type TradeForRisk = Pick<
  Trade,
  | "qty"
  | "entryPrice"
  | "stopPrice"
  | "targetPrice"
  | "ticker"
  | "side"
  | "signalId"
>;

export class RiskError extends Error {
  readonly kind = "risk_error" as const;
  constructor(public readonly result: RiskCheckResult, message?: string) {
    super(message ?? `risk check failed: ${result.reasons.join(",")}`);
    this.name = "RiskError";
  }
}

/**
 * Run the authoritative server-side risk check. ALWAYS invoked on
 * confirmOrder regardless of UI input — the UI's pre-check is only a
 * convenience preview. Throws RiskError when allowed=false; returns the
 * RiskCheckResult on success (which may include `adjustedQty`).
 */
export async function runRiskCheck(
  userId: string,
  trade: TradeForRisk,
  now: Date = new Date()
): Promise<RiskCheckResult> {
  const setting = await prisma.setting.findUnique({ where: { userId } });
  const limits: RiskLimitsInput = {
    maxRiskPerTradePct: setting?.maxRiskPerTradePct ?? 1.0,
    maxDailyLossPct: setting?.maxDailyLossPct ?? 3.0,
    maxTradesPerDay: setting?.maxTradesPerDay ?? 5,
    blackoutMacroEvents: setting?.blackoutMacroEvents ?? true,
    blackoutMinutes: setting?.blackoutMinutes ?? 30,
  };

  const signal = trade.signalId
    ? await prisma.signal.findUnique({ where: { id: trade.signalId } })
    : null;

  // Build the TradeSignal-shaped object the risk engine expects. If we have
  // the source signal, prefer its values; otherwise synthesize from the
  // staged trade row (confidence defaults to 0.6 — neutral Kelly).
  const tradeSignal = {
    ticker: trade.ticker,
    direction: trade.side === "buy" ? "long" : "short",
    instrument: signal?.instrument ?? "stock",
    entry: trade.entryPrice ?? signal?.entry ?? 0,
    target1: trade.targetPrice ?? signal?.target1 ?? 0,
    stop: trade.stopPrice ?? signal?.stop ?? 0,
    qty: trade.qty,
    riskReward: signal?.riskReward ?? 1,
    confidence: signal?.confidence ?? 0.6,
    holdPeriod: (signal?.holdPeriod ?? "swing") as "intraday" | "swing" | "position",
    thesis: signal?.thesis ?? "manual order",
    signals: signal?.signals ?? [],
    catalysts: signal?.catalysts ?? [],
    optionLeg:
      signal?.optionLeg && typeof signal.optionLeg === "object"
        ? (signal.optionLeg as TradeSignal["optionLeg"])
        : undefined,
  } as TradeSignal;

  const state = await aggregateRiskState(userId);
  const result = checkRisk(tradeSignal, state, limits, now);
  if (!result.allowed) {
    throw new RiskError(result);
  }
  return result;
}
