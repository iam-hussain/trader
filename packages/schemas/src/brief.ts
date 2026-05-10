import { z } from "zod";
import { TradeSignal } from "./trade";

export const Session = z.enum(["premarket", "midday", "postmarket"]);
export type Session = z.infer<typeof Session>;

export const MarketRegime = z.enum(["risk-on", "neutral", "risk-off"]);
export type MarketRegime = z.infer<typeof MarketRegime>;

export const MacroSnapshot = z.object({
  vix: z.number(),
  vixChange: z.number(),
  spyPct: z.number(),
  qqqPct: z.number(),
  yield10y: z.number().optional(),
  dxy: z.number().optional(),
  goldPct: z.number().optional(),
  fearGreed: z.number().min(0).max(100).optional(),
});

export const Brief = z.object({
  date: z.string(),
  session: Session,
  marketRegime: MarketRegime,
  macro: MacroSnapshot,
  summary: z.string(),
  signals: z.array(TradeSignal),
  warnings: z.array(z.string()).default([]),
  llmProvider: z.string(),
  llmModel: z.string(),
});
export type Brief = z.infer<typeof Brief>;
