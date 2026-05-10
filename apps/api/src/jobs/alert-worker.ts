import { Worker, type Job } from "bullmq";
import { connection, alertQueue, type AlertJobData } from "./queue.js";

let _worker: Worker<AlertJobData> | null = null;

/**
 * Phase 3 stub. Real evaluation (price/IV/news/breakout rules) lands later.
 * For now we just log and re-enqueue ourselves in 5 minutes so the polling
 * loop keeps ticking.
 */
export function startAlertWorker(): Worker<AlertJobData> {
  if (_worker) return _worker;

  _worker = new Worker<AlertJobData>(
    "alert",
    async (job: Job<AlertJobData>) => {
      const { userId, alertId } = job.data;
      job.log(`alert check stub user=${userId} alert=${alertId}`).catch(() => {
        /* ignore */
      });

      await alertQueue().add(
        "alert",
        job.data,
        {
          delay: 5 * 60 * 1000,
          jobId: `alert:${userId}:${alertId}:${Date.now()}`,
        }
      );

      return { ok: true };
    },
    {
      connection: connection(),
      concurrency: 4,
    }
  );

  return _worker;
}

export async function stopAlertWorker(): Promise<void> {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
}
