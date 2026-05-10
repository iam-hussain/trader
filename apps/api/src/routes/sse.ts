import type { FastifyInstance } from "fastify";
import { connection } from "../jobs/queue.js";

const HEARTBEAT_MS = 25_000;

/**
 * Server-Sent Events stream of per-user events. The auth precondition gates
 * the userId — only the authenticated user's channel is subscribed. Events
 * are published elsewhere via `redis.publish("user:{userId}:events", json)`.
 */
export async function sseRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  app.get("/events", async (req, reply) => {
    const userId = req.userId;
    const channel = `user:${userId}:events`;

    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no");
    reply.raw.flushHeaders?.();

    // Use a duplicate connection — pubsub mode blocks normal commands.
    const sub = connection().duplicate();

    const writeEvent = (eventType: string, payload: unknown): void => {
      try {
        reply.raw.write(`event: ${eventType}\n`);
        reply.raw.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch (err) {
        req.log.warn({ err }, "sse write failed");
      }
    };

    // Initial hello so client knows the stream is live.
    writeEvent("ready", { userId, ts: Date.now() });

    sub.on("message", (_channel, message) => {
      // Expect publishers to send JSON like { type: "brief.completed", ... }
      try {
        const parsed = JSON.parse(message) as { type?: string };
        const eventType = typeof parsed.type === "string" ? parsed.type : "message";
        writeEvent(eventType, parsed);
      } catch {
        writeEvent("message", { raw: message });
      }
    });

    try {
      await sub.subscribe(channel);
    } catch (err) {
      req.log.error({ err }, "sse subscribe failed");
      reply.raw.end();
      sub.disconnect();
      return reply;
    }

    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(`:ping\n\n`);
      } catch {
        /* ignore */
      }
    }, HEARTBEAT_MS);

    const cleanup = (): void => {
      clearInterval(heartbeat);
      sub.unsubscribe(channel).catch(() => {
        /* ignore */
      });
      sub.disconnect();
    };

    req.raw.on("close", cleanup);
    req.raw.on("error", cleanup);

    // Return the reply but don't end it — it stays open for the stream.
    return reply;
  });
}
