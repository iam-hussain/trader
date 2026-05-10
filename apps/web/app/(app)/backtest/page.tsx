"use client";
import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Plus, X, Loader2, ExternalLink } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { StrategyCard } from "@/components/StrategyCard";
import { fetcher } from "@/lib/api";
import {
  pollJob,
  runBacktest,
  type ParamSchema,
  type RunsResponse,
  type Strategy,
  type StrategiesResponse,
} from "@/lib/backtest";

type ParamValue = string | number | boolean;

function defaultFor(schema: ParamSchema): ParamValue {
  if (schema.default !== undefined && schema.default !== null) {
    return schema.default as ParamValue;
  }
  if (schema.type === "boolean") return false;
  if (schema.type === "select" && schema.options && schema.options.length > 0) {
    return schema.options[0]!;
  }
  if (schema.type === "integer" || schema.type === "number") {
    return schema.min ?? 0;
  }
  return "";
}

function ParamField({
  name,
  schema,
  value,
  onChange,
}: {
  name: string;
  schema: ParamSchema;
  value: ParamValue;
  onChange: (v: ParamValue) => void;
}) {
  const label = schema.label ?? name;
  const id = `param-${name}`;
  if (schema.type === "boolean") {
    return (
      <label
        htmlFor={id}
        className="flex items-center gap-2 text-[12px]"
        title={schema.description}
      >
        <input
          id={id}
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{label}</span>
      </label>
    );
  }
  if (schema.type === "select" && schema.options) {
    return (
      <label className="flex flex-col gap-1 text-[11px]" title={schema.description}>
        <span className="t-dim">{label}</span>
        <select
          className="input h-[28px] text-[12px]"
          value={String(value)}
          onChange={(e) => {
            const opt = schema.options!.find((o) => String(o) === e.target.value);
            onChange((opt ?? e.target.value) as ParamValue);
          }}
        >
          {schema.options.map((o) => (
            <option key={String(o)} value={String(o)}>
              {String(o)}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (schema.type === "integer" || schema.type === "number") {
    return (
      <label
        className="flex flex-col gap-1 text-[11px]"
        title={schema.description}
      >
        <span className="t-dim">{label}</span>
        <input
          className="input mono h-[28px] text-[12px]"
          type="number"
          step={schema.step ?? (schema.type === "integer" ? 1 : "any")}
          min={schema.min}
          max={schema.max}
          value={String(value)}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") {
              onChange("");
              return;
            }
            const n =
              schema.type === "integer" ? parseInt(raw, 10) : parseFloat(raw);
            onChange(Number.isFinite(n) ? n : raw);
          }}
        />
      </label>
    );
  }
  // string
  return (
    <label className="flex flex-col gap-1 text-[11px]" title={schema.description}>
      <span className="t-dim">{label}</span>
      <input
        className="input mono h-[28px] text-[12px]"
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function NewBacktestForm({
  strategies,
  onClose,
}: {
  strategies: Strategy[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [strategyId, setStrategyId] = useState<string>(
    strategies[0]?.id ?? "",
  );
  const [symbol, setSymbol] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const oneYearAgo = new Date(Date.now() - 365 * 86400_000)
    .toISOString()
    .slice(0, 10);
  const [startDate, setStartDate] = useState(oneYearAgo);
  const [endDate, setEndDate] = useState(today);
  const strat = strategies.find((s) => s.id === strategyId);
  const initialParams: Record<string, ParamValue> = {};
  if (strat) {
    for (const [k, v] of Object.entries(strat.params)) {
      initialParams[k] = defaultFor(v);
    }
  }
  const [paramVals, setParamVals] = useState<Record<string, ParamValue>>(
    initialParams,
  );
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Re-init params when strategy changes
  const onStratChange = (id: string) => {
    setStrategyId(id);
    const s = strategies.find((x) => x.id === id);
    if (!s) return;
    const next: Record<string, ParamValue> = {};
    for (const [k, v] of Object.entries(s.params)) {
      next[k] = defaultFor(v);
    }
    setParamVals(next);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!strategyId || !symbol.trim()) {
      setErr("Pick a strategy and enter a symbol.");
      return;
    }
    setBusy(true);
    setStatusMsg("Submitting…");
    try {
      const { runId, jobId } = await runBacktest({
        strategy: strategyId,
        symbol: symbol.trim().toUpperCase(),
        startDate,
        endDate,
        params: paramVals,
      });
      setStatusMsg("Running…");
      const job = await pollJob(jobId);
      if (job.status === "done") {
        router.push(`/backtest/${encodeURIComponent(job.runId ?? runId)}`);
      } else {
        setErr(job.error ?? "Backtest failed");
        setStatusMsg(null);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Backtest failed");
      setStatusMsg(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="b-card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="text-[13px] font-medium">New backtest</div>
        <button
          className="btn btn-ghost btn-sm ml-auto"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <label className="flex flex-col gap-1 text-[11px] sm:col-span-2">
          <span className="t-dim">Strategy</span>
          <select
            className="input h-[28px] text-[12px]"
            value={strategyId}
            onChange={(e) => onStratChange(e.target.value)}
          >
            {strategies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px]">
          <span className="t-dim">Symbol</span>
          <input
            className="input mono h-[28px] text-[12px]"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="AAPL"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px]">
          <span className="t-dim">Start</span>
          <input
            className="input mono h-[28px] text-[12px]"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] sm:col-span-1">
          <span className="t-dim">End</span>
          <input
            className="input mono h-[28px] text-[12px]"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>

        {strat && Object.keys(strat.params).length > 0 && (
          <div
            className="sm:col-span-4 mt-1 pt-2"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <div className="text-[10px] uppercase tracking-wide t-dim mb-2">
              Parameters
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {Object.entries(strat.params).map(([k, schema]) => (
                <ParamField
                  key={k}
                  name={k}
                  schema={schema}
                  value={paramVals[k] ?? defaultFor(schema)}
                  onChange={(v) =>
                    setParamVals((prev) => ({ ...prev, [k]: v }))
                  }
                />
              ))}
            </div>
          </div>
        )}

        <div className="sm:col-span-4 flex items-center gap-2 mt-2">
          {statusMsg && (
            <span className="text-[11px] t-dim flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              {statusMsg}
            </span>
          )}
          {err && <span className="text-[11px] t-neg">{err}</span>}
          <button
            type="submit"
            className="btn btn-primary btn-sm ml-auto"
            disabled={busy}
          >
            {busy ? "Running…" : "Run backtest"}
          </button>
        </div>
      </form>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const cls =
    status === "done"
      ? "chip chip-pos"
      : status === "failed"
        ? "chip chip-neg"
        : status === "running"
          ? "chip chip-info"
          : "chip";
  return <span className={cls}>{status}</span>;
}

export default function BacktestPage() {
  const [showForm, setShowForm] = useState(false);
  const { data: stratData } = useSWR<StrategiesResponse>(
    "/api/backtest/strategies",
    fetcher,
  );
  const { data: runsData, mutate: refetchRuns } = useSWR<RunsResponse>(
    "/api/backtest",
    fetcher,
    { refreshInterval: 5_000 },
  );
  const strategies = stratData?.strategies ?? [];
  const runs = runsData?.runs ?? [];

  return (
    <>
      <Topbar
        crumbs={["Markets", "Backtest"]}
        right={
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setShowForm((v) => !v)}
          >
            <Plus className="w-3 h-3" /> New backtest
          </button>
        }
      />
      <div className="page max-w-[1100px] flex flex-col gap-3">
        {showForm && (
          <NewBacktestForm
            strategies={strategies}
            onClose={() => {
              setShowForm(false);
              void refetchRuns();
            }}
          />
        )}

        <section className="flex flex-col gap-2">
          <div className="text-[11px] uppercase tracking-[0.06em] text-fg-muted font-medium">
            Strategy library
          </div>
          {!stratData ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="b-card p-3">
                  <div className="skel h-4 w-1/2 mb-2" />
                  <div className="skel h-3 w-full mb-1" />
                  <div className="skel h-3 w-3/4" />
                </div>
              ))}
            </div>
          ) : strategies.length === 0 ? (
            <div className="b-card p-3 text-[12px] t-dim">
              No strategies registered.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {strategies.map((s) => (
                <StrategyCard
                  key={s.id}
                  id={s.id}
                  name={s.name}
                  description={s.description}
                  params={s.params}
                  onRun={() => {
                    setShowForm(true);
                    // small delay to ensure form mounts and select picks up
                    setTimeout(() => {
                      const el = document.querySelector<HTMLSelectElement>(
                        ".b-card form select",
                      );
                      if (el) {
                        el.value = s.id;
                        el.dispatchEvent(new Event("change", { bubbles: true }));
                      }
                    }, 0);
                  }}
                />
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <div className="text-[11px] uppercase tracking-[0.06em] text-fg-muted font-medium">
            Recent runs
          </div>
          {!runsData ? (
            <div className="b-card p-3">
              <div className="skel h-3 w-full mb-1" />
              <div className="skel h-3 w-2/3" />
            </div>
          ) : runs.length === 0 ? (
            <div className="b-card p-3 text-[12px] t-dim">
              No backtests yet. Click &ldquo;New backtest&rdquo; above.
            </div>
          ) : (
            <div className="b-card p-0 overflow-hidden">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.06em] text-fg-muted">
                    <th className="text-left p-2 font-medium">Strategy</th>
                    <th className="text-left p-2 font-medium">Symbol</th>
                    <th className="text-left p-2 font-medium">Status</th>
                    <th className="text-right p-2 font-medium">Total Return</th>
                    <th className="text-right p-2 font-medium">Sharpe</th>
                    <th className="text-right p-2 font-medium">Trades</th>
                    <th className="text-left p-2 font-medium">Created</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => {
                    const tr = r.kpis?.totalReturnPct;
                    const sharpe = r.kpis?.sharpe;
                    return (
                      <tr
                        key={r.id}
                        style={{ borderTop: "1px solid var(--border)" }}
                      >
                        <td className="p-2">{r.strategy}</td>
                        <td className="p-2 mono tabular-nums">{r.symbol}</td>
                        <td className="p-2">
                          <StatusChip status={r.status} />
                        </td>
                        <td
                          className={clsx(
                            "p-2 text-right mono tabular-nums",
                            typeof tr === "number"
                              ? tr > 0
                                ? "t-pos"
                                : tr < 0
                                  ? "t-neg"
                                  : ""
                              : "t-dim",
                          )}
                        >
                          {typeof tr === "number"
                            ? `${tr > 0 ? "+" : ""}${tr.toFixed(2)}%`
                            : "—"}
                        </td>
                        <td className="p-2 text-right mono tabular-nums">
                          {typeof sharpe === "number" ? sharpe.toFixed(2) : "—"}
                        </td>
                        <td className="p-2 text-right mono tabular-nums">
                          {r.kpis?.tradeCount ?? "—"}
                        </td>
                        <td className="p-2 mono tabular-nums t-dim">
                          {new Date(r.createdAt).toLocaleString()}
                        </td>
                        <td className="p-2 text-right">
                          <Link
                            href={`/backtest/${encodeURIComponent(r.id)}`}
                            className="btn btn-ghost btn-sm"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
