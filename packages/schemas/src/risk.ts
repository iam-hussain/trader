import { z } from "zod";

export const RiskLimits = z.object({
  accountSizeUsd: z.number().positive(),
  maxRiskPerTradePct: z.number().min(0).max(10),
  maxDailyLossPct: z.number().min(0).max(20),
  maxTradesPerDay: z.number().int().min(1).max(50),
  blackoutMacroEvents: z.boolean(),
  blackoutMinutes: z.number().int().min(0).max(120),
});
export type RiskLimits = z.infer<typeof RiskLimits>;

export const RiskCheckResult = z.object({
  allowed: z.boolean(),
  reasons: z.array(z.string()).default([]),
  adjustedQty: z.number().int().nonnegative().optional(),
});
export type RiskCheckResult = z.infer<typeof RiskCheckResult>;
