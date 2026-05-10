import { Queue } from "bullmq";
import IORedis, { type Redis } from "ioredis";
import { env } from "../env.js";

export type Session = "premarket" | "midday" | "postmarket";

export type BriefJobData = {
  userId: string;
  session: Session;
  symbols?: string[];
};

export type AlertJobData = {
  userId: string;
  alertId: string;
};

export type BriefJobResult = {
  briefId: string;
};

let _connection: Redis | null = null;

/**
 * Lazy ioredis singleton. BullMQ requires `maxRetriesPerRequest: null` and
 * `enableReadyCheck: false` on the connection it shares with workers.
 */
export function connection(): Redis {
  if (_connection) return _connection;
  _connection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
  });
  return _connection;
}

let _briefQueue: Queue<BriefJobData, BriefJobResult> | null = null;
let _alertQueue: Queue<AlertJobData> | null = null;

export function briefQueue(): Queue<BriefJobData, BriefJobResult> {
  if (_briefQueue) return _briefQueue;
  _briefQueue = new Queue<BriefJobData, BriefJobResult>("brief", {
    connection: connection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 24 * 3600, count: 1000 },
    },
  });
  return _briefQueue;
}

export function alertQueue(): Queue<AlertJobData> {
  if (_alertQueue) return _alertQueue;
  _alertQueue = new Queue<AlertJobData>("alert", {
    connection: connection(),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: { age: 3600, count: 500 },
      removeOnFail: { age: 24 * 3600, count: 500 },
    },
  });
  return _alertQueue;
}

export async function closeQueues(): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  if (_briefQueue) tasks.push(_briefQueue.close());
  if (_alertQueue) tasks.push(_alertQueue.close());
  await Promise.allSettled(tasks);
  _briefQueue = null;
  _alertQueue = null;
  if (_connection) {
    await _connection.quit().catch(() => {
      /* ignore */
    });
    _connection = null;
  }
}
