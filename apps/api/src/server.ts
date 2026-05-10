import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import sensible from "@fastify/sensible";
import { env } from "./env.js";
import { authRoutes } from "./routes/auth.js";
import { watchlistRoutes } from "./routes/watchlist.js";
import { settingsRoutes } from "./routes/settings.js";
import { tickerRoutes } from "./routes/ticker.js";
import { providersRoutes } from "./routes/providers.js";
import { briefRoutes } from "./routes/brief.js";
import { tradingViewWebhookRoute } from "./routes/webhooks.js";
import { analysisRoutes } from "./routes/analysis.js";
import { macroRoutes } from "./routes/macro.js";
import { journalRoutes } from "./routes/journal.js";
import { alertRoutes } from "./routes/alerts.js";
import { sseRoutes } from "./routes/sse.js";
import { ordersRoutes } from "./routes/orders.js";
import { positionsRoutes } from "./routes/positions.js";
import { forecastRoutes } from "./routes/forecast.js";
import { backtestRoutes } from "./routes/backtest.js";
import { replayRoutes } from "./routes/replay.js";
import { attributionRoutes } from "./routes/attribution.js";
import { authPlugin } from "./plugins/auth.js";
import { startJobs, stopJobs } from "./jobs/index.js";

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug",
      transport:
        env.NODE_ENV === "development"
          ? { target: "pino-pretty", options: { translateTime: "HH:MM:ss" } }
          : undefined,
    },
  });

  await app.register(sensible);
  await app.register(cors, { origin: true, credentials: true });
  await app.register(cookie);
  await app.register(jwt, {
    secret: env.NEXTAUTH_SECRET,
    cookie: { cookieName: "trader_token", signed: false },
  });
  await app.register(authPlugin);

  app.get("/healthz", async () => ({ ok: true, service: "api" }));

  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(watchlistRoutes, { prefix: "/api/watchlist" });
  await app.register(settingsRoutes, { prefix: "/api/settings" });
  await app.register(providersRoutes, { prefix: "/api/providers" });
  await app.register(tickerRoutes, { prefix: "/api/ticker" });
  await app.register(analysisRoutes, { prefix: "/api/analysis" });
  await app.register(macroRoutes, { prefix: "/api/macro" });
  await app.register(briefRoutes, { prefix: "/api/briefs" });
  await app.register(journalRoutes, { prefix: "/api/journal" });
  await app.register(alertRoutes, { prefix: "/api/alerts" });
  await app.register(sseRoutes, { prefix: "/api/sse" });
  await app.register(ordersRoutes, { prefix: "/api/orders" });
  await app.register(positionsRoutes, { prefix: "/api/positions" });
  await app.register(forecastRoutes, { prefix: "/api/forecast" });
  await app.register(backtestRoutes, { prefix: "/api/backtest" });
  await app.register(replayRoutes, { prefix: "/api/replay" });
  await app.register(attributionRoutes, { prefix: "/api/attribution" });
  await app.register(tradingViewWebhookRoute, { prefix: "/api/webhooks" });

  return app;
}

async function main() {
  const app = await buildServer();
  try {
    await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
    app.log.info(`api listening on :${env.API_PORT}`);

    if (process.env.JOBS_ENABLED !== "false") {
      await startJobs();
      app.log.info("background jobs started");
    } else {
      app.log.info("background jobs disabled (JOBS_ENABLED=false)");
    }

    const shutdown = async (signal: string): Promise<void> => {
      app.log.info({ signal }, "shutting down");
      try {
        await stopJobs();
      } catch (err) {
        app.log.error({ err }, "stopJobs failed");
      }
      try {
        await app.close();
      } catch (err) {
        app.log.error({ err }, "app.close failed");
      }
      process.exit(0);
    };

    process.on("SIGTERM", () => {
      void shutdown("SIGTERM");
    });
    process.on("SIGINT", () => {
      void shutdown("SIGINT");
    });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
