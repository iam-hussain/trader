import { prisma } from "@trader/db";
import {
  TradeSignal,
  TradeSignalArray,
  type Brief as BriefType,
} from "@trader/schemas";
import {
  completeStructured,
  type LLMOptions,
  type ProviderConfig,
  type ProviderId,
  DEFAULT_MODELS,
} from "@trader/llm";
import { quantGet } from "./quant.js";
import { getProviderBaseUrl, getProviderKey } from "../routes/providers.js";
import { aggregateRiskState, checkRisk, type RiskLimitsInput } from "./risk-engine.js";
import { snapshotForSignal } from "./journal-service.js";
import { env } from "../env.js";
import { z } from "zod";

export interface GenerateBriefInput {
  userId: string;
  session: "premarket" | "midday" | "postmarket";
  symbols: string[];
  llmProvider?: ProviderId;
  llmModel?: string;
}

export interface GenerateBriefResult {
  briefId: string;
  signalsAccepted: number;
  signalsRejected: number;
  errors: string[];
}

/* ------------------------------------------------------------------ */
/* Quant bundle types — narrow shape consumed from the Python service. */
/* ------------------------------------------------------------------ */

interface MacroRegimeBundle {
  regime: "risk-on" | "neutral" | "risk-off";
  vix?: number;
  vixChange?: number;
  spyPct?: number;
  qqqPct?: number;
  yield10y?: number;
  dxy?: number;
  goldPct?: number;
  fearGreed?: number;
  notes?: string;
}

interface AnalysisBundle {
  symbol: string;
  quote?: {
    price: number;
    change?: number;
    changePct?: number;
    volume?: number;
  };
  technicals?: Record<string, number | string | null>;
  options?: {
    ivRank?: number;
    ivPercentile?: number;
    putCallRatio?: number;
  };
  news?: Array<{
    title: string;
    sentiment?: "positive" | "neutral" | "negative";
    source?: string;
    publishedAt?: string;
  }>;
  insider?: {
    netFlowUsd?: number;
    netCount?: number;
    period?: string;
  };
}

/* --------------------- prompt construction (pure) ----------------- */

interface BuildPromptInput {
  todayIso: string;
  session: GenerateBriefInput["session"];
  accountSizeUsd: number;
  limits: RiskLimitsInput;
  macro: MacroRegimeBundle;
  bundles: AnalysisBundle[];
}

export const SYSTEM_PROMPT = [
  "You are a disciplined trading assistant generating actionable, risk-aware",
  "trade ideas. Output MUST be valid JSON with this EXACT shape:",
  "",
  "{",
  '  "summary": "<one-sentence market read>",',
  '  "signals": [',
  "    {",
  '      "ticker": "AAPL",',
  '      "direction": "long",',
  '      "instrument": "stock",',
  '      "entry": 221.50,',
  '      "stop": 217.00,',
  '      "target1": 230.00,',
  '      "target2": 235.00,',
  '      "qty": 100,',
  '      "riskReward": 1.9,',
  '      "confidence": 0.65,',
  '      "holdPeriod": "swing",',
  '      "thesis": "Bullish breakout above 220 with strong volume; tight stop.",',
  '      "signals": ["volume_breakout", "rsi_oversold"],',
  '      "catalysts": ["earnings_beat"],',
  '      "invalidation": "Close below 216 invalidates setup."',
  "    }",
  "  ]",
  "}",
  "",
  "REQUIRED fields on every signal (exact field names — do NOT rename):",
  "  ticker, direction, instrument, entry, stop, target1, qty, riskReward,",
  "  confidence, holdPeriod, thesis",
  "",
  "Field constraints:",
  '  direction:  "long" | "short"',
  '  instrument: "stock" | "option"   (option requires optionLeg object)',
  '  holdPeriod: "intraday" | "swing" | "position"',
  "  confidence: number 0..1",
  "  riskReward: positive number, must be >= 1.5",
  "",
  "Hard rules:",
  "- Maximum 7 signals total.",
  "- Minimum confidence of 0.4. Reject anything weaker.",
  '- If no high-quality setups exist, return { "summary": "...", "signals": [] }.',
  "- Never invent prices, indicators, or news that are not present in the input.",
  "- For long signals, stop must be below entry and target1 above entry; vice",
  "  versa for shorts.",
  "- thesis must be 1-3 sentences, grounded in the supplied data.",
].join("\n");

