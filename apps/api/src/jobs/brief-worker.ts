import { Worker, type Job } from "bullmq";
import { prisma } from "@trader/db";
import { connection, type BriefJobData, type BriefJobResult } from "./queue.js";
import { generateBrief } from "../services/signal-engine.js";

let _worker: Worker<BriefJobData, BriefJobResult> | null = null;

/**
 * Resolve the union of all watchlist tickers for a given user.
 */
async function resolveUserSymbols(userId: string): Promise<string[]> {
  const wls = await prisma.watchlist.findMany({
    where: { userId },
    select: { tickers: true },
  });
  const set = new Set<string>();
  for (const wl of wls) {
    for (const t of wl.tickers) set.add(t);
  }
  return Array.from(set);
}

export function startBriefWorker(): Worker<BriefJobData, BriefJobResult> {
  if (_worker) return _worker;

  _worker = new Worker<BriefJobData, BriefJobResult>(
    "brief",
    async (job: Job<BriefJobData, BriefJobResult>) => {
      const { userId, session } = job.data;
      const symbols =
        job.data.symbols && job.data.symbols.length > 0
          ? job.data.symbols
          : await resolveUserSymbols(userId);

      job.log(
        `generating ${session} brief for user=${userId} symbols=${symbols.length}`
      ).catch(() => {
        /* ignore log errors */
      });

      const result = await generateBrief({
        userId,
        session,
        symbols,
      });

      return { briefId: result.briefId };
    },
    {
      connection: connection(),
      concurrency: 2,
    }
  );

  _worker.on("failed", (job, err) => {
    // BullMQ will retry per defaultJobOptions.attempts
    if (job) {
      job.log(`failed attempt ${job.attemptsMade}: ${err.message}`).catch(() => {
        /* ignore */
      });
    }
  });

  return _worker;
}

export async function stopBriefWorker(): Promise<void> {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
}
