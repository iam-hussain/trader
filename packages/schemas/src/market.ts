import { z } from "zod";

export const Quote = z.object({
  symbol: z.string(),
  price: z.number(),
  change: z.number(),
  changePct: z.number(),
  volume: z.number().nonnegative(),
  open: z.number().optional(),
  high: z.number().optional(),
  low: z.number().optional(),
  prevClose: z.number().optional(),
  marketCap: z.number().optional(),
  asOf: z.string(),
});
export type Quote = z.infer<typeof Quote>;

export const NewsArticle = z.object({
  source: z.string(),
  url: z.string().url(),
  title: z.string(),
  publishedAt: z.string(),
  summary: z.string().optional(),
  sentiment: z.enum(["positive", "neutral", "negative"]).optional(),
  sentimentScore: z.number().min(-1).max(1).optional(),
  tickers: z.array(z.string()).default([]),
});
export type NewsArticle = z.infer<typeof NewsArticle>;

export const PutCallSnapshot = z.object({
  symbol: z.string().optional(), // omit for market-wide (CBOE total)
  ratio: z.number(),
  callVolume: z.number().nonnegative().optional(),
  putVolume: z.number().nonnegative().optional(),
  callOI: z.number().nonnegative().optional(),
  putOI: z.number().nonnegative().optional(),
  source: z.string(),
  asOf: z.string(),
});
export type PutCallSnapshot = z.infer<typeof PutCallSnapshot>;

export const OptionsSnapshot = z.object({
  symbol: z.string(),
  ivRank: z.number().min(0).max(100).optional(),
  ivPercentile: z.number().min(0).max(100).optional(),
  maxPain: z.number().optional(),
  putCall: z.array(PutCallSnapshot),
  unusualActivity: z
    .array(
      z.object({
        type: z.enum(["sweep", "block"]),
        side: z.enum(["call", "put"]),
        strike: z.number(),
        expiry: z.string(),
        size: z.number(),
        premium: z.number(),
        bidAsk: z.enum(["above_ask", "at_ask", "midpoint", "at_bid", "below_bid"]),
        asOf: z.string(),
      })
    )
    .default([]),
});
export type OptionsSnapshot = z.infer<typeof OptionsSnapshot>;
