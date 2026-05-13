"use client";
import { use, useMemo, useState } from "react";
import useSWR from "swr";
import clsx from "clsx";
import { ArrowDownUp, Loader2 } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { BacktestKpis } from "@/components/BacktestKpis";
import { EquityCurveChart } from "@/components/EquityCurveChart";
import { DrawdownChart } from "@/components/DrawdownChart";
import { fetcher } from "@/lib/api";
import {
  runMonteCarlo,
  type BacktestRun,
  type BacktestTrade,
  type MonteCarloResponse,
} from "@/lib/backtest";

type SortKey =
  | "entryDate"
  | "exitDate"
  | "side"
  | "qty"
  | "pnl"
  | "pnlPct"
  | "holdDays"
  | "exitReason";

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

function McBar({
  label,
  value,
  min,
  max,
  unit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
}) {
  const range = max - min || 1;
  const t = Math.max(0, Math.min(1, (value - min) / range));
  const pos = value > 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="t-dim">{label}</span>
        <span
          className={clsx(
            "mono tabular-nums",
            pos ? "t-pos" : value < 0 ? "t-neg" : "",
          )}
        >
          {value > 0 ? "+" : ""}
          {value.toFixed(2)}
          {unit}
        </span>
      </div>
      <div
        className="h-1.5 rounded-full"
        style={{ background: "var(--bg-elev-2)" }}
      >
        <div
          className="h-1.5 rounded-full"
          style={{
            width: `${(t * 100).toFixed(1)}%`,
            background: pos ? "var(--success)" : "var(--danger)",
          }}
        />
      </div>
    </div>
  );
}

