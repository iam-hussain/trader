import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@trader/db";
import { resetBrokerAdapter } from "@trader/brokers";

const SettingsPatch = z.object({
  accountSizeUsd: z.number().positive().optional(),
  maxRiskPerTradePct: z.number().min(0).max(10).optional(),
  maxDailyLossPct: z.number().min(0).max(20).optional(),
  maxTradesPerDay: z.number().int().min(1).max(50).optional(),
  defaultInstruments: z.array(z.enum(["stock", "option"])).optional(),
  defaultHoldPeriod: z.enum(["intraday", "swing", "position"]).optional(),
  blackoutMacroEvents: z.boolean().optional(),
  blackoutMinutes: z.number().int().min(0).max(120).optional(),
  defaultLlmProvider: z.enum(["anthropic", "openai", "google", "ollama", "lmstudio"]).optional(),
  defaultLlmModel: z.string().optional(),
  ibkrMode: z.enum(["paper", "live"]).optional(),
  ibkrHost: z.string().optional(),
  ibkrPort: z.number().int().min(1).max(65535).optional(),
  theme: z.enum(["dark", "light"]).optional(),
});

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  app.get("/", async (req) => {
    let settings = await prisma.setting.findUnique({ where: { userId: req.userId } });
    if (!settings) settings = await prisma.setting.create({ data: { userId: req.userId } });
    return settings;
  });

  app.patch("/", async (req, reply) => {
    const body = SettingsPatch.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    return prisma.setting.upsert({
      where: { userId: req.userId },
      create: { userId: req.userId, ...body.data },
      update: body.data,
    });
  });

  // Switch broker mode (paper <-> live). Live requires explicit "LIVE" confirm
  // text — the web UI surfaces this as a type-to-confirm modal.
  const SwitchModeBody = z.object({
    mode: z.enum(["paper", "live"]),
    confirmText: z.string().optional(),
  });
  app.post("/broker/switch-mode", async (req, reply) => {
    const body = SwitchModeBody.safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: body.error.flatten() });
    }
    if (body.data.mode === "live" && body.data.confirmText !== "LIVE") {
      return reply
        .code(400)
        .send({ error: "confirm_required", message: 'confirmText must be "LIVE"' });
    }

    await prisma.setting.upsert({
      where: { userId: req.userId },
      create: { userId: req.userId, ibkrMode: body.data.mode },
      update: { ibkrMode: body.data.mode },
    });
    // Force the singleton to rebuild with the new config on next access.
    resetBrokerAdapter();
    req.log.info({ mode: body.data.mode }, "broker mode switched");
    return { mode: body.data.mode };
  });
}
