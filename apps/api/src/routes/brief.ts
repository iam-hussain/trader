import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@trader/db";
import { briefQueue, type BriefJobResult } from "../jobs/queue.js";

const Session = z.enum(["premarket", "midday", "postmarket"]);

const Symbol = z.string().regex(/^[A-Z][A-Z0-9.\-]{0,9}$/);

const GenerateBody = z.object({
  session: Session,
  symbols: z.array(Symbol).optional(),
  llmProvider: z.string().optional(),
  llmModel: z.string().optional(),
});

type JobStatus = "queued" | "running" | "done" | "failed";

export async function briefRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  // List recent briefs
  app.get("/", async (req) => {
    const briefs = await prisma.brief.findMany({
      where: { userId: req.userId },
      orderBy: { date: "desc" },
      take: 30,
      select: {
        id: true,
        date: true,
        session: true,
        status: true,
        summary: true,
        marketRegime: true,
        llmProvider: true,
        llmModel: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        _count: { select: { signals: true } },
      },
    });
    return {
      briefs: briefs.map((b) => ({
        id: b.id,
        date: b.date.toISOString().slice(0, 10),
        session: b.session,
        status: b.status,
        signalCount: b._count.signals,
        summary: b.summary,
        marketRegime: b.marketRegime,
        llmProvider: b.llmProvider,
        llmModel: b.llmModel,
        generatedAt: (b.completedAt ?? b.createdAt).toISOString(),
      })),
    };
  });

  // Single brief by id (with signals)
  app.get("/:id", async (req, reply) => {
    const params = z.object({ id: z.string().min(1) }).safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }
    const brief = await prisma.brief.findUnique({
      where: { id: params.data.id },
      include: { signals: true },
    });
    if (!brief || brief.userId !== req.userId) {
      return reply.code(404).send({ error: "not_found" });
    }
    return brief;
  });

  // Lookup by user + date + session
  app.get("/by-date/:date/:session", async (req, reply) => {
    const params = z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        session: Session,
      })
      .safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }

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

  // Enqueue a generation job
  app.post("/generate", async (req, reply) => {
    const body = GenerateBody.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.flatten() });
    }

    const job = await briefQueue().add(
      "brief",
      {
        userId: req.userId,
        session: body.data.session,
        symbols: body.data.symbols,
      },
      {
        // No repeat, ad-hoc; let BullMQ generate a unique id
      }
    );

    req.log.info(
      { jobId: job.id, session: body.data.session },
      "brief generation enqueued"
    );

    return reply.code(202).send({ jobId: job.id });
  });

  // Job status
  app.get("/jobs/:jobId", async (req, reply) => {
    const params = z.object({ jobId: z.string().min(1) }).safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }

    const job = await briefQueue().getJob(params.data.jobId);
    if (!job) return reply.code(404).send({ error: "not_found" });

    if (job.data.userId !== req.userId) {
      return reply.code(404).send({ error: "not_found" });
    }

    const state = await job.getState();
    let status: JobStatus;
    switch (state) {
      case "completed":
        status = "done";
        break;
      case "failed":
        status = "failed";
        break;
      case "active":
        status = "running";
        break;
      default:
        status = "queued";
    }

    const result = job.returnvalue as BriefJobResult | undefined;
    return {
      status,
      error: job.failedReason,
      briefId: result?.briefId,
    };
  });
}
