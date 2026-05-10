import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@trader/db";

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const ListQuery = z.object({
  from: DateStr.optional(),
  to: DateStr.optional(),
  tag: z.string().min(1).max(50).optional(),
  outcome: z.enum(["win", "loss", "scratch"]).optional(),
});

const PatchBody = z.object({
  thesis: z.string().max(10_000).optional(),
  outcome: z.enum(["win", "loss", "scratch"]).optional(),
  lessons: z.string().max(10_000).optional(),
  screenshots: z.array(z.string().url()).optional(),
  tags: z.array(z.string().min(1).max(50)).optional(),
});

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

export async function journalRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  // List entries (default last 90 days)
  app.get("/", async (req, reply) => {
    const query = ListQuery.safeParse(req.query);
    if (!query.success) {
      return reply.code(400).send({ error: query.error.flatten() });
    }

    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 90);

    const from = query.data.from ? new Date(query.data.from) : defaultFrom;
    const to = query.data.to ? new Date(query.data.to) : now;

    const entries = await prisma.journalEntry.findMany({
      where: {
        userId: req.userId,
        date: { gte: from, lte: to },
        ...(query.data.tag ? { tags: { has: query.data.tag } } : {}),
        ...(query.data.outcome ? { outcome: query.data.outcome } : {}),
      },
      include: { trade: { select: { ticker: true, pnl: true } } },
      orderBy: { date: "desc" },
      take: 500,
    });
    return {
      entries: entries.map((e) => ({
        id: e.id,
        date: e.date.toISOString().slice(0, 10),
        ticker: e.trade?.ticker ?? "—",
        thesis: e.thesis ?? "",
        outcome: e.outcome ?? undefined,
        pnl: e.trade?.pnl ?? undefined,
        tags: e.tags,
        lessons: e.lessons ?? undefined,
      })),
    };
  });

  // Heatmap: per-day pnl + tradeCount over last 90 days
  app.get("/heatmap", async (req) => {
    const now = new Date();
    const from = new Date(now);
    from.setUTCDate(from.getUTCDate() - 90);

    const trades = await prisma.trade.findMany({
      where: {
        userId: req.userId,
        openedAt: { gte: from },
      },
      select: { openedAt: true, pnl: true },
    });

    const buckets = new Map<string, { pnl: number; tradeCount: number }>();
    for (const t of trades) {
      const day = startOfDay(t.openedAt).toISOString().slice(0, 10);
      const bucket = buckets.get(day) ?? { pnl: 0, tradeCount: 0 };
      bucket.pnl += t.pnl ?? 0;
      bucket.tradeCount += 1;
      buckets.set(day, bucket);
    }

    // Also include pure-journal days that didn't have a trade
    const journals = await prisma.journalEntry.findMany({
      where: { userId: req.userId, date: { gte: from } },
      select: { date: true },
    });
    for (const j of journals) {
      const day = startOfDay(j.date).toISOString().slice(0, 10);
      if (!buckets.has(day)) buckets.set(day, { pnl: 0, tradeCount: 0 });
    }

    const days = Array.from(buckets.entries())
      .map(([date, v]) => ({ date, pnl: v.pnl, tradeCount: v.tradeCount }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    return { days };
  });

  // Single entry
  app.get("/:id", async (req, reply) => {
    const params = z.object({ id: z.string().min(1) }).safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }
    const entry = await prisma.journalEntry.findUnique({
      where: { id: params.data.id },
    });
    if (!entry || entry.userId !== req.userId) {
      return reply.code(404).send({ error: "not_found" });
    }
    return entry;
  });

  // Patch entry
  app.patch("/:id", async (req, reply) => {
    const params = z.object({ id: z.string().min(1) }).safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }
    const body = PatchBody.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.flatten() });
    }

    const existing = await prisma.journalEntry.findUnique({
      where: { id: params.data.id },
    });
    if (!existing || existing.userId !== req.userId) {
      return reply.code(404).send({ error: "not_found" });
    }

    return prisma.journalEntry.update({
      where: { id: params.data.id },
      data: body.data,
    });
  });

  // Delete entry
  app.delete("/:id", async (req, reply) => {
    const params = z.object({ id: z.string().min(1) }).safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }
    const existing = await prisma.journalEntry.findUnique({
      where: { id: params.data.id },
    });
    if (!existing || existing.userId !== req.userId) {
      return reply.code(404).send({ error: "not_found" });
    }
    await prisma.journalEntry.delete({ where: { id: params.data.id } });
    return { ok: true };
  });
}
