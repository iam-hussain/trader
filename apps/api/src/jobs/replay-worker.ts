import { Worker, type Job } from "bullmq";
import { prisma } from "@trader/db";
import {
  connection,
  type ReplayJobData,
  type ReplayJobResult,
  type Session,
} from "./queue.js";
import { generateBrief, type GenerateBriefInput } from "../services/signal-engine.js";

let _worker: Worker<ReplayJobData, ReplayJobResult> | null = null;

interface SignalSummary {
  ticker: string;
  direction: string;
  entry: number;
  target1: number;
  stop: number;
  confidence: number;
  holdPeriod: string;
}

interface ComparisonRow {
  ticker: string;
  matched: boolean;
  inGenerated: boolean;
  inActual: boolean;
}

interface ReplayResult {
  generatedBriefId: string;
  actualBriefId: string | null;
  generatedSignals: SignalSummary[];
  actualSignals: SignalSummary[];
  comparison: {
    rows: ComparisonRow[];
    match_count: number;
    extra_count: number;
    missing_count: number;
  };
  errors: string[];
  note: string;
}

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

function summarize(s: {
  ticker: string;
  direction: string;
  entry: number;
  target1: number;
  stop: number;
  confidence: number;
  holdPeriod: string;
}): SignalSummary {
  return {
    ticker: s.ticker,
    direction: s.direction,
    entry: s.entry,
    target1: s.target1,
    stop: s.stop,
    confidence: s.confidence,
    holdPeriod: s.holdPeriod,
  };
}

function toJson(value: unknown): object {
  return JSON.parse(JSON.stringify(value)) as object;
}

export function startReplayWorker(): Worker<ReplayJobData, ReplayJobResult> {
  if (_worker) return _worker;

  _worker = new Worker<ReplayJobData, ReplayJobResult>(
    "replay",
    async (job: Job<ReplayJobData, ReplayJobResult>) => {
      const { replayId, userId } = job.data;

      const replay = await prisma.replay.findUnique({ where: { id: replayId } });
      if (!replay) {
        throw new Error(`replay not found: ${replayId}`);
      }

      await prisma.replay.update({
        where: { id: replayId },
        data: { status: "running" },
      });

      job
        .log(
          `replay user=${userId} date=${replay.date.toISOString().slice(0, 10)} session=${replay.session}`
        )
        .catch(() => {
          /* ignore */
        });

      const errors: string[] = [];

      try {
        const session = replay.session as Session;
        const symbols = await resolveUserSymbols(userId);

        // TODO: full historical replay needs a snapshot of analysis bundles
        // captured on the original date. For Phase-5 we re-run the pipeline
        // against current data and tag the resulting brief as a replay.
        const gen = await generateBrief({
          userId,
          session,
          symbols,
          ...(replay.llmProvider
            ? { llmProvider: replay.llmProvider as Parameters<typeof generateBrief>[0]["llmProvider"] }
            : {}),
          ...(replay.llmModel ? { llmModel: replay.llmModel } : {}),
        });
        errors.push(...gen.errors);

        const generatedSignalRows = await prisma.signal.findMany({
          where: { briefId: gen.briefId },
          select: {
            ticker: true,
            direction: true,
            entry: true,
            target1: true,
            stop: true,
            confidence: true,
            holdPeriod: true,
          },
        });
        const generatedSignals = generatedSignalRows.map(summarize);

        // Look up actual brief for this user/date/session.
        const actualBrief = await prisma.brief
          .findUnique({
            where: {
              userId_date_session: {
                userId,
                date: replay.date,
                session: replay.session,
              },
            },
            include: {
              signals: {
                select: {
                  ticker: true,
                  direction: true,
                  entry: true,
                  target1: true,
                  stop: true,
                  confidence: true,
                  holdPeriod: true,
                },
              },
            },
          })
          .catch(() => null);

        // Avoid surfacing the just-generated replay brief as the "actual".
        const actualValid =
          actualBrief && actualBrief.id !== gen.briefId ? actualBrief : null;
        const actualSignals = actualValid ? actualValid.signals.map(summarize) : [];

        const generatedTickers = new Set(generatedSignals.map((s) => s.ticker));
        const actualTickers = new Set(actualSignals.map((s) => s.ticker));
        const allTickers = new Set<string>([...generatedTickers, ...actualTickers]);

        const rows: ComparisonRow[] = [];
        let match = 0;
        let extra = 0;
        let missing = 0;
        for (const t of allTickers) {
          const inG = generatedTickers.has(t);
          const inA = actualTickers.has(t);
          const matched = inG && inA;
          if (matched) match += 1;
          else if (inG && !inA) extra += 1;
          else if (!inG && inA) missing += 1;
          rows.push({ ticker: t, matched, inGenerated: inG, inActual: inA });
        }

        const result: ReplayResult = {
          generatedBriefId: gen.briefId,
          actualBriefId: actualValid?.id ?? null,
          generatedSignals,
          actualSignals,
          comparison: {
            rows,
            match_count: match,
            extra_count: extra,
            missing_count: missing,
          },
          errors,
          note:
            "Phase 5 simplified replay: signal-engine re-run against current data, not a historical snapshot.",
        };

        await prisma.replay.update({
          where: { id: replayId },
          data: {
            status: "done",
            result: toJson(result),
            completedAt: new Date(),
          },
        });

        return { replayId, ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await prisma.replay.update({
          where: { id: replayId },
          data: {
            status: "error",
            error: msg.slice(0, 1000),
            completedAt: new Date(),
          },
        });
        throw err;
      }
    },
    {
      connection: connection(),
      concurrency: 1,
    }
  );

  _worker.on("failed", (job, err) => {
    if (job) {
      job
        .log(`failed attempt ${job.attemptsMade}: ${err.message}`)
        .catch(() => {
          /* ignore */
        });
    }
  });

  return _worker;
}

export async function stopReplayWorker(): Promise<void> {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
}
