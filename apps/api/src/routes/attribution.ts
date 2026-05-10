import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@trader/db";

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const RangeQuery = z.object({
  from: DateStr.optional(),
  to: DateStr.optional(),
});

interface BucketAccumulator {
  count: number;
  totalPnl: number;
  wins: number;
  losses: number;
  pnls: number[];
}

interface BucketOut {
  count: number;
  totalPnl: number;
  avgPnl: number;
  winRate: number;
  sharpe?: number;
}

function emptyBucket(): BucketAccumulator {
  return { count: 0, totalPnl: 0, wins: 0, losses: 0, pnls: [] };
}

function pushPnl(b: BucketAccumulator, pnl: number): void {
  b.count += 1;
  b.totalPnl += pnl;
  b.pnls.push(pnl);
  if (pnl > 0) b.wins += 1;
  else if (pnl < 0) b.losses += 1;
}

function finalize(b: BucketAccumulator): BucketOut {
  const closed = b.wins + b.losses; // exclude scratches from win-rate denominator
  const avgPnl = b.count > 0 ? b.totalPnl / b.count : 0;
  const winRate = closed > 0 ? b.wins / closed : 0;
  let sharpe: number | undefined;
  if (b.pnls.length >= 2) {
    const mean = avgPnl;
    let sse = 0;
    for (const p of b.pnls) sse += (p - mean) ** 2;
    const std = Math.sqrt(sse / (b.pnls.length - 1));
    if (std > 0) sharpe = mean / std;
  }
  const out: BucketOut = {
    count: b.count,
    totalPnl: b.totalPnl,
    avgPnl,
    winRate,
  };
  if (sharpe !== undefined) out.sharpe = sharpe;
  return out;
}

function resolveRange(
  data: z.infer<typeof RangeQuery>
): { from: Date; to: Date } {
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 90);
  const from = data.from ? new Date(data.from) : defaultFrom;
  const to = data.to ? new Date(data.to) : now;
  return { from, to };
}

export async function attributionRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  // Aggregate by tag. Tags are pulled from BOTH Trade.tags and the linked
  // JournalEntry.tags. PnL is attributed once per trade to each unique tag
  // it carries (a trade with two tags counts once in each bucket).
  app.get("/by-tag", async (req, reply) => {
    const query = RangeQuery.safeParse(req.query);
    if (!query.success) {
      return reply.code(400).send({ error: query.error.flatten() });
    }
    const { from, to } = resolveRange(query.data);

    const trades = await prisma.trade.findMany({
      where: {
        userId: req.userId,
        openedAt: { gte: from, lte: to },
        pnl: { not: null },
      },
      include: { journal: { select: { tags: true } } },
    });

    const buckets = new Map<string, BucketAccumulator>();
    for (const t of trades) {
      if (t.pnl == null) continue;
      const tagSet = new Set<string>();
      for (const tag of t.tags) tagSet.add(tag);
      if (t.journal) for (const tag of t.journal.tags) tagSet.add(tag);
      if (tagSet.size === 0) tagSet.add("untagged");
      for (const tag of tagSet) {
        const b = buckets.get(tag) ?? emptyBucket();
        pushPnl(b, t.pnl);
        buckets.set(tag, b);
      }
    }

    const out = Array.from(buckets.entries())
      .map(([tag, b]) => ({ tag, ...finalize(b) }))
      .sort((a, b) => b.totalPnl - a.totalPnl);

    return { buckets: out };
  });

  // Aggregate by ticker.sector (from the Ticker static-info cache).
  app.get("/by-sector", async (req, reply) => {
    const query = RangeQuery.safeParse(req.query);
    if (!query.success) {
      return reply.code(400).send({ error: query.error.flatten() });
    }
    const { from, to } = resolveRange(query.data);

    const trades = await prisma.trade.findMany({
      where: {
        userId: req.userId,
        openedAt: { gte: from, lte: to },
        pnl: { not: null },
      },
      select: { ticker: true, pnl: true },
    });

    const symbols = Array.from(new Set(trades.map((t) => t.ticker)));
    const tickerRows = symbols.length
      ? await prisma.ticker.findMany({
          where: { symbol: { in: symbols } },
          select: { symbol: true, sector: true },
        })
      : [];
    const sectorBySymbol = new Map<string, string>();
    for (const t of tickerRows) {
      sectorBySymbol.set(t.symbol, t.sector ?? "unknown");
    }

    const buckets = new Map<string, BucketAccumulator>();
    for (const t of trades) {
      if (t.pnl == null) continue;
      const sector = sectorBySymbol.get(t.ticker) ?? "unknown";
      const b = buckets.get(sector) ?? emptyBucket();
      pushPnl(b, t.pnl);
      buckets.set(sector, b);
    }

    const out = Array.from(buckets.entries())
      .map(([sector, b]) => ({ sector, ...finalize(b) }))
      .sort((a, b) => b.totalPnl - a.totalPnl);

    return { buckets: out };
  });

  // Aggregate by Signal.holdPeriod (intraday/swing/position) for trades
  // that originated from a Signal.
  app.get("/by-hold-period", async (req, reply) => {
    const query = RangeQuery.safeParse(req.query);
    if (!query.success) {
      return reply.code(400).send({ error: query.error.flatten() });
    }
    const { from, to } = resolveRange(query.data);

    const trades = await prisma.trade.findMany({
      where: {
        userId: req.userId,
        openedAt: { gte: from, lte: to },
        pnl: { not: null },
      },
      include: { signal: { select: { holdPeriod: true } } },
    });

    const buckets = new Map<string, BucketAccumulator>();
    for (const t of trades) {
      if (t.pnl == null) continue;
      const hold = t.signal?.holdPeriod ?? "unknown";
      const b = buckets.get(hold) ?? emptyBucket();
      pushPnl(b, t.pnl);
      buckets.set(hold, b);
    }

    const out = Array.from(buckets.entries())
      .map(([holdPeriod, b]) => ({ holdPeriod, ...finalize(b) }))
      .sort((a, b) => b.totalPnl - a.totalPnl);

    return { buckets: out };
  });

  // Aggregate by Signal.llmProvider + Signal.llmModel — accuracy comparison.
  app.get("/by-llm", async (req, reply) => {
    const query = RangeQuery.safeParse(req.query);
    if (!query.success) {
      return reply.code(400).send({ error: query.error.flatten() });
    }
    const { from, to } = resolveRange(query.data);

    const trades = await prisma.trade.findMany({
      where: {
        userId: req.userId,
        openedAt: { gte: from, lte: to },
        pnl: { not: null },
      },
      include: {
        signal: { select: { llmProvider: true, llmModel: true } },
      },
    });

    const buckets = new Map<
      string,
      { provider: string; model: string; acc: BucketAccumulator }
    >();
    for (const t of trades) {
      if (t.pnl == null) continue;
      if (!t.signal) continue; // exclude manual trades
      const provider = t.signal.llmProvider;
      const model = t.signal.llmModel;
      const key = `${provider}::${model}`;
      const entry =
        buckets.get(key) ?? { provider, model, acc: emptyBucket() };
      pushPnl(entry.acc, t.pnl);
      buckets.set(key, entry);
    }

    const out = Array.from(buckets.values())
      .map(({ provider, model, acc }) => ({
        llmProvider: provider,
        llmModel: model,
        ...finalize(acc),
      }))
      .sort((a, b) => b.totalPnl - a.totalPnl);

    return { buckets: out };
  });
}