export function buildPrompt(input: BuildPromptInput): { system: string; prompt: string } {
  const { todayIso, session, accountSizeUsd, limits, macro, bundles } = input;
  const lines: string[] = [];
  lines.push(`Date (UTC): ${todayIso}`);
  lines.push(`Session: ${session}`);
  lines.push(`Account size: $${accountSizeUsd.toLocaleString("en-US")}`);
  lines.push(
    `Risk caps: ${limits.maxRiskPerTradePct}% per trade, ${limits.maxDailyLossPct}% daily loss, ${limits.maxTradesPerDay} trades/day.`
  );
  lines.push("");
  lines.push("Macro snapshot:");
  lines.push(`  regime: ${macro.regime}`);
  if (macro.vix != null) lines.push(`  VIX: ${macro.vix} (Δ ${macro.vixChange ?? "n/a"})`);
  if (macro.spyPct != null) lines.push(`  SPY %: ${macro.spyPct}`);
  if (macro.qqqPct != null) lines.push(`  QQQ %: ${macro.qqqPct}`);
  if (macro.yield10y != null) lines.push(`  10y yield: ${macro.yield10y}`);
  if (macro.dxy != null) lines.push(`  DXY: ${macro.dxy}`);
  if (macro.fearGreed != null) lines.push(`  Fear/Greed: ${macro.fearGreed}`);
  if (macro.notes) lines.push(`  Notes: ${macro.notes}`);
  lines.push("");
  lines.push("Tickers:");
  for (const b of bundles) {
    lines.push(`- ${b.symbol}`);
    if (b.quote) {
      lines.push(
        `    price: ${b.quote.price} (Δ ${b.quote.change ?? "?"}, ${b.quote.changePct ?? "?"}%); vol ${b.quote.volume ?? "?"}`
      );
    }
    if (b.technicals) {
      const tech = Object.entries(b.technicals)
        .filter(([, v]) => v !== null && v !== undefined)
        .slice(0, 12)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      if (tech) lines.push(`    technicals: ${tech}`);
    }
    if (b.options) {
      const o: string[] = [];
      if (b.options.ivRank != null) o.push(`IVR=${b.options.ivRank}`);
      if (b.options.ivPercentile != null) o.push(`IVP=${b.options.ivPercentile}`);
      if (b.options.putCallRatio != null) o.push(`P/C=${b.options.putCallRatio}`);
      if (o.length) lines.push(`    options: ${o.join(", ")}`);
    }
    if (b.insider) {
      const i: string[] = [];
      if (b.insider.netFlowUsd != null) i.push(`netFlowUsd=${b.insider.netFlowUsd}`);
      if (b.insider.netCount != null) i.push(`netCount=${b.insider.netCount}`);
      if (b.insider.period) i.push(`period=${b.insider.period}`);
      if (i.length) lines.push(`    insider: ${i.join(", ")}`);
    }
    if (b.news && b.news.length) {
      lines.push(`    news (${b.news.length}):`);
      for (const n of b.news.slice(0, 5)) {
        const s = n.sentiment ? `[${n.sentiment}]` : "";
        lines.push(`      - ${s} ${n.title}`);
      }
    }
  }
  lines.push("");
  lines.push(
    'Produce the JSON now: { "summary": "...", "signals": [...] }. Use realistic entry/stop/target levels grounded in the prices above.'
  );

  return { system: SYSTEM_PROMPT, prompt: lines.join("\n") };
}

/* --------------------------- helpers ----------------------------- */

