import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@trader/db";

const Symbol = z.string().regex(/^[A-Z][A-Z0-9.\-]{0,9}$/);

const CreateWatchlist = z.object({
  name: z.string().min(1).max(50),
  tickers: z.array(Symbol).default([]),
});

const UpdateWatchlist = z.object({
  name: z.string().min(1).max(50).optional(),
  tickers: z.array(Symbol).optional(),
});

export async function watchlistRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  app.get("/", async (req) => {
    return prisma.watchlist.findMany({
      where: { userId: req.userId },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
  });

  app.post("/", async (req, reply) => {
    const body = CreateWatchlist.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const count = await prisma.watchlist.count({ where: { userId: req.userId } });
    return prisma.watchlist.create({
      data: { ...body.data, userId: req.userId, position: count },
    });
  });

  app.patch("/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const body = UpdateWatchlist.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const wl = await prisma.watchlist.findUnique({ where: { id } });
    if (!wl || wl.userId !== req.userId) return reply.code(404).send({ error: "not_found" });

    return prisma.watchlist.update({ where: { id }, data: body.data });
  });

  app.delete("/:id", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const wl = await prisma.watchlist.findUnique({ where: { id } });
    if (!wl || wl.userId !== req.userId) return reply.code(404).send({ error: "not_found" });
    await prisma.watchlist.delete({ where: { id } });
    return { ok: true };
  });

  app.post("/:id/add", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const body = z.object({ ticker: Symbol }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const wl = await prisma.watchlist.findUnique({ where: { id } });
    if (!wl || wl.userId !== req.userId) return reply.code(404).send({ error: "not_found" });
    if (wl.tickers.includes(body.data.ticker)) return wl;

    return prisma.watchlist.update({
      where: { id },
      data: { tickers: { push: body.data.ticker } },
    });
  });

  app.post("/:id/remove", async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const body = z.object({ ticker: Symbol }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const wl = await prisma.watchlist.findUnique({ where: { id } });
    if (!wl || wl.userId !== req.userId) return reply.code(404).send({ error: "not_found" });

    return prisma.watchlist.update({
      where: { id },
      data: { tickers: { set: wl.tickers.filter((t) => t !== body.data.ticker) } },
    });
  });
}
