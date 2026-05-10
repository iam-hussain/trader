import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@trader/db";
import { validateProviderKey, type ProviderId } from "@trader/llm";
import { decrypt, encrypt, lastFour } from "../services/crypto.js";
import { env } from "../env.js";

const PROVIDERS = [
  "anthropic",
  "openai",
  "google",
  "fred",
  "newsapi",
  "alphavantage",
  "finnhub",
  "sec_edgar",
] as const;

const ProviderEnum = z.enum(PROVIDERS);

const SetKeyBody = z.object({
  provider: ProviderEnum,
  key: z.string().min(1).max(500),
});

/**
 * Resolve a key from DB (preferred) or env fallback. Used by other routes.
 */
export async function getProviderKey(
  userId: string,
  provider: (typeof PROVIDERS)[number]
): Promise<string | undefined> {
  const row = await prisma.apiKey.findUnique({
    where: { userId_provider: { userId, provider } },
  });
  if (row) return decrypt(row.ciphertext, row.iv);
  switch (provider) {
    case "anthropic":
      return env.ANTHROPIC_API_KEY;
    case "openai":
      return env.OPENAI_API_KEY;
    case "google":
      return env.GOOGLE_API_KEY;
    default:
      return undefined;
  }
}

export async function providersRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  app.get("/", async (req) => {
    const rows = await prisma.apiKey.findMany({
      where: { userId: req.userId },
      select: { provider: true, lastFour: true, validated: true, validatedAt: true },
    });
    return PROVIDERS.map((p) => {
      const r = rows.find((row) => row.provider === p);
      const envFallback =
        (p === "anthropic" && !!env.ANTHROPIC_API_KEY) ||
        (p === "openai" && !!env.OPENAI_API_KEY) ||
        (p === "google" && !!env.GOOGLE_API_KEY);
      return {
        provider: p,
        configured: !!r || envFallback,
        source: r ? "db" : envFallback ? "env" : "none",
        lastFour: r?.lastFour,
        validated: r?.validated ?? false,
        validatedAt: r?.validatedAt,
      };
    });
  });

  app.put("/key", async (req, reply) => {
    const body = SetKeyBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const enc = encrypt(body.data.key);
    const row = await prisma.apiKey.upsert({
      where: { userId_provider: { userId: req.userId, provider: body.data.provider } },
      create: {
        userId: req.userId,
        provider: body.data.provider,
        ciphertext: enc.ciphertext,
        iv: enc.iv,
        lastFour: lastFour(body.data.key),
      },
      update: {
        ciphertext: enc.ciphertext,
        iv: enc.iv,
        lastFour: lastFour(body.data.key),
        validated: false,
        validatedAt: null,
      },
    });
    return { provider: row.provider, lastFour: row.lastFour };
  });

  app.delete("/key/:provider", async (req, reply) => {
    const provider = ProviderEnum.safeParse((req.params as { provider: string }).provider);
    if (!provider.success) return reply.code(400).send({ error: "invalid_provider" });
    await prisma.apiKey
      .delete({ where: { userId_provider: { userId: req.userId, provider: provider.data } } })
      .catch(() => undefined);
    return { ok: true };
  });

  app.post("/validate/:provider", async (req, reply) => {
    const provider = ProviderEnum.safeParse((req.params as { provider: string }).provider);
    if (!provider.success) return reply.code(400).send({ error: "invalid_provider" });

    const isLlm = ["anthropic", "openai", "google"].includes(provider.data);
    if (!isLlm) return { ok: true, note: "validation only implemented for LLM providers in Phase 1" };

    const key = await getProviderKey(req.userId, provider.data);
    if (!key) return reply.code(400).send({ error: "no_key_configured" });

    const cfg: Record<string, string> = {};
    if (provider.data === "anthropic") cfg.anthropicApiKey = key;
    if (provider.data === "openai") cfg.openaiApiKey = key;
    if (provider.data === "google") cfg.googleApiKey = key;

    const result = await validateProviderKey(provider.data as ProviderId, cfg);
    if (result.ok) {
      await prisma.apiKey.update({
        where: { userId_provider: { userId: req.userId, provider: provider.data } },
        data: { validated: true, validatedAt: new Date() },
      }).catch(() => undefined);
    }
    return result;
  });
}
