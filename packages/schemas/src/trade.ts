import { z } from "zod";

export const Direction = z.enum(["long", "short"]);
export const Instrument = z.enum(["stock", "option"]);
export const HoldPeriod = z.enum(["intraday", "swing", "position"]);
export const OptionType = z.enum(["call", "put"]);

export const OptionLeg = z.object({
  type: OptionType,
  strike: z.number().positive(),
  expiry: z.string().describe("ISO date YYYY-MM-DD"),
  bid: z.number().nonnegative().optional(),
  ask: z.number().nonnegative().optional(),
  iv: z.number().nonnegative().optional(),
  delta: z.number().min(-1).max(1).optional(),
  gamma: z.number().optional(),
  theta: z.number().optional(),
  vega: z.number().optional(),
});
export type OptionLeg = z.infer<typeof OptionLeg>;

/**
 * The structured output the LLM must produce. Every signal is validated
 * against this — anything that doesn't parse is rejected.
 */
export const TradeSignal = z
  .object({
    ticker: z.string().regex(/^[A-Z][A-Z0-9.\-]{0,9}$/),
    direction: Direction,
    instrument: Instrument,
    entry: z.number().positive(),
    target1: z.number().positive(),
    target2: z.number().positive().optional(),
    stop: z.number().positive(),
    qty: z.number().int().positive(),
    riskReward: z.number().positive(),
    confidence: z.number().min(0).max(1),
    holdPeriod: HoldPeriod,
    thesis: z.string().min(20).max(2000),
    signals: z.array(z.string()).default([]),
    catalysts: z.array(z.string()).default([]),
    invalidation: z.string().optional(),
    optionLeg: OptionLeg.optional(),
  })
  .superRefine((s, ctx) => {
    // Stop must be on the protective side of entry.
    if (s.direction === "long" && s.stop >= s.entry) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Long stop must be below entry",
        path: ["stop"],
      });
    }
    if (s.direction === "short" && s.stop <= s.entry) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Short stop must be above entry",
        path: ["stop"],
      });
    }
    // Target must be on the profit side.
    if (s.direction === "long" && s.target1 <= s.entry) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Long target1 must be above entry",
        path: ["target1"],
      });
    }
    if (s.direction === "short" && s.target1 >= s.entry) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Short target1 must be below entry",
        path: ["target1"],
      });
    }
    if (s.instrument === "option" && !s.optionLeg) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "optionLeg required when instrument=option",
        path: ["optionLeg"],
      });
    }
  });
export type TradeSignal = z.infer<typeof TradeSignal>;

export const TradeSignalArray = z.array(TradeSignal);
