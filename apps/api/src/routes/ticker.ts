import type { FastifyInstance } from "fastify";
import { quantGet } from "../services/quant.js";

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

function symbolOr400(req: { params: unknown }, reply: { code: (n: number) => { send: (b: unknown) => unknown } }): string | null {
  const symbol = (req.params as { symbol: string }).symbol.toUpperCase();
  if (!SYMBOL_RE.test(symbol)) {
    reply.code(400).send({ error: "invalid_symbol" });
    return null;
  }
  return symbol;
}

export async function tickerRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  app.get("/:symbol/quote", async (req, reply) => {
    const sym = symbolOr400(req, reply);
    if (!sym) return;
    return quantGet(`/quote/${sym}`);
  });

  app.get("/:symbol/news", async (req, reply) => {
    const sym = symbolOr400(req, reply);
    if (!sym) return;
    return quantGet(`/news/${sym}`);
  });

  app.get("/:symbol/options", async (req, reply) => {
    const sym = symbolOr400(req, reply);
    if (!sym) return;
    return quantGet(`/options/${sym}`);
  });

  app.get("/:symbol/technicals", async (req, reply) => {
    const sym = symbolOr400(req, reply);
    if (!sym) return;
    return quantGet(`/technicals/${sym}`);
  });

  app.get("/:symbol/insider", async (req, reply) => {
    const sym = symbolOr400(req, reply);
    if (!sym) return;
    return quantGet(`/insider/${sym}`);
  });

  app.get("/:symbol/filings", async (req, reply) => {
    const sym = symbolOr400(req, reply);
    if (!sym) return;
    return quantGet(`/filings/${sym}`);
  });
}
