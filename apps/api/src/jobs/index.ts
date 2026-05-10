import { startBriefWorker, stopBriefWorker } from "./brief-worker.js";
import { startAlertWorker, stopAlertWorker } from "./alert-worker.js";
import { scheduleRecurringJobs } from "./scheduler.js";
import { closeQueues } from "./queue.js";
import {
  startPositionsPublisher,
  stopPositionsPublisher,
} from "./positions-publisher.js";
import { env } from "../env.js";

export { briefQueue, alertQueue } from "./queue.js";
export type {
  BriefJobData,
  AlertJobData,
  BriefJobResult,
  Session,
} from "./queue.js";

let started = false;

export async function startJobs(): Promise<void> {
  if (started) return;
  started = true;
  startBriefWorker();
  startAlertWorker();
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
    stopPositionsPublisher(),
  ]);
  await closeQueues();
}