async function fetchBundlesWithConcurrency(
  symbols: string[],
  concurrency: number
): Promise<{ ok: AnalysisBundle[]; errors: string[] }> {
  const ok: AnalysisBundle[] = [];
  const errors: string[] = [];
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < symbols.length) {
      const idx = cursor++;
      const sym = symbols[idx];
      if (!sym) continue;
      try {
        const bundle = await quantGet<AnalysisBundle>(`/analysis/${encodeURIComponent(sym)}`);
        ok.push(bundle);
      } catch (e) {
        errors.push(`analysis:${sym}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  const workers: Array<Promise<void>> = [];
  const n = Math.max(1, Math.min(concurrency, symbols.length));
  for (let i = 0; i < n; i++) workers.push(worker());
  await Promise.all(workers);
  // preserve input order
  ok.sort((a, b) => symbols.indexOf(a.symbol) - symbols.indexOf(b.symbol));
  return { ok, errors };
}

async function buildProviderConfig(
  userId: string,
  provider: ProviderId
): Promise<ProviderConfig> {
  const cfg: ProviderConfig = {
    ollamaHost: env.OLLAMA_HOST,
    lmstudioHost: env.LMSTUDIO_HOST,
  };
  if (provider === "anthropic") {
    cfg.anthropicApiKey = await getProviderKey(userId, "anthropic");
    const baseUrl = await getProviderBaseUrl(userId, "anthropic");
    if (baseUrl) cfg.anthropicBaseUrl = baseUrl;
  }
  if (provider === "openai") {
    cfg.openaiApiKey = await getProviderKey(userId, "openai");
    const baseUrl = await getProviderBaseUrl(userId, "openai");
    if (baseUrl) cfg.openaiBaseUrl = baseUrl;
  }
  if (provider === "google") {
    cfg.googleApiKey = await getProviderKey(userId, "google");
    const baseUrl = await getProviderBaseUrl(userId, "google");
    if (baseUrl) cfg.googleBaseUrl = baseUrl;
  }
  if (provider === "ollama") {
    const baseUrl = await getProviderBaseUrl(userId, "ollama");
    if (baseUrl) cfg.ollamaHost = baseUrl;
    const apiKey = await getProviderKey(userId, "ollama");
    if (apiKey) cfg.ollamaApiKey = apiKey;
  }
  if (provider === "lmstudio") {
    const baseUrl = await getProviderBaseUrl(userId, "lmstudio");
    if (baseUrl) cfg.lmstudioHost = baseUrl;
    const apiKey = await getProviderKey(userId, "lmstudio");
    if (apiKey) cfg.lmstudioApiKey = apiKey;
  }
  return cfg;
}

/** Schema we ask the LLM for: signals + optional one-line summary. */
const LlmOutput = z.object({
  summary: z.string().max(500).optional(),
  signals: TradeSignalArray,
});

/* --------------------------- main entry -------------------------- */

export async function generateBrief(input: GenerateBriefInput): Promise<GenerateBriefResult> {
  const errors: string[] = [];

  // 1. User settings.
  const setting = await prisma.setting.findUnique({ where: { userId: input.userId } });
  const accountSizeUsd = setting?.accountSizeUsd ?? 25000;
  const limits: RiskLimitsInput = {
    maxRiskPerTradePct: setting?.maxRiskPerTradePct ?? 1.0,
    maxDailyLossPct: setting?.maxDailyLossPct ?? 3.0,
    maxTradesPerDay: setting?.maxTradesPerDay ?? 5,
    blackoutMacroEvents: setting?.blackoutMacroEvents ?? true,
    blackoutMinutes: setting?.blackoutMinutes ?? 30,
  };
  const provider: ProviderId =
    input.llmProvider ??
    ((setting?.defaultLlmProvider as ProviderId | undefined) ?? env.DEFAULT_LLM_PROVIDER);
  // Model resolution order: explicit call → user setting → env (per provider)
  // → SDK default. Lets LMSTUDIO_DEFAULT_MODEL / OLLAMA_DEFAULT_MODEL in .env
  // override the generic placeholder without needing UI changes.
  const envModelDefault =
    provider === "lmstudio"
      ? env.LMSTUDIO_DEFAULT_MODEL
      : provider === "ollama"
        ? env.OLLAMA_DEFAULT_MODEL
        : undefined;
  const model =
    input.llmModel ??
    setting?.defaultLlmModel ??
    envModelDefault ??
    DEFAULT_MODELS[provider];

  // 2. Create the Brief row up front so signals can FK to it.
  const today = new Date();
  const brief = await prisma.brief.create({
    data: {
      userId: input.userId,
      date: today,
      session: input.session,
      status: "running",
      llmProvider: provider,
      llmModel: model,
      startedAt: today,
    },
  });

  try {
    // 3. Macro context.
    const macro = await quantGet<MacroRegimeBundle>("/macro/regime").catch((e: unknown) => {
      errors.push(`macro: ${e instanceof Error ? e.message : String(e)}`);
      const fallback: MacroRegimeBundle = { regime: "neutral" };
      return fallback;
    });

    // 4. Per-symbol analysis bundles (concurrency=4).
    const { ok: bundles, errors: bundleErrors } = await fetchBundlesWithConcurrency(
      input.symbols,
      4
    );
    errors.push(...bundleErrors);

    if (bundles.length === 0) {
      const reason =
        input.symbols.length === 0
          ? "Your watchlist is empty — add tickers in /watchlist, or use 'Run for SYM' to brief a specific symbol."
          : `No analysis bundles available for [${input.symbols.join(", ")}]. The quant service may be unreachable; check ${bundleErrors.length} per-symbol error(s) in the job log.`;
      await prisma.brief.update({
        where: { id: brief.id },
        data: {
          status: "error",
          completedAt: new Date(),
          summary: reason,
          marketRegime: macro.regime,
        },
      });
      return { briefId: brief.id, signalsAccepted: 0, signalsRejected: 0, errors };
    }

    // 5. Prompt.
    const { system, prompt } = buildPrompt({
      todayIso: today.toISOString(),
      session: input.session,
      accountSizeUsd,
      limits,
      macro,
      bundles,
    });

    // 6. LLM call.
    const llmOpts: LLMOptions = { provider, model, temperature: 0.1, maxTokens: 4096 };
    const cfg = await buildProviderConfig(input.userId, provider);
    const llmOut = await completeStructured(prompt, LlmOutput, llmOpts, cfg, system);

    // 7. Aggregate the user's risk state once for this brief.
    const baseState = await aggregateRiskState(input.userId);
    const quoteByTicker = new Map<string, number>();
    for (const b of bundles) if (b.quote?.price) quoteByTicker.set(b.symbol, b.quote.price);

    let accepted = 0;
    let rejected = 0;
    let tradesPlacedSoFar = baseState.tradesPlacedToday;

    for (const candidate of llmOut.signals) {
      const parsed = TradeSignal.safeParse(candidate);
      if (!parsed.success) {
        rejected += 1;
        errors.push(`schema:${candidate.ticker ?? "?"}: ${parsed.error.message.slice(0, 200)}`);
        continue;
      }
      const sig = parsed.data;

      // Stale-quote guard.
      const refPx = quoteByTicker.get(sig.ticker);
      if (refPx && refPx > 0) {
        const drift = Math.abs(sig.entry - refPx) / refPx;
        if (drift >= 0.05) {
          rejected += 1;
          errors.push(`stale:${sig.ticker}: drift=${(drift * 100).toFixed(2)}%`);
          continue;
        }
      }

      const result = checkRisk(
        sig,
        { ...baseState, tradesPlacedToday: tradesPlacedSoFar },
        limits
      );
      if (!result.allowed) {
        rejected += 1;
        errors.push(`risk:${sig.ticker}: ${result.reasons.join(",")}`);
        continue;
      }

      const finalQty = result.adjustedQty ?? sig.qty;
      const created = await prisma.signal.create({
        data: {
          userId: input.userId,
          briefId: brief.id,
          ticker: sig.ticker,
          direction: sig.direction,
          instrument: sig.instrument,
          entry: sig.entry,
          target1: sig.target1,
          target2: sig.target2 ?? null,
          stop: sig.stop,
          qty: finalQty,
          riskReward: sig.riskReward,
          confidence: sig.confidence,
          holdPeriod: sig.holdPeriod,
          thesis: sig.thesis,
          signals: sig.signals,
          catalysts: sig.catalysts,
          invalidation: sig.invalidation ?? null,
          optionLeg: sig.optionLeg
            ? (JSON.parse(JSON.stringify(sig.optionLeg)) as object)
            : undefined,
          llmProvider: provider,
          llmModel: model,
          status: "proposed",
        },
      });

      // Pre-populate journal for accepted signals.
      try {
        await snapshotForSignal(created.id);
      } catch (e) {
        errors.push(`journal:${sig.ticker}: ${e instanceof Error ? e.message : String(e)}`);
      }

      accepted += 1;
      tradesPlacedSoFar += 1;
    }

    // 8. Persist the Brief.
    await prisma.brief.update({
      where: { id: brief.id },
      data: {
        status: "done",
        completedAt: new Date(),
        marketRegime: macro.regime,
        summary: llmOut.summary ?? null,
        context: serializeContext({
          accountSizeUsd,
          limits,
          macro,
          symbols: input.symbols,
        }),
      },
    });

    return {
      briefId: brief.id,
      signalsAccepted: accepted,
      signalsRejected: rejected,
      errors,
    };
  } catch (e) {
    // AI SDK errors expose extra context (responseBody, url, statusCode) that
    // is usually the actual reason for the failure. Capture all of it so the
    // brief.summary tells the user what to fix.
    const err = e as Error & {
      responseBody?: string;
      url?: string;
      statusCode?: number;
      cause?: unknown;
    };
    const parts: string[] = [];
    parts.push(err.message ?? String(e));
    if (err.statusCode) parts.push(`HTTP ${err.statusCode}`);
    if (err.responseBody) parts.push(`body: ${err.responseBody}`);
    else if (err.cause) parts.push(`cause: ${String(err.cause)}`);
    const msg = parts.join(" | ");
    errors.push(`llm: ${msg.slice(0, 400)}`);
    await prisma.brief.update({
      where: { id: brief.id },
      data: { status: "error", completedAt: new Date(), summary: msg.slice(0, 1000) },
    });
    return {
      briefId: brief.id,
      signalsAccepted: 0,
      signalsRejected: 0,
      errors: [...errors, msg],
    };
  }
}

/** Coerce a plain object to the `Json` type Prisma expects. */
function serializeContext(obj: unknown): object {
  return JSON.parse(JSON.stringify(obj)) as object;
}

/** Re-export for convenient typing in routes. */
export type { BriefType };
