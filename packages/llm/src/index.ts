import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOllama } from "ollama-ai-provider";
import { generateObject, generateText, type LanguageModelV1 } from "ai";
import type { ZodSchema } from "zod";

export type ProviderId = "anthropic" | "openai" | "google" | "ollama" | "lmstudio";

export interface ProviderConfig {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  googleApiKey?: string;
  ollamaHost?: string;
  /** Optional bearer token for Ollama instances behind auth. */
  ollamaApiKey?: string;
  /** LM Studio OpenAI-compatible server, e.g. http://localhost:1234 */
  lmstudioHost?: string;
  /** Optional bearer token for LM Studio instances with authentication enabled. */
  lmstudioApiKey?: string;
  /** Optional override of Anthropic's base URL (e.g. LiteLLM gateway). */
  anthropicBaseUrl?: string;
  /** Optional override of OpenAI's base URL (e.g. Azure OpenAI, gateway). */
  openaiBaseUrl?: string;
  /** Optional override of Google's Generative AI base URL. */
  googleBaseUrl?: string;
}

export interface LLMOptions {
  provider: ProviderId;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  anthropic: "claude-opus-4-7",
  openai: "gpt-4o",
  google: "gemini-2.0-flash",
  ollama: "llama3.1:8b",
  // LM Studio identifies the loaded model by whatever name it was published
  // under. "local-model" is the common placeholder; users will usually
  // override this from Settings or RunBriefDialog.
  lmstudio: "local-model",
};

export function buildModel(opts: LLMOptions, cfg: ProviderConfig): LanguageModelV1 {
  const model = opts.model ?? DEFAULT_MODELS[opts.provider];
  switch (opts.provider) {
    case "anthropic": {
      const a = createAnthropic({
        apiKey: cfg.anthropicApiKey,
        ...(cfg.anthropicBaseUrl ? { baseURL: cfg.anthropicBaseUrl } : {}),
      });
      return a(model);
    }
    case "openai": {
      // When a custom baseURL is set (proxy/gateway/LiteLLM/etc), relax strict mode
      // since downstream servers may not implement OpenAI's strict-mode quirks.
      const o = createOpenAI({
        apiKey: cfg.openaiApiKey,
        ...(cfg.openaiBaseUrl
          ? { baseURL: cfg.openaiBaseUrl, compatibility: "compatible" as const }
          : { compatibility: "strict" as const }),
      });
      return o(model);
    }
    case "google": {
      const g = createGoogleGenerativeAI({
        apiKey: cfg.googleApiKey,
        ...(cfg.googleBaseUrl ? { baseURL: cfg.googleBaseUrl } : {}),
      });
      return g(model);
    }
    case "ollama": {
      const o = createOllama({ baseURL: (cfg.ollamaHost ?? "http://localhost:11434") + "/api" });
      return o(model);
    }
    case "lmstudio": {
      // LM Studio speaks OpenAI's chat-completions protocol verbatim, so we
      // reuse @ai-sdk/openai with a custom baseURL. `compatibility: "compatible"`
      // relaxes strict-mode checks that the local server may not implement.
      // When LM Studio runs with auth enabled, the user pastes the real bearer
      // token in Settings → LM Studio → Key, and we forward it as Authorization.
      const lm = createOpenAI({
        apiKey: cfg.lmstudioApiKey ?? "lm-studio",
        baseURL: (cfg.lmstudioHost ?? "http://localhost:1234") + "/v1",
        compatibility: "compatible",
      });
      return lm(model);
    }
  }
}

export async function complete(
  prompt: string,
  opts: LLMOptions,
  cfg: ProviderConfig,
  system?: string
): Promise<string> {
  const { text } = await generateText({
    model: buildModel(opts, cfg),
    system,
    prompt,
    temperature: opts.temperature ?? 0.2,
    maxTokens: opts.maxTokens ?? 2048,
  });
  return text;
}

/**
 * Constrained-output generation. Output is validated against `schema`;
 * provider-side structured output is used when available (Anthropic tool use,
 * OpenAI JSON mode, Gemini schema). For Ollama we fall back to JSON mode.
 */
export async function completeStructured<T>(
  prompt: string,
  schema: ZodSchema<T>,
  opts: LLMOptions,
  cfg: ProviderConfig,
  system?: string
): Promise<T> {
  // Local OpenAI-compatible servers (LM Studio, Ollama) don't speak the same
  // structured-output dialect as the AI SDK's defaults: LM Studio rejects
  // tool_choice:{...} (the "tool" mode) AND rejects response_format:json_object
  // (the "json" mode in @ai-sdk v3); it wants json_schema. To avoid version
  // drift, we use generateText + prompt-engineered JSON for these providers,
  // then parse + validate against the same Zod schema.
  if (opts.provider === "lmstudio" || opts.provider === "ollama") {
    const jsonInstruction =
      "You MUST respond with ONLY valid JSON matching the schema. " +
      "No prose, no markdown fences, no commentary — just the raw JSON object.";
    const fullSystem = [system, jsonInstruction].filter(Boolean).join("\n\n");
    const { text } = await generateText({
      model: buildModel(opts, cfg),
      system: fullSystem,
      prompt,
      temperature: opts.temperature ?? 0.1,
      maxTokens: opts.maxTokens ?? 2048,
    });
    // Log the raw model output so we can iterate on the prompt when small
    // local models go off-schema.
    console.log(`[llm:${opts.provider}] raw output (${text.length}b):`, text.slice(0, 800));
    let parsed: unknown = extractAndParseJson(text);
    // Small local models sometimes ignore the wrapper instruction and emit
    // just the inner array. If the schema expects {signals: [...]} and we got
    // a bare array, wrap it.
    if (Array.isArray(parsed)) parsed = { signals: parsed };
    // Normalize common field-name aliases so close-but-wrong outputs still
    // validate (gemma/llama variants often pick synonyms).
    parsed = normalizeSignalFields(parsed);
    try {
      return schema.parse(parsed) as T;
    } catch (e) {
      const err = e as Error;
      console.error(`[llm:${opts.provider}] schema validation failed. Normalized payload:`, JSON.stringify(parsed).slice(0, 1000));
      throw err;
    }
  }
  const { object } = await generateObject({
    model: buildModel(opts, cfg),
    schema,
    system,
    prompt,
    temperature: opts.temperature ?? 0.1,
    maxTokens: opts.maxTokens ?? 2048,
  });
  return object as T;
}

