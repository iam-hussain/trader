import type { FastifyInstance } from "fastify";
import { quantGet } from "../services/quant.js";

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

export async function analysisRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  app.get("/:symbol", async (req, reply) => {
    const symbol = (req.params as { symbol: string }).symbol.toUpperCase();
    if (!SYMBOL_RE.test(symbol)) return reply.code(400).send({ error: "invalid_symbol" });
    return quantGet(`/analysis/${symbol}`);
  });
}
