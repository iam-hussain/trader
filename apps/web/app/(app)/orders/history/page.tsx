"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { Topbar } from "@/components/Topbar";
import { fetcher } from "@/lib/api";
import type { Trade } from "@/lib/orders";

interface HistoryResponse {
  trades: Trade[];
}

type Outcome = "any" | "win" | "loss" | "scratch";

function defaultFromDate() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function outcomeOf(t: Trade): Exclude<Outcome, "any"> {
  const p = t.pnl ?? 0;
  if (p > 0) return "win";
  if (p < 0) return "loss";
  return "scratch";
}

export default function OrdersHistoryPage() {
  const [from, setFrom] = useState(defaultFromDate());
  const [to, setTo] = useState(todayIso());
  const [ticker, setTicker] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("any");

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (ticker.trim()) p.set("ticker", ticker.trim().toUpperCase());
    if (outcome !== "any") p.set("outcome", outcome);
    return p.toString();
  }, [from, to, ticker, outcome]);

  const { data, isLoading } = useSWR<HistoryResponse>(
    `/api/orders/history?${qs}`,
    fetcher,
    { keepPreviousData: true },
  );

  const trades = useMemo(() => {
    let rows = data?.trades ?? [];
    if (outcome !== "any") {
      rows = rows.filter((t) => outcomeOf(t) === outcome);
    }
    return rows;
  }, [data, outcome]);

  const totals = useMemo(() => {
    let pnl = 0;
    let wins = 0;
    let losses = 0;
    for (const t of trades) {
      pnl += t.pnl ?? 0;
      const o = outcomeOf(t);
      if (o === "win") wins++;
      else if (o === "loss") losses++;
    }
    const wr = trades.length > 0 ? (wins / trades.length) * 100 : 0;
    return { pnl, wins, losses, wr };
  }, [trades]);

  return (
    <>
      <Topbar crumbs={["Workspace", "Orders", "History"]} />
      <div className="page max-w-[1200px]">
        <section className="b-card p-3 flex items-end gap-3 flex-wrap">
          <Field label="From">
            <input
              type="date"
              className="input mono"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              className="input mono"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
          <Field label="Ticker">
            <input
              className="input mono"
              placeholder="any"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
            />
          </Field>
          <Field label="Outcome">
            <div className="seg">
              {(["any", "win", "loss", "scratch"] as Outcome[]).map((o) => (
                <button
                  key={o}
                  className={outcome === o ? "active" : ""}
                  onClick={() => setOutcome(o)}
                >
                  {o}
                </button>
              ))}
            </div>
          </Field>
          <div className="ml-auto flex flex-col items-end gap-1 text-[11px] mono tabular-nums">
            <span>
              <span className="t-muted">Trades</span> {trades.length} ·{" "}
              <span className="t-muted">Win rate</span> {totals.wr.toFixed(1)}%
            </span>
            <span
              className={
                totals.pnl > 0 ? "t-pos" : totals.pnl < 0 ? "t-neg" : ""
              }
            >
              Net P/L ${totals.pnl.toFixed(2)}
            </span>
          </div>
        </section>

        <section className="b-card overflow-hidden">
          <table className="t">
            <thead>
              <tr>
                <th>Opened</th>
                <th>Closed</th>
                <th>Ticker</th>
                <th>Side</th>
                <th className="r">Qty</th>
                <th className="r">Entry</th>
                <th className="r">Exit</th>
                <th className="r">P/L $</th>
                <th className="r">P/L %</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={10} className="text-center t-muted py-6">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading && trades.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center t-muted py-6">
                    No trades for these filters.
                  </td>
                </tr>
              )}
              {trades.map((t) => {
                const pnlPct =
                  t.entryPrice && t.exitPrice && t.entryPrice !== 0
                    ? ((t.exitPrice - t.entryPrice) / t.entryPrice) *
                      100 *
                      (t.side === "buy" ? 1 : -1)
                    : null;
                const pnlCls =
                  (t.pnl ?? 0) > 0
                    ? "t-pos"
                    : (t.pnl ?? 0) < 0
                      ? "t-neg"
                      : "";
                return (
                  <tr key={t.id}>
                    <td className="mono tabular-nums t-dim">
                      {new Date(t.openedAt).toLocaleString()}
                    </td>
                    <td className="mono tabular-nums t-dim">
                      {t.closedAt ? new Date(t.closedAt).toLocaleString() : "—"}
                    </td>
                    <td className="mono tabular-nums">{t.ticker}</td>
                    <td>
                      <span
                        className={
                          t.side === "buy" ? "chip chip-pos" : "chip chip-neg"
                        }
                      >
                        {t.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="r mono tabular-nums">{t.qty}</td>
                    <td className="r mono tabular-nums">
                      {t.entryPrice !== undefined ? t.entryPrice.toFixed(2) : "—"}
                    </td>
                    <td className="r mono tabular-nums">
                      {t.exitPrice !== undefined ? t.exitPrice.toFixed(2) : "—"}
                    </td>
                    <td className={`r mono tabular-nums ${pnlCls}`}>
                      {t.pnl !== undefined ? t.pnl.toFixed(2) : "—"}
                    </td>
                    <td className={`r mono tabular-nums ${pnlCls}`}>
                      {pnlPct !== null ? `${pnlPct.toFixed(2)}%` : "—"}
                    </td>
                    <td>
                      <span className="chip">{t.status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px]">
      <span className="t-muted uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}
