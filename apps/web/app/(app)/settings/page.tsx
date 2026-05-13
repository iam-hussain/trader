"use client";
import useSWR from "swr";
import { useEffect, useRef, useState } from "react";
import { api, fetcher } from "@/lib/api";
import { LiveModeModal } from "@/components/LiveModeModal";
import { toast } from "@/lib/toast";

const LLM_PROVIDERS = ["lmstudio", "ollama", "anthropic", "openai", "google"] as const;
type LlmProvider = (typeof LLM_PROVIDERS)[number];

interface ValidateResponse {
  ok: boolean;
  host?: string;
  latencyMs?: number;
  modelsCount?: number;
  error?: string;
}

type ConnStatus = "unknown" | "ok" | "fail" | "testing";

interface Settings {
  accountSizeUsd: number;
  maxRiskPerTradePct: number;
  maxDailyLossPct: number;
  maxTradesPerDay: number;
  defaultLlmProvider: string;
  ibkrMode: string;
  ibkrHost: string;
  ibkrPort: number;
  blackoutMacroEvents: boolean;
  blackoutMinutes: number;
}

interface ProviderRow {
  provider: string;
  configured: boolean;
  source: string;
  lastFour?: string;
  validated: boolean;
  baseUrl?: string | null;
}

/** Suggested defaults for the optional Host field, per provider. */
const HOST_PLACEHOLDERS: Record<string, string> = {
  anthropic: "https://api.anthropic.com (leave blank for default)",
  openai: "https://api.openai.com/v1 (leave blank for default)",
  google: "leave blank for default",
  ollama: "http://host.docker.internal:11434",
  lmstudio: "http://host.docker.internal:1234",
};

const HOST_PROVIDERS = new Set(["anthropic", "openai", "google", "ollama", "lmstudio"]);

