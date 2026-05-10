import type { FastifyInstance } from "fastify";

/**
 * Pre-wired for a future TradingView Pro+ upgrade. Essential plan does NOT
 * support webhook alerts, so this currently just logs. When the user upgrades,
 * configure the alert message body to be JSON; we'll route into the signal
 * engine without a code change.
 */
export async function tradingViewWebhookRoute(app: FastifyInstance) {
  app.post("/tradingview", async (req, reply) => {
    app.log.info({ body: req.body, headers: req.headers }, "tradingview webhook");
    // TODO(phase-3+): validate signature, normalize, push to signal engine.
    return reply.code(202).send({ ok: true });
  });
}
