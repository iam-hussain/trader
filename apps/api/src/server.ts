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
import { authPlugin } from "./plugins/auth.js";

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
  await app.register(tradingViewWebhookRoute, { prefix: "/api/webhooks" });

  return app;
}

async function main() {
  const app = await buildServer();
  try {
    await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
    app.log.info(`api listening on :${env.API_PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
