import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { quantGet } from "../services/quant.js";

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

// Forecast horizons: 1d, 1w (~5td), 1m (~21td), 3m (~63td), 6m (~126td),
// 1y (~252td), 2y (~504td), 5y (~1260td). Cap at 1260 trading days (~5y).
const ProphetQuery = z.object({
  days: z.coerce.number().int().min(1).max(1260).default(7),
});

const GarchQuery = z.object({
  days: z.coerce.number().int().min(1).max(1260).default(5),
});

const BundleQuery = z.object({
  days: z.coerce.number().int().min(1).max(1260).default(7),
  lookback: z.coerce.number().int().min(5).max(365).default(60),
});

const PatternsQuery = z.object({
  lookback: z.coerce.number().int().min(5).max(365).default(60),
});

export async function forecastRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  app.get("/:symbol", async (req, reply) => {
    const symbol = (req.params as { symbol: string }).symbol.toUpperCase();
    if (!SYMBOL_RE.test(symbol)) {
      return reply.code(400).send({ error: "invalid_symbol" });
    }
    const query = BundleQuery.safeParse(req.query);
    if (!query.success) {
      return reply.code(400).send({ error: query.error.flatten() });
    }
    try {
      return await quantGet(
        `/forecast/${symbol}?days=${query.data.days}&lookback=${query.data.lookback}`
      );
    } catch (err) {
      req.log.error({ err, symbol }, "forecast bundle failed");
      return reply.code(502).send({ error: "quant_unavailable" });
    }
  });

  app.get("/:symbol/prophet", async (req, reply) => {
    const symbol = (req.params as { symbol: string }).symbol.toUpperCase();
    if (!SYMBOL_RE.test(symbol)) {
      return reply.code(400).send({ error: "invalid_symbol" });
    }
    const query = ProphetQuery.safeParse(req.query);
    if (!query.success) {
      return reply.code(400).send({ error: query.error.flatten() });
    }
    try {
      return await quantGet(
        `/forecast/${symbol}/prophet?days=${query.data.days}`
      );
    } catch (err) {
      req.log.error({ err, symbol }, "prophet forecast failed");
      return reply.code(502).send({ error: "quant_unavailable" });
    }
  });

  app.get("/:symbol/garch", async (req, reply) => {
    const symbol = (req.params as { symbol: string }).symbol.toUpperCase();
    if (!SYMBOL_RE.test(symbol)) {
      return reply.code(400).send({ error: "invalid_symbol" });
    }
    const query = GarchQuery.safeParse(req.query);
    if (!query.success) {
      return reply.code(400).send({ error: query.error.flatten() });
    }
    try {
      return await quantGet(
        `/forecast/${symbol}/garch?days=${query.data.days}`
      );
    } catch (err) {
      req.log.error({ err, symbol }, "garch forecast failed");
      return reply.code(502).send({ error: "quant_unavailable" });
    }
  });

  app.get("/:symbol/patterns", async (req, reply) => {
    const symbol = (req.params as { symbol: string }).symbol.toUpperCase();
    if (!SYMBOL_RE.test(symbol)) {
      return reply.code(400).send({ error: "invalid_symbol" });
    }
    const query = PatternsQuery.safeParse(req.query);
    if (!query.success) {
      return reply.code(400).send({ error: query.error.flatten() });
    }
    try {
      return await quantGet(
        `/forecast/${symbol}/patterns?lookback=${query.data.lookback}`
      );
    } catch (err) {
      req.log.error({ err, symbol }, "patterns forecast failed");
      return reply.code(502).send({ error: "quant_unavailable" });
    }
  });
}