export default function SettingsPage() {
  const settings = useSWR<Settings>("/api/settings", fetcher);
  const providers = useSWR<ProviderRow[]>("/api/providers", fetcher);
  const broker = useSWR<{ connected: boolean; mode: string; host: string; port: number }>(
    "/api/positions/broker/status",
    fetcher,
  );
  const [keyDraft, setKeyDraft] = useState<Record<string, string>>({});
  const [hostDraft, setHostDraft] = useState<Record<string, string>>({});
  const [liveModalOpen, setLiveModalOpen] = useState(false);

  // Active-LLM card state
  const [connStatus, setConnStatus] = useState<ConnStatus>("unknown");
  const [connDetail, setConnDetail] = useState<string | null>(null);
  const lastAutoTestedFor = useRef<string | null>(null);

  async function saveSettings(patch: Partial<Settings>) {
    await api("/api/settings", { method: "PATCH", body: JSON.stringify(patch) });
    void settings.mutate();
  }

  async function testActiveLlm(provider: string, opts: { announce?: boolean } = {}) {
    setConnStatus("testing");
    setConnDetail(null);
    try {
      const res = await api<ValidateResponse>(
        `/api/providers/validate/${provider}`,
        { method: "POST" },
      );
      if (res.ok) {
        setConnStatus("ok");
        const parts: string[] = [];
        if (typeof res.latencyMs === "number") parts.push(`${res.latencyMs} ms`);
        if (typeof res.modelsCount === "number") parts.push(`${res.modelsCount} models loaded`);
        const detail = parts.join(" · ") || null;
        setConnDetail(detail);
        if (opts.announce) toast(`${provider} reachable${detail ? ` (${detail})` : ""}`, "success");
      } else {
        setConnStatus("fail");
        const err = res.error ?? "not reachable";
        setConnDetail(err);
        if (opts.announce) toast(`${provider}: ${err}`, "error");
      }
    } catch (e) {
      // Treat 400 as "not testable" — still announce, but keep unknown badge.
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("API 400")) {
        setConnStatus("unknown");
        setConnDetail("not testable — configure key/host first");
        if (opts.announce) toast(`${provider}: not testable — configure key/host first`, "info");
      } else {
        setConnStatus("fail");
        setConnDetail(msg);
        if (opts.announce) toast(`${provider}: ${msg}`, "error");
      }
    }
  }

  // On mount / when defaultLlmProvider first known, auto-test once.
  useEffect(() => {
    const p = settings.data?.defaultLlmProvider;
    if (!p) return;
    if (lastAutoTestedFor.current === p) return;
    lastAutoTestedFor.current = p;
    void testActiveLlm(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.data?.defaultLlmProvider]);

  async function selectActiveLlm(provider: LlmProvider) {
    if (settings.data?.defaultLlmProvider === provider) return;
    try {
      await saveSettings({ defaultLlmProvider: provider });
      toast(`Active LLM → ${provider}`, "success");
      setConnStatus("unknown");
      setConnDetail(null);
      lastAutoTestedFor.current = provider;
      void testActiveLlm(provider);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast(`Failed to switch LLM: ${msg}`, "error");
    }
  }

  async function saveKey(provider: string) {
    const key = keyDraft[provider];
    const baseUrl = (hostDraft[provider] ?? "").trim();
    // Allow local providers to be configured with just a host (placeholder key).
    const effectiveKey = key && key.length > 0
      ? key
      : (provider === "ollama" || provider === "lmstudio") && baseUrl
        ? "local"
        : "";
    if (!effectiveKey) return;
    const body: { provider: string; key: string; baseUrl?: string } = {
      provider,
      key: effectiveKey,
    };
    if (baseUrl) body.baseUrl = baseUrl;
    await api("/api/providers/key", {
      method: "PUT",
      body: JSON.stringify(body),
    });
    setKeyDraft({ ...keyDraft, [provider]: "" });
    void providers.mutate();
  }

  async function validateKey(provider: string) {
    await api(`/api/providers/validate/${provider}`, { method: "POST" });
    void providers.mutate();
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <section className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Active LLM</h2>
          <button
            className="btn btn-sm"
            disabled={!settings.data || connStatus === "testing"}
            onClick={() => {
              if (settings.data?.defaultLlmProvider) {
                void testActiveLlm(settings.data.defaultLlmProvider, { announce: true });
              }
            }}
          >
            {connStatus === "testing" ? "Testing…" : "Test connection"}
          </button>
        </div>
        <p className="text-sm text-fg-muted">
          Choose which provider runs briefs and signals. Local providers (lmstudio, ollama) probe their HTTP endpoint; remote providers make a real test call.
        </p>
        <div className="flex flex-wrap gap-2">
          {LLM_PROVIDERS.map((p) => {
            const active = settings.data?.defaultLlmProvider === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => void selectActiveLlm(p)}
                className="btn btn-sm"
                style={{
                  textTransform: "capitalize",
                  background: active
                    ? "color-mix(in oklab, var(--primary) 18%, transparent)"
                    : undefined,
                  borderColor: active
                    ? "color-mix(in oklab, var(--primary) 55%, var(--border))"
                    : undefined,
                  fontWeight: active ? 600 : undefined,
                }}
                aria-pressed={active}
              >
                {p}
                {active && <span className="chip chip-info ml-1.5" style={{ height: 16 }}>active</span>}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 text-[12px]">
          {connStatus === "ok" && (
            <span className="t-pos flex items-center gap-1.5">
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--success)", display: "inline-block" }} />
              Connected
            </span>
          )}
          {connStatus === "fail" && (
            <span className="t-neg flex items-center gap-1.5">
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--destructive)", display: "inline-block" }} />
              Not reachable
            </span>
          )}
          {(connStatus === "unknown" || connStatus === "testing") && (
            <span className="t-muted flex items-center gap-1.5">
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--fg-dim, #888)", display: "inline-block", opacity: 0.6 }} />
              {connStatus === "testing" ? "Testing…" : "Unknown"}
            </span>
          )}
          {connDetail && <span className="t-muted">· {connDetail}</span>}
        </div>
      </section>

      <section className="card p-4 space-y-4">
        <h2 className="font-medium">Risk limits</h2>
        {settings.data && (
          <div className="grid grid-cols-2 gap-4">
            <Field
              label="Account size (USD)"
              value={settings.data.accountSizeUsd}
              onSave={(v) => saveSettings({ accountSizeUsd: Number(v) })}
            />
            <Field
              label="Max risk per trade (%)"
              value={settings.data.maxRiskPerTradePct}
              onSave={(v) => saveSettings({ maxRiskPerTradePct: Number(v) })}
            />
            <Field
              label="Max daily loss (%)"
              value={settings.data.maxDailyLossPct}
              onSave={(v) => saveSettings({ maxDailyLossPct: Number(v) })}
            />
            <Field
              label="Max trades per day"
              value={settings.data.maxTradesPerDay}
              onSave={(v) => saveSettings({ maxTradesPerDay: Number(v) })}
            />
          </div>
        )}
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="font-medium">Broker (IBKR)</h2>
        {settings.data && (
          <div className="grid grid-cols-3 gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-fg-muted">Mode</span>
              <select
                className="input"
                value={settings.data.ibkrMode}
                onChange={(e) => {
                  const next = e.target.value;
                  if (next === "live" && settings.data?.ibkrMode !== "live") {
                    setLiveModalOpen(true);
                    return;
                  }
                  void saveSettings({ ibkrMode: next });
                }}
              >
                <option value="paper">Paper</option>
                <option value="live">Live</option>
              </select>
            </label>
            <Field
              label="Gateway host"
              value={settings.data.ibkrHost}
              onSave={(v) => saveSettings({ ibkrHost: v })}
            />
            <Field
              label="Gateway port"
              value={settings.data.ibkrPort}
              onSave={(v) => saveSettings({ ibkrPort: Number(v) })}
            />
          </div>
        )}
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="font-medium">API keys</h2>
        <p className="text-sm text-fg-muted">
          Stored encrypted in Mongo. Env vars are used as fallback if no DB key is set.
        </p>
        <div className="space-y-3">
          {providers.data?.map((p) => {
            const hostValue = hostDraft[p.provider] ?? p.baseUrl ?? "";
            const showHost = HOST_PROVIDERS.has(p.provider);
            return (
              <div key={p.provider} className="space-y-1.5 border-b border-bg-3 pb-3 last:border-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <span className="w-32 text-sm capitalize">{p.provider}</span>
                  <span className="text-xs text-fg-muted w-32">
                    {p.configured
                      ? `${p.source === "env" ? "env" : "db"}${p.lastFour ? ` ····${p.lastFour}` : ""}`
                      : "not configured"}
                  </span>
                  <input
                    type="password"
                    className="input flex-1"
                    placeholder="Paste key…"
                    value={keyDraft[p.provider] ?? ""}
                    onChange={(e) => setKeyDraft({ ...keyDraft, [p.provider]: e.target.value })}
                  />
                  <button className="btn" onClick={() => saveKey(p.provider)}>
                    Save
                  </button>
                  {["anthropic", "openai", "google"].includes(p.provider) && (
                    <button className="btn" onClick={() => validateKey(p.provider)}>
                      {p.validated ? "Re-validate" : "Validate"}
                    </button>
                  )}
                </div>
                {showHost && (
                  <div className="flex items-center gap-2">
                    <span className="w-32 text-xs text-fg-muted">Host (optional)</span>
                    <span className="w-32" />
                    <input
                      type="text"
                      className="input flex-1 mono"
                      placeholder={HOST_PLACEHOLDERS[p.provider] ?? ""}
                      value={hostValue}
                      onChange={(e) =>
                        setHostDraft({ ...hostDraft, [p.provider]: e.target.value })
                      }
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <LiveModeModal
        open={liveModalOpen}
        onClose={() => setLiveModalOpen(false)}
        onConfirmed={() => {
          void settings.mutate();
          void broker.mutate();
        }}
      />
    </div>
  );
}

function Field({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string | number;
  onSave: (v: string) => void | Promise<void>;
}) {
  const [v, setV] = useState(String(value));
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-fg-muted">{label}</span>
      <input
        className="input mono tabular"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== String(value) && onSave(v)}
      />
    </label>
  );
}
