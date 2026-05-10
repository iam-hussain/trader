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

export type BacktestJobData = {
  runId: string;
  userId: string;
};

export type BacktestJobResult = {
  runId: string;
  ok: boolean;
};

export type ReplayJobData = {
  replayId: string;
  userId: string;
};

export type ReplayJobResult = {
  replayId: string;
  ok: boolean;
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
let _backtestQueue: Queue<BacktestJobData, BacktestJobResult> | null = null;
let _replayQueue: Queue<ReplayJobData, ReplayJobResult> | null = null;

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

export function backtestQueue(): Queue<BacktestJobData, BacktestJobResult> {
  if (_backtestQueue) return _backtestQueue;
  _backtestQueue = new Queue<BacktestJobData, BacktestJobResult>("backtest", {
    connection: connection(),
    defaultJobOptions: {
      // Backtests are expensive — don't auto-retry by default.
      attempts: 1,
      removeOnComplete: { age: 24 * 3600, count: 200 },
      removeOnFail: { age: 7 * 24 * 3600, count: 200 },
    },
  });
  return _backtestQueue;
}

export function replayQueue(): Queue<ReplayJobData, ReplayJobResult> {
  if (_replayQueue) return _replayQueue;
  _replayQueue = new Queue<ReplayJobData, ReplayJobResult>("replay", {
    connection: connection(),
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { age: 24 * 3600, count: 200 },
      removeOnFail: { age: 7 * 24 * 3600, count: 200 },
    },
  });
  return _replayQueue;
}

export async function closeQueues(): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  if (_briefQueue) tasks.push(_briefQueue.close());
  if (_alertQueue) tasks.push(_alertQueue.close());
  if (_backtestQueue) tasks.push(_backtestQueue.close());
  if (_replayQueue) tasks.push(_replayQueue.close());
  await Promise.allSettled(tasks);
  _briefQueue = null;
  _alertQueue = null;
  _backtestQueue = null;
  _replayQueue = null;
  if (_connection) {
    await _connection.quit().catch(() => {
      /* ignore */
    });
    _connection = null;
  }
}
