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
  /** LM Studio OpenAI-compatible server, e.g. http://localhost:1234 */
  lmstudioHost?: string;
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
      const a = createAnthropic({ apiKey: cfg.anthropicApiKey });
      return a(model);
    }
    case "openai": {
      const o = createOpenAI({ apiKey: cfg.openaiApiKey, compatibility: "strict" });
      return o(model);
    }
    case "google": {
      const g = createGoogleGenerativeAI({ apiKey: cfg.googleApiKey });
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
      const lm = createOpenAI({
        apiKey: "lm-studio", // ignored by LM Studio; any non-empty string works
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
