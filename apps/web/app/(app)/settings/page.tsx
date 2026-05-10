"use client";
import useSWR from "swr";
import { useState } from "react";
import { api, fetcher } from "@/lib/api";

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
}

export default function SettingsPage() {
  const settings = useSWR<Settings>("/api/settings", fetcher);
  const providers = useSWR<ProviderRow[]>("/api/providers", fetcher);
  const [keyDraft, setKeyDraft] = useState<Record<string, string>>({});

  async function saveSettings(patch: Partial<Settings>) {
    await api("/api/settings", { method: "PATCH", body: JSON.stringify(patch) });
    void settings.mutate();
  }

  async function saveKey(provider: string) {
    const key = keyDraft[provider];
    if (!key) return;
    await api("/api/providers/key", {
      method: "PUT",
      body: JSON.stringify({ provider, key }),
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
                onChange={(e) => saveSettings({ ibkrMode: e.target.value })}
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
        <div className="space-y-2">
          {providers.data?.map((p) => (
            <div key={p.provider} className="flex items-center gap-2">
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
          ))}
        </div>
      </section>
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
