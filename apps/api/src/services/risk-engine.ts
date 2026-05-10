import { z } from "zod";
import { prisma } from "@trader/db";
import { TradeSignal, RiskCheckResult } from "@trader/schemas";
import { getUpcomingMacroEvents, isInBlackout } from "./macro-events.js";

export interface RiskState {
  accountSizeUsd: number;
  todayRealizedPnl: number;
  tradesPlacedToday: number;
  exposurePct: number;
  openPositionsBySector: Record<string, number>;
}

export interface RiskLimitsInput {
  maxRiskPerTradePct: number;
  maxDailyLossPct: number;
  maxTradesPerDay: number;
  blackoutMacroEvents: boolean;
  blackoutMinutes: number;
}

export interface SizedSignal {
  signal: z.infer<typeof TradeSignal>;
  qty: number;
  riskUsd: number;
  /** Risk as % of account, post-Kelly adjustment. */
  riskPct: number;
}

/**
 * Confidence-weighted Kelly multiplier applied to the base risk budget.
 *   confidence >= 0.7  → 1.25x  (high-conviction setups get up to 25% more risk)
 *   confidence <  0.5  → 0.5x   (low-conviction setups halved)
 *   otherwise          → 1.0x
 */
function kellyMultiplier(confidence: number): number {
  if (confidence >= 0.7) return 1.25;
  if (confidence < 0.5) return 0.5;
  return 1.0;
}

/**
 * Size a position based on account size, max risk %, and the signal's
 * stop distance. Stocks size by stop-loss; options by premium-at-risk
 * (the entry premium times 100 multiplier IS the max loss when long
 * a defined-risk option held to expiry).
 */
export function sizePosition(
  signal: z.infer<typeof TradeSignal>,
  account: number,
  maxRiskPerTradePct: number
): SizedSignal {
  const mult = kellyMultiplier(signal.confidence);
  const riskBudget = account * (maxRiskPerTradePct / 100) * mult;

  if (signal.instrument === "option") {
    const perContract = signal.entry * 100; // $/contract
    if (perContract <= 0) {
      return { signal, qty: 0, riskUsd: 0, riskPct: 0 };
    }
    const qty = Math.floor(riskBudget / perContract);
    const riskUsd = qty * perContract;
    return {
      signal,
      qty,
      riskUsd,
      riskPct: account > 0 ? (riskUsd / account) * 100 : 0,
    };
  }

  // Stocks: shares = floor(budget / |entry - stop|)
  const stopDist = Math.abs(signal.entry - signal.stop);
  if (stopDist <= 0) {
    return { signal, qty: 0, riskUsd: 0, riskPct: 0 };
  }
  const qty = Math.floor(riskBudget / stopDist);
  const riskUsd = qty * stopDist;
  return {
    signal,
    qty,
    riskUsd,
    riskPct: account > 0 ? (riskUsd / account) * 100 : 0,
  };
}

/**
 * Validate a signal against current risk state. Rules are evaluated in
 * priority order — the first hard-stop reached produces a rejection.
 */
export function checkRisk(
  signal: z.infer<typeof TradeSignal>,
  state: RiskState,
  limits: RiskLimitsInput,
  now: Date = new Date()
): z.infer<typeof RiskCheckResult> {
  const reasons: string[] = [];

  // 1. Daily-loss cap.
  const maxDailyLossUsd = state.accountSizeUsd * (limits.maxDailyLossPct / 100);
  if (state.todayRealizedPnl <= -maxDailyLossUsd) {
    reasons.push("max_daily_loss");
    return { allowed: false, reasons };
  }

  // 2. Trades-per-day cap.
  if (state.tradesPlacedToday >= limits.maxTradesPerDay) {
    reasons.push("max_trades_per_day");
    return { allowed: false, reasons };
  }

  // 3. Macro blackout window.
  if (limits.blackoutMacroEvents) {
    const upcoming = getUpcomingMacroEvents(now);
    const window = isInBlackout(now, limits.blackoutMinutes, upcoming);
    if (window.inBlackout && window.event) {
      reasons.push(`blackout:${window.event.kind}`);
      return { allowed: false, reasons };
    }
  }

  // 4. Size the position.
  const sized = sizePosition(signal, state.accountSizeUsd, limits.maxRiskPerTradePct);
  if (sized.qty <= 0) {
    reasons.push("stop_distance_zero");
    return { allowed: false, reasons };
  }

  // 5. Sanity-cap: the post-Kelly riskPct should never exceed
  //    maxRiskPerTradePct * 1.25 (the largest Kelly multiplier). If it does
  //    (e.g. due to rounding / option premium granularity), trim qty.
  const ceilingPct = limits.maxRiskPerTradePct * 1.25;
  if (sized.riskPct > ceilingPct) {
    const ceilingUsd = state.accountSizeUsd * (ceilingPct / 100);
    let adjustedQty: number;
    if (signal.instrument === "option") {
      const perContract = signal.entry * 100;
      adjustedQty = Math.floor(ceilingUsd / perContract);
    } else {
      const stopDist = Math.abs(signal.entry - signal.stop);
      adjustedQty = Math.floor(ceilingUsd / stopDist);
    }
    if (adjustedQty <= 0) {
      reasons.push("qty_capped", "stop_distance_zero");
      return { allowed: false, reasons };
    }
    reasons.push("qty_capped");
    return { allowed: true, reasons, adjustedQty };
  }

  // 6. Allowed (qty differs from signal.qty if Kelly adjusted it).
  if (sized.qty !== signal.qty) {
    return { allowed: true, reasons: ["qty_resized"], adjustedQty: sized.qty };
  }
  return { allowed: true, reasons: [], adjustedQty: sized.qty };
}