/**
 * Map common trader-signal field aliases that small local models produce to
 * the canonical schema field names. Idempotent — safe to call on already-
 * canonical payloads. Mutates nothing; returns a new object.
 */
function normalizeSignalFields(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  if (Array.isArray(input)) return input.map((x) => normalizeSignalFields(x));
  const obj = input as Record<string, unknown>;
  // Wrapper-level: signals/trades/setups/ideas → signals
  const out: Record<string, unknown> = { ...obj };
  for (const alt of ["trades", "setups", "ideas", "tradeSignals", "trade_signals"]) {
    if (Array.isArray(out[alt]) && !out.signals) {
      out.signals = out[alt];
      delete out[alt];
    }
  }
  if (Array.isArray(out.signals)) {
    out.signals = (out.signals as unknown[]).map((sig) => normalizeOneSignal(sig));
  }
  return out;
}

const SIGNAL_ALIASES: Record<string, string> = {
  symbol: "ticker",
  side: "direction",
  position: "direction",
  type: "instrument",
  asset: "instrument",
  entryPrice: "entry",
  entry_price: "entry",
  stopLoss: "stop",
  stop_loss: "stop",
  stopPrice: "stop",
  takeProfit: "target1",
  take_profit: "target1",
  target: "target1",
  tp: "target1",
  tp1: "target1",
  tp2: "target2",
  quantity: "qty",
  size: "qty",
  positionSize: "qty",
  rr: "riskReward",
  risk_reward: "riskReward",
  riskRewardRatio: "riskReward",
  conf: "confidence",
  confidenceScore: "confidence",
  hold: "holdPeriod",
  timeframe: "holdPeriod",
  horizon: "holdPeriod",
  rationale: "thesis",
  reason: "thesis",
  analysis: "thesis",
};

function normalizeOneSignal(sig: unknown): unknown {
  if (!sig || typeof sig !== "object" || Array.isArray(sig)) return sig;
  const s = sig as Record<string, unknown>;
  const norm: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    const target = SIGNAL_ALIASES[k] ?? k;
    if (norm[target] === undefined) norm[target] = v;
  }
  // direction normalization: "buy"/"sell" → "long"/"short"
  if (typeof norm.direction === "string") {
    const d = norm.direction.toLowerCase();
    if (d === "buy" || d === "bull" || d === "bullish") norm.direction = "long";
    else if (d === "sell" || d === "bear" || d === "bearish") norm.direction = "short";
  }
  // instrument normalization: "equity"/"shares" → "stock"; "options"/"call"/"put" → "option"
  if (typeof norm.instrument === "string") {
    const i = norm.instrument.toLowerCase();
    if (["equity", "equities", "shares", "stocks"].includes(i)) norm.instrument = "stock";
    else if (["options", "call", "put", "calls", "puts"].includes(i)) norm.instrument = "option";
  }
  // holdPeriod normalization: "day"/"daytrade" → "intraday"; "weekly"/"swing" → "swing"
  if (typeof norm.holdPeriod === "string") {
    const h = norm.holdPeriod.toLowerCase();
    if (["day", "daytrade", "daily"].includes(h)) norm.holdPeriod = "intraday";
    else if (["weekly", "weeks", "medium"].includes(h)) norm.holdPeriod = "swing";
    else if (["monthly", "long-term", "longterm", "long_term"].includes(h)) norm.holdPeriod = "position";
  }
  // confidence normalization: percentage 65 → 0.65
  if (typeof norm.confidence === "number" && norm.confidence > 1 && norm.confidence <= 100) {
    norm.confidence = norm.confidence / 100;
  }
  return norm;
}

/**
 * Tolerant JSON extractor for local-model outputs. Strips markdown code fences
 * and leading/trailing prose so we can still parse responses where a small
 * local model wraps the JSON. Throws a clear error if no JSON object/array is
 * found at all.
 */
function extractAndParseJson(raw: string): unknown {
  const trimmed = raw.trim();
  // Markdown fence: ```json ... ``` or ``` ... ```
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
  // Try direct parse first.
  try {
    return JSON.parse(candidate);
  } catch {
    /* fall through */
  }
  // Locate first { or [ and last } or ] and parse the slice.
  const firstObj = candidate.indexOf("{");
  const firstArr = candidate.indexOf("[");
  const start =
    firstObj === -1
      ? firstArr
      : firstArr === -1
        ? firstObj
        : Math.min(firstObj, firstArr);
  if (start === -1) {
    throw new Error(`Model returned no JSON object/array. Raw output: ${raw.slice(0, 300)}`);
  }
  const open = candidate[start];
  const close = open === "{" ? "}" : "]";
  const end = candidate.lastIndexOf(close);
  if (end <= start) {
    throw new Error(`Model JSON output appears truncated. Raw: ${raw.slice(0, 300)}`);
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

/** Cheap key-validation: send one token, see if it errors. */
export async function validateProviderKey(
  provider: ProviderId,
  cfg: ProviderConfig
): Promise<{ ok: boolean; error?: string }> {
  try {
    await complete("ping", { provider, maxTokens: 4 }, cfg);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
