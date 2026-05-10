import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@trader/db";
import { replayQueue, type ReplayJobResult } from "../jobs/queue.js";

const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Session = z.enum(["premarket", "midday", "postmarket"]);

const RunBody = z.object({
  date: DateStr,
  session: Session,
  llmProvider: z.string().min(1).max(64).optional(),
  llmModel: z.string().min(1).max(128).optional(),
});

type JobStatus = "queued" | "running" | "done" | "failed";

export async function replayRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  app.get("/", async (req) => {
    const replays = await prisma.replay.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        date: true,
        session: true,
        status: true,
        llmProvider: true,
        llmModel: true,
        createdAt: true,
        completedAt: true,
      },
    });

    return {
      replays: replays.map((r) => ({
        id: r.id,
        date: r.date.toISOString().slice(0, 10),
        session: r.session,
        status: r.status,
        llmProvider: r.llmProvider,
        llmModel: r.llmModel,
        createdAt: r.createdAt.toISOString(),
        completedAt: r.completedAt?.toISOString() ?? null,
      })),
    };
  });

  app.get("/:id", async (req, reply) => {
    const params = z.object({ id: z.string().min(1) }).safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }
    const replay = await prisma.replay.findUnique({
      where: { id: params.data.id },
    });
    if (!replay || replay.userId !== req.userId) {
      return reply.code(404).send({ error: "not_found" });
    }
    return replay;
  });

  app.post("/run", async (req, reply) => {
    const body = RunBody.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.flatten() });
    }

    const replay = await prisma.replay.create({
      data: {
        userId: req.userId,
        date: new Date(body.data.date),
        session: body.data.session,
        llmProvider: body.data.llmProvider ?? null,
        llmModel: body.data.llmModel ?? null,
        status: "queued",
      },
    });

    const job = await replayQueue().add("replay", {
      replayId: replay.id,
      userId: req.userId,
    });

    req.log.info(
      { replayId: replay.id, jobId: job.id, date: body.data.date },
      "replay enqueued"
    );

    return reply.code(202).send({ replayId: replay.id, jobId: job.id });
  });

  app.get("/jobs/:jobId", async (req, reply) => {
    const params = z.object({ jobId: z.string().min(1) }).safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }

    const job = await replayQueue().getJob(params.data.jobId);
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

    const result = job.returnvalue as ReplayJobResult | undefined;
    return {
      status,
      error: job.failedReason,
      replayId: result?.replayId ?? job.data.replayId,
    };
  });
}
