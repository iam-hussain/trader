import type { FastifyInstance } from "fastify";
import { prisma } from "@trader/db";
import { listOpenPositions } from "../services/order-service.js";
import { getBrokerAdapter, resetBrokerAdapter } from "@trader/brokers";
import { env } from "../env.js";

function startOfUtcDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

async function loadBrokerConfig(userId: string) {
  const setting = await prisma.setting.findUnique({ where: { userId } });
  return {
    host: setting?.ibkrHost ?? env.IBKR_HOST,
    port: setting?.ibkrPort ?? env.IBKR_PORT,
    clientId: env.IBKR_CLIENT_ID,
    mode: (setting?.ibkrMode ?? env.IBKR_MODE) as "paper" | "live",
  };
}

export async function positionsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  // Open positions (broker if connected, else cached/DB-derived).
  app.get("/", async (req) => {
    const result = await listOpenPositions(req.userId);
    return {
      positions: result.positions,
      asOf: result.asOf,
      source: result.source,
    };
  });

  // Daily P/L. Tries broker.getDailyPnl; falls back to today's closed trades.
  app.get("/pnl", async (req) => {
    const config = await loadBrokerConfig(req.userId);
    const adapter = getBrokerAdapter(config);
    const asOf = new Date().toISOString();

    if (adapter.isConnected()) {
      try {
        const pnl = await adapter.getDailyPnl();
        const positions = await adapter.getPositions();
        const unrealizedPnl = positions.reduce(
          (sum, p) => sum + (p.unrealizedPnl ?? 0),
          0
        );
        const realizedPnl = pnl - unrealizedPnl;
        return {
          realizedPnl,
          unrealizedPnl,
          pnl,
          asOf,
          source: "broker" as const,
        };
      } catch (err) {
        req.log.warn({ err }, "broker pnl failed; falling back to db");
      }
    }

    const start = startOfUtcDay(new Date());
    const trades = await prisma.trade.findMany({
      where: {
        userId: req.userId,
        closedAt: { gte: start },
      },
      select: { pnl: true },
    });
    const realizedPnl = trades.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
    return {
      realizedPnl,
      unrealizedPnl: 0,
      pnl: realizedPnl,
      asOf,
      source: "cache" as const,
    };
  });

  // Connection status — used by the live banner in the web UI.
  app.get("/broker/status", async (req) => {
    const config = await loadBrokerConfig(req.userId);
    const adapter = getBrokerAdapter(config);
    return {
      connected: adapter.isConnected(),
      mode: config.mode,
      host: config.host,
      port: config.port,
    };
  });

  // Trigger broker connect.
  app.post("/broker/connect", async (req, reply) => {
    const config = await loadBrokerConfig(req.userId);
    const adapter = getBrokerAdapter(config);
    try {
      if (!adapter.isConnected()) {
        await adapter.connect();
      }
      return { connected: adapter.isConnected() };
    } catch (err) {
      req.log.error({ err }, "broker connect failed");
      const message = err instanceof Error ? err.message : "connect_failed";
      return reply.code(502).send({ error: "connect_failed", message });
    }
  });

  // Trigger broker disconnect.
  app.post("/broker/disconnect", async (req, reply) => {
    const config = await loadBrokerConfig(req.userId);
    const adapter = getBrokerAdapter(config);
    try {
      if (adapter.isConnected()) {
        await adapter.disconnect();
      }
      resetBrokerAdapter();
      return { connected: false };
    } catch (err) {
      req.log.error({ err }, "broker disconnect failed");
      const message = err instanceof Error ? err.message : "disconnect_failed";
      return reply.code(502).send({ error: "disconnect_failed", message });
    }
  });
}
