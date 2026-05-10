import type { Position } from "@trader/brokers";
import { connection } from "../jobs/queue.js";

/**
 * Loose union of order-event types. The order-service emits high-level
 * lifecycle markers (order.staged|confirmed|fill|cancel|reject|update);
 * positions-publisher emits broker-side echoes (order.filled|cancelled|
 * rejected|execution|update). The SSE consumer treats these as opaque
 * strings, so we widen the type to `string` rather than dropping types.
 */
export type OrderEventType = string;

export interface OrderEvent {
  type: OrderEventType;
  tradeId: string;
  /** Optional structured payload (broker status, error, etc.). */
  data?: unknown;
  /** Free-form fields callers may attach (brokerOrderId, status, …). */
  [extra: string]: unknown;
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
