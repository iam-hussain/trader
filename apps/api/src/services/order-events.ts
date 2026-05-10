import type { Position } from "@trader/brokers";
import { connection } from "../jobs/queue.js";

export type OrderEventType =
  | "order.staged"
  | "order.confirmed"
  | "order.fill"
  | "order.cancel"
  | "order.reject"
  | "order.update";

export interface OrderEvent {
  type: OrderEventType;
  tradeId: string;
  data?: unknown;
}

function userChannel(userId: string): string {
  return `user:${userId}:events`;
}

/**
 * Publish an order-lifecycle event to the user's Redis pubsub channel. The
 * SSE route subscribes to `user:{id}:events` and forwards the JSON payload
 * to the browser, so any update written here surfaces in the UI within
 * roundtrip latency.
 */
export async function publishOrderEvent(
  userId: string,
  event: OrderEvent
): Promise<void> {
  const redis = connection();
  const payload = JSON.stringify(event);
  await redis.publish(userChannel(userId), payload);
}

export async function publishPositionUpdate(
  userId: string,
  positions: Position[]
): Promise<void> {
  const redis = connection();
  const payload = JSON.stringify({
    type: "positions.update" as const,
    data: positions,
  });
  await redis.publish(userChannel(userId), payload);
}
