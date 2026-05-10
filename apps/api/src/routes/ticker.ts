import type { FastifyInstance } from "fastify";
import { quantGet } from "../services/quant.js";

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

export async function tickerRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  app.get("/:symbol/quote", async (req, reply) => {
    const symbol = (req.params as { symbol: string }).symbol.toUpperCase();
    if (!SYMBOL_RE.test(symbol)) return reply.code(400).send({ error: "invalid_symbol" });
    return quantGet(`/quote/${symbol}`);
  });

  app.get("/:symbol/news", async (req, reply) => {
    const symbol = (req.params as { symbol: string }).symbol.toUpperCase();
    if (!SYMBOL_RE.test(symbol)) return reply.code(400).send({ error: "invalid_symbol" });
    return quantGet(`/news/${symbol}`);
  });

  app.get("/:symbol/options", async (req, reply) => {
    const symbol = (req.params as { symbol: string }).symbol.toUpperCase();
    if (!SYMBOL_RE.test(symbol)) return reply.code(400).send({ error: "invalid_symbol" });
    return quantGet(`/options/${symbol}`);
  });
}
