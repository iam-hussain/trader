import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@trader/db";

const Session = z.enum(["premarket", "midday", "postmarket"]);

/**
 * Phase 1: brief CRUD + a stub "generate" endpoint that creates a placeholder
 * Brief row. Real generation (LLM + quant context bundle) lands in Phase 3.
 */
export async function briefRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  app.get("/", async (req) => {
    return prisma.brief.findMany({
      where: { userId: req.userId },
      orderBy: { date: "desc" },
      take: 30,
    });
  });

  app.get("/:date/:session", async (req, reply) => {
    const params = z
      .object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), session: Session })
      .safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() });

    const brief = await prisma.brief.findUnique({
      where: {
        userId_date_session: {
          userId: req.userId,
          date: new Date(params.data.date),
          session: params.data.session,
        },
      },
      include: { signals: true },
    });
    if (!brief) return reply.code(404).send({ error: "not_found" });
    return brief;
  });

  app.post("/generate", async (req, reply) => {
    const body = z
      .object({ session: Session, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const date = body.data.date ? new Date(body.data.date) : new Date(new Date().toDateString());
    const brief = await prisma.brief.upsert({
      where: { userId_date_session: { userId: req.userId, date, session: body.data.session } },
      create: {
        userId: req.userId,
        date,
        session: body.data.session,
        status: "pending",
        summary: "Phase 1 stub — full generation lands in Phase 3.",
      },
      update: { status: "pending" },
    });
    return brief;
  });
}
