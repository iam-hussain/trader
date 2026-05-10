import { Worker, type Job } from "bullmq";
import { prisma } from "@trader/db";
import {
  connection,
  type BacktestJobData,
  type BacktestJobResult,
} from "./queue.js";
import { quantPost } from "../services/quant.js";

let _worker: Worker<BacktestJobData, BacktestJobResult> | null = null;

interface BacktestRequest {
  strategy: string;
  symbol: string;
  start: string;
  end: string;
  account_size: number;
  risk_per_trade_pct: number;
  params: Record<string, unknown>;
}

/** Coerce arbitrary structured value to Prisma Json. */
function toJson(value: unknown): object {
  return JSON.parse(JSON.stringify(value)) as object;
}

export function startBacktestWorker(): Worker<BacktestJobData, BacktestJobResult> {
  if (_worker) return _worker;

  _worker = new Worker<BacktestJobData, BacktestJobResult>(
    "backtest",
    async (job: Job<BacktestJobData, BacktestJobResult>) => {
      const { runId } = job.data;

      const run = await prisma.backtestRun.findUnique({ where: { id: runId } });
      if (!run) {
        throw new Error(`backtest run not found: ${runId}`);
      }

      await prisma.backtestRun.update({
        where: { id: runId },
        data: { status: "running" },
      });

      job
        .log(`backtest run=${runId} strategy=${run.strategy} symbol=${run.symbol}`)
        .catch(() => {
          /* ignore */
        });

      try {
        const params =
          run.params && typeof run.params === "object" && !Array.isArray(run.params)
            ? (run.params as Record<string, unknown>)
            : {};

        const body: BacktestRequest = {
          strategy: run.strategy,
          symbol: run.symbol,
          start: run.startDate.toISOString().slice(0, 10),
          end: run.endDate.toISOString().slice(0, 10),
          account_size: run.accountSize,
          risk_per_trade_pct: run.riskPerTradePct,
          params,
        };

        const result = await quantPost<unknown>("/backtest/run", body);

        await prisma.backtestRun.update({
          where: { id: runId },
          data: {
            status: "done",
            result: toJson(result),
            completedAt: new Date(),
          },
        });

        return { runId, ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await prisma.backtestRun.update({
          where: { id: runId },
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
      // Backtests can be heavy (CPU/IO on the quant service) — keep serial.
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

export async function stopBacktestWorker(): Promise<void> {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
}
