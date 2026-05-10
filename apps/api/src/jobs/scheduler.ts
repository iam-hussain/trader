import { prisma } from "@trader/db";
import { briefQueue, alertQueue, type Session } from "./queue.js";

/**
 * Cron expressions are in UTC. ET = UTC-5 (EST) / UTC-4 (EDT). We schedule
 * around the EST offset (winter); during DST the brief fires one hour later
 * vs ET wall-clock time. Acceptable for a personal helper — full TZ-aware
 * scheduling can come later if needed.
 *
 *   08:00 ET premarket  → 13:00 UTC weekdays
 *   12:00 ET midday     → 17:00 UTC weekdays
 *   16:30 ET postmarket → 21:30 UTC weekdays
 */
const SCHEDULE: Array<{ session: Session; cron: string }> = [
  { session: "premarket", cron: "0 13 * * 1-5" },
  { session: "midday", cron: "0 17 * * 1-5" },
  { session: "postmarket", cron: "30 21 * * 1-5" },
];

// Watchlist alert poll: every 5 minutes during US market hours (9:30-16:00 ET).
// 9:30 ET ≈ 14:30 UTC; 16:00 ET ≈ 21:00 UTC.
const ALERT_POLL_CRON = "*/5 14-21 * * 1-5";

/**
 * Idempotent: BullMQ keys repeatable jobs by `jobId`, so re-calling on every
 * boot is safe — duplicates are deduped.
 */
export async function scheduleRecurringJobs(): Promise<void> {
  const users = await prisma.user.findMany({ select: { id: true } });
  const briefQ = briefQueue();
  const alertQ = alertQueue();

  for (const user of users) {
    for (const { session, cron } of SCHEDULE) {
      await briefQ.add(
        "brief",
        { userId: user.id, session },
        {
          repeat: { pattern: cron },
          jobId: `brief:${user.id}:${session}`,
        }
      );
    }

    await alertQ.add(
      "alert-poll",
      { userId: user.id, alertId: "*" },
      {
        repeat: { pattern: ALERT_POLL_CRON },
        jobId: `alert-poll:${user.id}`,
      }
    );
  }
}