export default function BacktestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, error, isLoading } = useSWR<BacktestRun>(
    `/api/backtest/${encodeURIComponent(id)}`,
    fetcher,
    { refreshInterval: 5_000 },
  );

  const [sortKey, setSortKey] = useState<SortKey>("entryDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [mcBusy, setMcBusy] = useState(false);
  const [mcRes, setMcRes] = useState<MonteCarloResponse | null>(null);
  const [mcErr, setMcErr] = useState<string | null>(null);

  const trades = data?.result?.trades ?? [];
  const equity = data?.result?.equity_curve ?? [];

  const drawdownSeries = useMemo(() => {
    if (!equity.length) return [];
    let peak = equity[0]!.equity;
    return equity.map((p) => {
      if (p.equity > peak) peak = p.equity;
      const dd =
        typeof p.drawdown === "number"
          ? p.drawdown
          : peak > 0
            ? ((p.equity - peak) / peak) * 100
            : 0;
      return { date: p.date, drawdown: dd };
    });
  }, [equity]);

  const equityWithDD = useMemo(() => {
    if (!equity.length) return [];
    let peak = equity[0]!.equity;
    return equity.map((p) => {
      if (p.equity > peak) peak = p.equity;
      const dd =
        typeof p.drawdown === "number"
          ? p.drawdown
          : peak > 0
            ? ((p.equity - peak) / peak) * 100
            : 0;
      return { ...p, drawdown: dd };
    });
  }, [equity]);

  const sortedTrades = useMemo(() => {
    const list = [...trades];
    list.sort((a, b) => {
      const av = (a as unknown as Record<SortKey, unknown>)[sortKey];
      const bv = (b as unknown as Record<SortKey, unknown>)[sortKey];
      if (av === bv) return 0;
      if (av === undefined || av === null) return 1;
      if (bv === undefined || bv === null) return -1;
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [trades, sortKey, sortDir]);

  const setSort = (k: SortKey) => {
    if (k === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  const runMC = async () => {
    if (!trades.length) return;
    setMcBusy(true);
    setMcErr(null);
    try {
      const res = await runMonteCarlo(trades, 1000);
      setMcRes(res);
    } catch (e) {
      setMcErr(e instanceof Error ? e.message : "Monte Carlo failed");
    } finally {
      setMcBusy(false);
    }
  };

  const headerLabel = data
    ? `${data.strategy} · ${data.symbol}`
    : "Backtest";

  return (
    <>
      <Topbar crumbs={["Markets", "Backtest", headerLabel]} />
      <div className="page max-w-[1100px] flex flex-col gap-3">
        {error && (
          <div className="b-card p-4 t-neg text-[12px]">
            Failed to load run: <span className="mono">{String(error)}</span>
          </div>
        )}
        {isLoading && !data && (
          <div className="b-card p-4">
            <div className="skel h-5 w-1/3 mb-2" />
            <div className="skel h-40 w-full" />
          </div>
        )}

        {data && (
          <>
            <div className="b-card p-3 flex items-center gap-3 flex-wrap">
              <div className="flex flex-col">
                <div className="text-[11px] uppercase tracking-[0.06em] text-fg-muted">
                  Strategy
                </div>
                <div className="font-medium text-[13px]">{data.strategy}</div>
              </div>
              <div className="flex flex-col">
                <div className="text-[11px] uppercase tracking-[0.06em] text-fg-muted">
                  Symbol
                </div>
                <div className="font-medium mono tabular-nums text-[13px]">
                  {data.symbol}
                </div>
              </div>
              {(data.startDate || data.endDate) && (
                <div className="flex flex-col">
                  <div className="text-[11px] uppercase tracking-[0.06em] text-fg-muted">
                    Range
                  </div>
                  <div className="mono tabular-nums text-[12px]">
                    {data.startDate ?? "—"} → {data.endDate ?? "—"}
                  </div>
                </div>
              )}
              <div className="flex flex-col">
                <div className="text-[11px] uppercase tracking-[0.06em] text-fg-muted">
                  Status
                </div>
                <StatusChip status={data.status} />
              </div>
              <div className="ml-auto text-[11px] mono t-dim">
                created {new Date(data.createdAt).toLocaleString()}
              </div>
            </div>

            {data.error && (
              <div className="b-card p-3 t-neg text-[12px]">
                {data.error}
              </div>
            )}

            {data.result?.kpis && <BacktestKpis kpis={data.result.kpis} />}

            {equityWithDD.length > 1 && (
              <EquityCurveChart data={equityWithDD} showDrawdown height={260} />
            )}
            {drawdownSeries.length > 1 && (
              <DrawdownChart data={drawdownSeries} height={120} />
            )}

            <section className="b-card p-0 overflow-hidden">
              <div className="flex items-center gap-2 p-2">
                <div className="text-[11px] uppercase tracking-[0.06em] text-fg-muted font-medium">
                  Trades
                </div>
                <span className="text-[11px] mono tabular-nums t-dim">
                  {trades.length} total
                </span>
              </div>
              {trades.length === 0 ? (
                <div className="p-3 text-[12px] t-dim">No trades.</div>
              ) : (
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-[0.06em] text-fg-muted">
                      <SortHeader
                        label="Entry"
                        k="entryDate"
                        cur={sortKey}
                        dir={sortDir}
                        onClick={setSort}
                      />
                      <SortHeader
                        label="Exit"
                        k="exitDate"
                        cur={sortKey}
                        dir={sortDir}
                        onClick={setSort}
                      />
                      <SortHeader
                        label="Side"
                        k="side"
                        cur={sortKey}
                        dir={sortDir}
                        onClick={setSort}
                      />
                      <SortHeader
                        label="Qty"
                        k="qty"
                        cur={sortKey}
                        dir={sortDir}
                        onClick={setSort}
                        align="right"
                      />
                      <SortHeader
                        label="P/L $"
                        k="pnl"
                        cur={sortKey}
                        dir={sortDir}
                        onClick={setSort}
                        align="right"
                      />
                      <SortHeader
                        label="P/L %"
                        k="pnlPct"
                        cur={sortKey}
                        dir={sortDir}
                        onClick={setSort}
                        align="right"
                      />
                      <SortHeader
                        label="Hold (d)"
                        k="holdDays"
                        cur={sortKey}
                        dir={sortDir}
                        onClick={setSort}
                        align="right"
                      />
                      <SortHeader
                        label="Exit Reason"
                        k="exitReason"
                        cur={sortKey}
                        dir={sortDir}
                        onClick={setSort}
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTrades.map((t, i) => (
                      <TradeRow key={t.id ?? i} trade={t} />
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="b-card p-3 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="text-[11px] uppercase tracking-[0.06em] text-fg-muted font-medium">
                  Monte Carlo
                </div>
                <span className="text-[11px] t-dim">
                  Resample trades to estimate the distribution of outcomes.
                </span>
                <button
                  className="btn btn-primary btn-sm ml-auto"
                  onClick={() => void runMC()}
                  disabled={mcBusy || trades.length === 0}
                >
                  {mcBusy ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Running…
                    </>
                  ) : (
                    "Run Monte Carlo"
                  )}
                </button>
              </div>
              {mcErr && <div className="text-[11px] t-neg">{mcErr}</div>}
              {mcRes && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-2">
                    <div className="text-[11px] t-dim">Final return %</div>
                    {(["p5", "p25", "p50", "p75", "p95"] as const).map((k) => {
                      const vs = [
                        mcRes.finalReturnPct.p5,
                        mcRes.finalReturnPct.p25,
                        mcRes.finalReturnPct.p50,
                        mcRes.finalReturnPct.p75,
                        mcRes.finalReturnPct.p95,
                      ];
                      return (
                        <McBar
                          key={k}
                          label={k.toUpperCase()}
                          value={mcRes.finalReturnPct[k]}
                          min={Math.min(...vs, 0)}
                          max={Math.max(...vs, 0)}
                          unit="%"
                        />
                      );
                    })}
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="text-[11px] t-dim">Max drawdown %</div>
                    {(["p5", "p25", "p50", "p75", "p95"] as const).map((k) => {
                      const vs = [
                        mcRes.maxDrawdownPct.p5,
                        mcRes.maxDrawdownPct.p25,
                        mcRes.maxDrawdownPct.p50,
                        mcRes.maxDrawdownPct.p75,
                        mcRes.maxDrawdownPct.p95,
                      ];
                      return (
                        <McBar
                          key={k}
                          label={k.toUpperCase()}
                          value={mcRes.maxDrawdownPct[k]}
                          min={Math.min(...vs, 0)}
                          max={Math.max(...vs, 0)}
                          unit="%"
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}

function SortHeader({
  label,
  k,
  cur,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  k: SortKey;
  cur: SortKey;
  dir: "asc" | "desc";
  onClick: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = cur === k;
  return (
    <th
      className={clsx(
        "p-2 font-medium select-none cursor-pointer",
        align === "right" ? "text-right" : "text-left",
      )}
      onClick={() => onClick(k)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (
          <ArrowDownUp
            className={clsx(
              "w-2.5 h-2.5",
              dir === "asc" ? "rotate-180" : "",
            )}
          />
        )}
      </span>
    </th>
  );
}

function TradeRow({ trade }: { trade: BacktestTrade }) {
  // Tolerate legacy snake_case trades that predate the camelCase fix in
  // quant/backtest/engine.py:result_to_dict. New runs return camelCase only.
  const t = trade as BacktestTrade & {
    entry_date?: string;
    exit_date?: string;
    hold_days?: number;
    return_pct?: number;
    reason?: string;
  };
  const pnl = t.pnl ?? 0;
  const pnlPct = t.pnlPct ?? t.return_pct ?? 0;
  const holdDays = t.holdDays ?? t.hold_days ?? 0;
  const entryDate = t.entryDate ?? t.entry_date ?? "";
  const exitDate = t.exitDate ?? t.exit_date ?? "";
  const exitReason = t.exitReason ?? t.reason;
  return (
    <tr style={{ borderTop: "1px solid var(--border)" }}>
      <td className="p-2 mono tabular-nums t-dim">{entryDate}</td>
      <td className="p-2 mono tabular-nums t-dim">{exitDate}</td>
      <td className="p-2">
        <span
          className={clsx(
            "chip",
            trade.side === "long"
              ? "chip-pos"
              : trade.side === "short"
                ? "chip-neg"
                : "",
          )}
        >
          {String(trade.side).toUpperCase()}
        </span>
      </td>
      <td className="p-2 text-right mono tabular-nums">{trade.qty}</td>
      <td
        className={clsx(
          "p-2 text-right mono tabular-nums",
          pnl > 0 ? "t-pos" : pnl < 0 ? "t-neg" : "",
        )}
      >
        {pnl > 0 ? "+" : ""}
        {pnl.toFixed(2)}
      </td>
      <td
        className={clsx(
          "p-2 text-right mono tabular-nums",
          pnlPct > 0 ? "t-pos" : pnlPct < 0 ? "t-neg" : "",
        )}
      >
        {pnlPct > 0 ? "+" : ""}
        {pnlPct.toFixed(2)}%
      </td>
      <td className="p-2 text-right mono tabular-nums">
        {holdDays.toFixed(1)}
      </td>
      <td className="p-2 t-dim">{exitReason ?? "—"}</td>
    </tr>
  );
}
