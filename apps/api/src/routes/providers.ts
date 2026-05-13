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
  "ollama",
  "lmstudio",
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
  baseUrl: z.string().url().optional(),
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
    case "lmstudio":
      return env.LMSTUDIO_API_KEY;
    case "ollama":
      return env.OLLAMA_API_KEY;
    default:
      return undefined;
  }
}

/**
 * Resolve a base URL override from DB (preferred) or env fallback.
 * Returns undefined when neither is set — caller should use the SDK default.
 */
export async function getProviderBaseUrl(
  userId: string,
  provider: (typeof PROVIDERS)[number]
): Promise<string | undefined> {
  const row = await prisma.apiKey.findUnique({
    where: { userId_provider: { userId, provider } },
    select: { baseUrl: true },
  });
  if (row?.baseUrl) return row.baseUrl;
  switch (provider) {
    case "ollama":
      return env.OLLAMA_HOST;
    case "lmstudio":
      return env.LMSTUDIO_HOST;
    default:
      return undefined;
  }
}

/**
 * Probe a local LLM server (ollama / lmstudio) for reachability.
 * Returns a probe result — never throws on network failure.
 */
async function probeLocalServer(
  provider: "ollama" | "lmstudio",
  host: string,
  apiKey?: string
): Promise<{
  ok: boolean;
  host: string;
  latencyMs: number;
  modelsCount?: number;
  error?: string;
}> {
  const path = provider === "ollama" ? "/api/tags" : "/v1/models";
  const url = host.replace(/\/+$/, "") + path;
  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  const started = Date.now();
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return { ok: false, host, latencyMs, error: `http_${res.status}` };
    }
    const body = (await res.json()) as unknown;
    let modelsCount = 0;
    if (provider === "ollama") {
      const models = (body as { models?: unknown[] }).models;
      modelsCount = Array.isArray(models) ? models.length : 0;
    } else {
      const data = (body as { data?: unknown[] }).data;
      modelsCount = Array.isArray(data) ? data.length : 0;
    }
    return { ok: true, host, latencyMs, modelsCount };
  } catch (err) {
    const latencyMs = Date.now() - started;
    const e = err as { name?: string; code?: string; cause?: { code?: string }; message?: string };
    let error = e?.message ?? "unknown_error";
    if (e?.name === "AbortError") error = "timeout";
    else if (e?.code === "ECONNREFUSED" || e?.cause?.code === "ECONNREFUSED") {
      error = "connection_refused";
    } else if (e?.code === "ENOTFOUND" || e?.cause?.code === "ENOTFOUND") {
      error = "host_not_found";
    }
    return { ok: false, host, latencyMs, error };
  } finally {
    clearTimeout(timer);
  }
}

export async function providersRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAuth);

  app.get("/", async (req) => {
    const rows = await prisma.apiKey.findMany({
      where: { userId: req.userId },
      select: {
        provider: true,
        lastFour: true,
        validated: true,
        validatedAt: true,
        baseUrl: true,
      },
    });
    return PROVIDERS.map((p) => {
      const r = rows.find((row) => row.provider === p);
      const envFallback =
        (p === "anthropic" && !!env.ANTHROPIC_API_KEY) ||
        (p === "openai" && !!env.OPENAI_API_KEY) ||
        (p === "google" && !!env.GOOGLE_API_KEY) ||
        (p === "ollama" && !!env.OLLAMA_HOST) ||
        (p === "lmstudio" && !!env.LMSTUDIO_HOST);
      const envBaseUrl =
        p === "ollama" ? env.OLLAMA_HOST : p === "lmstudio" ? env.LMSTUDIO_HOST : null;
      return {
        provider: p,
        configured: !!r || envFallback,
        source: r ? "db" : envFallback ? "env" : "none",
        lastFour: r?.lastFour,
        validated: r?.validated ?? false,
        validatedAt: r?.validatedAt,
        baseUrl: r?.baseUrl ?? envBaseUrl ?? null,
      };
    });
  });

  app.put("/key", async (req, reply) => {
    const body = SetKeyBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.flatten() });

    const enc = encrypt(body.data.key);
    const baseUrl = body.data.baseUrl ?? null;
    const row = await prisma.apiKey.upsert({
      where: { userId_provider: { userId: req.userId, provider: body.data.provider } },
      create: {
        userId: req.userId,
        provider: body.data.provider,
        ciphertext: enc.ciphertext,
        iv: enc.iv,
        lastFour: lastFour(body.data.key),
        baseUrl,
      },
      update: {
        ciphertext: enc.ciphertext,
        iv: enc.iv,
        lastFour: lastFour(body.data.key),
        baseUrl,
        validated: false,
        validatedAt: null,
      },
    });
    return { provider: row.provider, lastFour: row.lastFour, baseUrl: row.baseUrl };
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

    if (provider.data === "ollama" || provider.data === "lmstudio") {
      const host = await getProviderBaseUrl(req.userId, provider.data);
      if (!host) return reply.code(400).send({ error: "no_host_configured" });
      const apiKey = await getProviderKey(req.userId, provider.data);
      const probe = await probeLocalServer(provider.data, host, apiKey);
      if (probe.ok) {
        await prisma.apiKey
          .update({
            where: { userId_provider: { userId: req.userId, provider: provider.data } },
            data: { validated: true, validatedAt: new Date() },
          })
          .catch(() => undefined);
      }
      return probe;
    }

    const isLlm = ["anthropic", "openai", "google"].includes(provider.data);
    if (!isLlm) return { ok: true, note: "validation not implemented for this provider yet" };

    const key = await getProviderKey(req.userId, provider.data);
    if (!key) return reply.code(400).send({ error: "no_key_configured" });
    const baseUrl = await getProviderBaseUrl(req.userId, provider.data);

    const cfg: Record<string, string> = {};
    if (provider.data === "anthropic") {
      cfg.anthropicApiKey = key;
      if (baseUrl) cfg.anthropicBaseUrl = baseUrl;
    }
    if (provider.data === "openai") {
      cfg.openaiApiKey = key;
      if (baseUrl) cfg.openaiBaseUrl = baseUrl;
    }
    if (provider.data === "google") {
      cfg.googleApiKey = key;
      if (baseUrl) cfg.googleBaseUrl = baseUrl;
    }

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
