"use client";
import { useState } from "react";
import useSWR from "swr";
import { AlertCircle, Bell, Plus, Pencil, Trash2 } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import {
  AlertEditor,
  type Alert,
  type AlertKind,
  type AlertRule,
  type PriceRule,
  type IvRule,
  type NewsRule,
  type BreakoutRule,
} from "@/components/AlertEditor";
import { api, fetcher } from "@/lib/api";

interface AlertListResponse {
  alerts: Alert[];
}

const KIND_CHIP: Record<AlertKind, string> = {
  price: "chip chip-info",
  iv: "chip chip-warn",
  news: "chip",
  breakout: "chip chip-pos",
};

function ruleSummary(kind: AlertKind, rule: AlertRule): string {
  if (kind === "price") {
    const r = rule as PriceRule;
    return `price ${r.op} ${r.value.toFixed(2)}`;
  }
  if (kind === "iv") {
    const r = rule as IvRule;
    return `IV moves ±${r.pct.toFixed(1)}%`;
  }
  if (kind === "news") {
    const r = rule as NewsRule;
    return `news matches "${r.keyword}"`;
  }
  const r = rule as BreakoutRule;
  return `${r.period}-day high breakout`;
}

export default function AlertsPage() {
  const { data, error, isLoading, mutate } = useSWR<AlertListResponse>(
    "/api/alerts",
    fetcher,
    { keepPreviousData: true },
  );

  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const create = async (a: Partial<Alert>) => {
    await api("/api/alerts", { method: "POST", body: JSON.stringify(a) });
    setCreating(false);
    await mutate();
  };

  const update = async (id: string, a: Partial<Alert>) => {
    await api(`/api/alerts/${id}`, { method: "PATCH", body: JSON.stringify(a) });
    setEditingId(null);
    await mutate();
  };

  const toggle = async (a: Alert) => {
    if (!a.id) return;
    setBusyId(a.id);
    try {
      await api(`/api/alerts/${a.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !a.enabled }),
      });
      await mutate();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (a: Alert) => {
    if (!a.id) return;
    setBusyId(a.id);
    try {
      await api(`/api/alerts/${a.id}`, { method: "DELETE" });
      await mutate();
    } finally {
      setBusyId(null);
    }
  };

  const alerts = data?.alerts ?? [];

  return (
    <>
      <Topbar
        crumbs={["Workspace", "Alerts"]}
        right={
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => {
              setEditingId(null);
              setCreating(true);
            }}
            disabled={creating}
          >
            <Plus className="w-3.5 h-3.5" /> New
          </button>
        }
      />
      <div className="page max-w-[900px]">
        {error && (
          <div className="b-card p-3 flex items-center gap-2 text-[12px] t-neg">
            <AlertCircle className="w-3.5 h-3.5" />
            Could not load alerts.
            <button
              type="button"
              className="btn btn-sm ml-auto"
              onClick={() => mutate()}
            >
              Retry
            </button>
          </div>
        )}

        {creating && (
          <AlertEditor
            onSave={create}
            onCancel={() => setCreating(false)}
          />
        )}

        {isLoading && !data && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skel" style={{ height: 48 }} />
            ))}
          </div>
        )}

        {data && alerts.length === 0 && !creating && (
          <div className="b-card p-6 flex flex-col items-center text-center gap-3">
            <Bell className="w-6 h-6 text-fg-muted" />
            <div className="text-[14px] font-semibold">No alerts configured</div>
            <p className="text-[12px] text-fg-muted max-w-[420px] leading-[1.6]">
              Alerts notify you when price, IV, news, or breakout conditions hit
              on tickers you care about. Create your first alert to get started.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setCreating(true)}
            >
              <Plus className="w-3.5 h-3.5" /> New alert
            </button>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {alerts.map((a) =>
            editingId === a.id ? (
              <AlertEditor
                key={a.id}
                alert={a}
                onSave={(patch) => update(a.id!, patch)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div
                key={a.id}
                className="b-card p-3 flex items-center gap-3"
              >
                <span className="chip mono">{a.ticker}</span>
                <span className={KIND_CHIP[a.kind]}>{a.kind}</span>
                <span className="text-[12px] text-fg-muted truncate">
                  {ruleSummary(a.kind, a.rule)}
                </span>
                <label className="ml-auto flex items-center gap-2 text-[11px] text-fg-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={a.enabled ?? true}
                    onChange={() => toggle(a)}
                    disabled={busyId === a.id}
                  />
                  enabled
                </label>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setCreating(false);
                    setEditingId(a.id ?? null);
                  }}
                  disabled={busyId === a.id}
                >
                  <Pencil className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => remove(a)}
                  disabled={busyId === a.id}
                  aria-label="Delete alert"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ),
          )}
        </div>
      </div>
    </>
  );
}
