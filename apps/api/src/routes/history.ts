import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { quantGet } from "../services/quant.js";

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

// Same horizon caps as forecast. 1260 trading days ≈ 5 years, but news
// horizons are calendar-days, not trading-days, so the cap here is calendar.
const HistoryQuery = z.object({
  days: z.coerce.number().int().min(1).max(1825).default(7),
});

export async function historyRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  // News-based history: timeline of articles for a symbol, grouped by day.
  // Returns the shape from quant /news/history/:symbol verbatim.
  app.get("/:symbol", async (req, reply) => {
    const symbol = (req.params as { symbol: string }).symbol.toUpperCase();
    if (!SYMBOL_RE.test(symbol)) {
      return reply.code(400).send({ error: "invalid_symbol" });
    }
    const query = HistoryQuery.safeParse(req.query);
    if (!query.success) {
      return reply.code(400).send({ error: query.error.flatten() });
    }
    try {
      return await quantGet(
        `/news/history/${symbol}?days=${query.data.days}`
      );
    } catch (err) {
      req.log.error({ err, symbol }, "history fetch failed");
      return reply.code(502).send({ error: "quant_unavailable" });
    }
  });
}
