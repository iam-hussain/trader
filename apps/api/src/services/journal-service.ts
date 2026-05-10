import { prisma } from "@trader/db";

/**
 * Create a JournalEntry pre-populated from a Signal. The entry is unbound
 * to a Trade (tradeId=null) until `attachToTrade` is called when an order
 * is staged. Tags include session/provider/holdPeriod for later filtering.
 */
export async function snapshotForSignal(signalId: string): Promise<void> {
  const signal = await prisma.signal.findUnique({
    where: { id: signalId },
    include: { brief: true },
  });
  if (!signal) throw new Error(`signal ${signalId} not found`);

  const tags: string[] = [];
  if (signal.brief?.session) tags.push(`session:${signal.brief.session}`);
  if (signal.llmProvider) tags.push(`provider:${signal.llmProvider}`);
  if (signal.holdPeriod) tags.push(`hold:${signal.holdPeriod}`);
  tags.push(`ticker:${signal.ticker}`);
  tags.push(`direction:${signal.direction}`);

  const existing = await prisma.journalEntry.findFirst({
    where: { userId: signal.userId, tradeId: null, tags: { has: `signal:${signal.id}` } },
  });
  if (existing) return;
  tags.push(`signal:${signal.id}`);

  await prisma.journalEntry.create({
    data: {
      userId: signal.userId,
      date: new Date(),
      thesis: signal.thesis,
      tags,
      screenshots: [],
    },
  });
}

/** Bind the floating JournalEntry to a freshly-staged Trade. */
export async function attachToTrade(tradeId: string, signalId: string): Promise<void> {
  const entry = await prisma.journalEntry.findFirst({
    where: { tradeId: null, tags: { has: `signal:${signalId}` } },
  });
  if (!entry) return;
  await prisma.journalEntry.update({
    where: { id: entry.id },
    data: { tradeId },
  });
}

/** Record the post-trade outcome and optional post-mortem lessons. */
export async function recordOutcome(
  tradeId: string,
  outcome: "win" | "loss" | "scratch",
  lessons?: string
): Promise<void> {
  const entry = await prisma.journalEntry.findUnique({ where: { tradeId } });
  if (!entry) return;
  await prisma.journalEntry.update({
    where: { id: entry.id },
    data: {
      outcome,
      ...(lessons != null ? { lessons } : {}),
    },
  });
}
