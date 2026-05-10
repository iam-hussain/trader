import { startBriefWorker, stopBriefWorker } from "./brief-worker.js";
import { startAlertWorker, stopAlertWorker } from "./alert-worker.js";
import { startBacktestWorker, stopBacktestWorker } from "./backtest-worker.js";
import { startReplayWorker, stopReplayWorker } from "./replay-worker.js";
import { scheduleRecurringJobs } from "./scheduler.js";
import { closeQueues } from "./queue.js";
import {
  startPositionsPublisher,
  stopPositionsPublisher,
} from "./positions-publisher.js";
import { env } from "../env.js";

export {
  briefQueue,
  alertQueue,
  backtestQueue,
  replayQueue,
} from "./queue.js";
export type {
  BriefJobData,
  AlertJobData,
  BriefJobResult,
  BacktestJobData,
  BacktestJobResult,
  ReplayJobData,
  ReplayJobResult,
  Session,
} from "./queue.js";

let started = false;

export async function startJobs(): Promise<void> {
  if (started) return;
  started = true;
  startBriefWorker();
  startAlertWorker();
  startBacktestWorker();
  startReplayWorker();
  await scheduleRecurringJobs();

  if (env.JOBS_ENABLED && env.IBKR_HOST) {
    try {
      startPositionsPublisher();
    } catch (err) {
      // Don't crash boot if the broker can't be reached.
      console.warn("[jobs] startPositionsPublisher failed", err);
    }
  }
}

export async function stopJobs(): Promise<void> {
  if (!started) return;
  started = false;
  await Promise.allSettled([
    stopBriefWorker(),
    stopAlertWorker(),
    stopBacktestWorker(),
    stopReplayWorker(),
    stopPositionsPublisher(),
  ]);
  await closeQueues();
}
