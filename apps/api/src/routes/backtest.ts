import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@trader/db";
import { quantGet, quantPost } from "../services/quant.js";
import { backtestQueue, type BacktestJobResult } from "../jobs/queue.js";

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const RunBody = z.object({
  strategy: z.string().min(1).max(64),
  params: z.record(z.string(), z.unknown()).default({}),
  symbol: z.string().regex(SYMBOL_RE),
  start: DateStr,
  end: DateStr,
  accountSize: z.number().positive().max(10_000_000).optional(),
  riskPerTradePct: z.number().positive().max(50).optional(),
});

type JobStatus = "queued" | "running" | "done" | "failed";

interface KpisLike {
  kpis?: unknown;
}

function extractKpis(result: unknown): unknown {
  if (result && typeof result === "object" && !Array.isArray(result)) {
    return (result as KpisLike).kpis ?? null;
  }
  return null;
}

export async function backtestRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  // Catalog of available strategies (proxied from the quant service).
  app.get("/strategies", async (req, reply) => {
    try {
      return await quantGet("/backtest/strategies");
    } catch (err) {
      req.log.error({ err }, "backtest strategies fetch failed");
      return reply.code(502).send({ error: "quant_unavailable" });
    }
  });

  // List user's recent runs.
  app.get("/", async (req) => {
    const runs = await prisma.backtestRun.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        strategy: true,
        symbol: true,
        status: true,
        createdAt: true,
        completedAt: true,
        result: true,
      },
    });

    return {
      runs: runs.map((r) => ({
        id: r.id,
        strategy: r.strategy,
        symbol: r.symbol,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        completedAt: r.completedAt?.toISOString() ?? null,
        kpis: r.status === "done" ? extractKpis(r.result) : null,
      })),
    };
  });

  // Single run with full result.
  app.get("/:id", async (req, reply) => {
    const params = z.object({ id: z.string().min(1) }).safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }
    const run = await prisma.backtestRun.findUnique({
      where: { id: params.data.id },
    });
    if (!run || run.userId !== req.userId) {
      return reply.code(404).send({ error: "not_found" });
    }
    return run;
  });

  // Enqueue a backtest run.
  app.post("/run", async (req, reply) => {
    const body = RunBody.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.flatten() });
    }

    const setting = await prisma.setting.findUnique({
      where: { userId: req.userId },
    });
    const accountSize =
      body.data.accountSize ?? setting?.accountSizeUsd ?? 25_000;
    const riskPerTradePct =
      body.data.riskPerTradePct ?? setting?.maxRiskPerTradePct ?? 1.0;

    const run = await prisma.backtestRun.create({
      data: {
        userId: req.userId,
        strategy: body.data.strategy,
        symbol: body.data.symbol.toUpperCase(),
        startDate: new Date(body.data.start),
        endDate: new Date(body.data.end),
        params: JSON.parse(JSON.stringify(body.data.params)) as object,
        accountSize,
        riskPerTradePct,
        status: "queued",
      },
    });

    const job = await backtestQueue().add("backtest", {
      runId: run.id,
      userId: req.userId,
    });

    req.log.info(
      { runId: run.id, jobId: job.id, strategy: body.data.strategy },
      "backtest run enqueued"
    );

    return reply.code(202).send({ runId: run.id, jobId: job.id });
  });

  // Job status by BullMQ jobId.
  app.get("/jobs/:jobId", async (req, reply) => {
    const params = z.object({ jobId: z.string().min(1) }).safeParse(req.params);
    if (!params.success) {
      return reply.code(400).send({ error: params.error.flatten() });
    }

    const job = await backtestQueue().getJob(params.data.jobId);
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

    const result = job.returnvalue as BacktestJobResult | undefined;
    return {
      status,
      error: job.failedReason,
      runId: result?.runId ?? job.data.runId,
    };
  });

  // Monte Carlo proxies straight to the quant service. The frontend sends
  // {trades, iterations}; the quant API expects {trades, n_runs}.
  const MonteCarloBody = z.object({
    trades: z.array(z.record(z.string(), z.unknown())).min(1),
    iterations: z.number().int().min(1).max(100_000).optional(),
  });
  app.post("/monte-carlo", async (req, reply) => {
    const body = MonteCarloBody.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.flatten() });
    }
    try {
      return await quantPost("/backtest/monte-carlo", {
        trades: body.data.trades,
        n_runs: body.data.iterations ?? 1000,
      });
    } catch (err) {
      req.log.error({ err }, "monte-carlo proxy failed");
      return reply.code(502).send({ error: "quant_unavailable" });
    }
  });
}