/**
 * Compute "today" boundary in US Eastern time, expressed as a UTC instant.
 * This is the most recent midnight ET. We approximate ET as UTC-5 (EST)
 * outside DST and UTC-4 (EDT) during DST. For the daily-reset boundary the
 * one-hour DST jitter is acceptable (no boundary-sensitive logic depends
 * on the exact second).
 */
function midnightEtUtc(now: Date): Date {
  // US DST: second Sunday of March 02:00 → first Sunday of November 02:00.
  const y = now.getUTCFullYear();
  const dstStart = nthWeekdayUtc(y, 2 /* Mar */, 0 /* Sun */, 2);
  const dstEnd = nthWeekdayUtc(y, 10 /* Nov */, 0 /* Sun */, 1);
  const inDst = now.getTime() >= dstStart.getTime() && now.getTime() < dstEnd.getTime();
  const offsetHours = inDst ? 4 : 5; // ET is UTC - offsetHours
  // Convert now to ET wall-clock by subtracting the offset.
  const etNow = new Date(now.getTime() - offsetHours * 60 * 60 * 1000);
  // Truncate ET wall-clock to midnight (UTC fields on shifted date == ET).
  const etMidnight = Date.UTC(
    etNow.getUTCFullYear(),
    etNow.getUTCMonth(),
    etNow.getUTCDate(),
    0,
    0,
    0,
    0
  );
  // Convert back to true UTC.
  return new Date(etMidnight + offsetHours * 60 * 60 * 1000);
}

function nthWeekdayUtc(year: number, monthIdx: number, weekday: number, n: number): Date {
  // monthIdx 0..11; weekday 0=Sun..6=Sat; n=1..5
  const first = new Date(Date.UTC(year, monthIdx, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  const day = 1 + offset + (n - 1) * 7;
  return new Date(Date.UTC(year, monthIdx, day, 7, 0, 0, 0)); // 02:00 ET ≈ 07:00 UTC
}

/** Materialize today's RiskState from Prisma (Trades table). */
export async function aggregateRiskState(userId: string): Promise<RiskState> {
  const setting = await prisma.setting.findUnique({ where: { userId } });
  const accountSizeUsd = setting?.accountSizeUsd ?? 25000;

  const sinceUtc = midnightEtUtc(new Date());
  const todayTrades = await prisma.trade.findMany({
    where: { userId, openedAt: { gte: sinceUtc } },
  });

  let todayRealizedPnl = 0;
  for (const t of todayTrades) {
    if (t.pnl != null) todayRealizedPnl += t.pnl;
  }

  // Open positions: trades with no closedAt.
  const openTrades = await prisma.trade.findMany({
    where: { userId, closedAt: null },
  });

  // Sector lookups (ticker → sector). Single query keyed by ticker set.
  const tickerSet = Array.from(new Set(openTrades.map((t) => t.ticker)));
  const tickers = tickerSet.length
    ? await prisma.ticker.findMany({ where: { symbol: { in: tickerSet } } })
    : [];
  const sectorByTicker = new Map(tickers.map((t) => [t.symbol, t.sector ?? "unknown"]));

  const openPositionsBySector: Record<string, number> = {};
  let exposureUsd = 0;
  for (const t of openTrades) {
    const sector = sectorByTicker.get(t.ticker) ?? "unknown";
    openPositionsBySector[sector] = (openPositionsBySector[sector] ?? 0) + 1;
    if (t.entryPrice != null) {
      exposureUsd += t.entryPrice * t.qty;
    }
  }
  const exposurePct = accountSizeUsd > 0 ? (exposureUsd / accountSizeUsd) * 100 : 0;

  return {
    accountSizeUsd,
    todayRealizedPnl,
    tradesPlacedToday: todayTrades.length,
    exposurePct,
    openPositionsBySector,
  };
}
