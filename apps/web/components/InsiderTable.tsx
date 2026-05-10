"use client";
import { useState } from "react";
import clsx from "clsx";

export interface InsiderRow {
  filingDate: string;
  tradeDate: string;
  insiderName: string;
  title?: string;
  tradeType: string;
  price?: number;
  qty?: number;
  value?: number;
  deltaOwn?: number;
}

function formatValue(v: number | undefined) {
  if (v === undefined || v === null || !Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1_000_000)
    return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

export function InsiderTable({ rows }: { rows: InsiderRow[] }) {
  const [showAll, setShowAll] = useState(false);

  if (!rows || rows.length === 0) {
    return (
      <div className="card p-4 text-sm text-fg-muted">
        No insider transactions.
      </div>
    );
  }

  const visible = showAll ? rows : rows.slice(0, 10);

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-medium">Insider transactions</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-fg-muted">
            <tr className="border-b border-border">
              <th className="text-left px-4 py-2 font-medium">Filed</th>
              <th className="text-left px-4 py-2 font-medium">Trade</th>
              <th className="text-left px-4 py-2 font-medium">Insider</th>
              <th className="text-left px-4 py-2 font-medium">Action</th>
              <th className="text-right px-4 py-2 font-medium">Price</th>
              <th className="text-right px-4 py-2 font-medium">Qty</th>
              <th className="text-right px-4 py-2 font-medium">Value</th>
              <th className="text-right px-4 py-2 font-medium">Δ Own</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => {
              const isBuy = r.tradeType === "P";
              const isSell = r.tradeType === "S";
              return (
                <tr
                  key={`${r.filingDate}-${r.insiderName}-${i}`}
                  className="border-b border-border/60 last:border-0 hover:bg-bg-elevated/40"
                >
                  <td className="px-4 py-2 font-mono tabular-nums text-fg-muted">
                    {r.filingDate}
                  </td>
                  <td className="px-4 py-2 font-mono tabular-nums text-fg-muted">
                    {r.tradeDate}
                  </td>
                  <td className="px-4 py-2">
                    <div className="font-medium">{r.insiderName}</div>
                    {r.title && (
                      <div className="text-xs text-fg-muted">{r.title}</div>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={clsx(
                        "inline-block text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border font-medium",
                        isBuy
                          ? "bg-pos/10 text-pos border-pos/30"
                          : isSell
                            ? "bg-neg/10 text-neg border-neg/30"
                            : "bg-bg-elevated text-fg-muted border-border",
                      )}
                    >
                      {isBuy ? "BUY" : isSell ? "SELL" : r.tradeType}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">
                    {r.price !== undefined ? `$${r.price.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">
                    {r.qty !== undefined ? r.qty.toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">
                    {formatValue(r.value)}
                  </td>
                  <td
                    className={clsx(
                      "px-4 py-2 text-right font-mono tabular-nums",
                      r.deltaOwn !== undefined
                        ? r.deltaOwn >= 0
                          ? "text-pos"
                          : "text-neg"
                        : "text-fg-muted",
                    )}
                  >
                    {r.deltaOwn !== undefined
                      ? `${r.deltaOwn >= 0 ? "+" : ""}${r.deltaOwn.toFixed(2)}%`
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > 10 && (
        <div className="px-4 py-2 border-t border-border">
          <button
            type="button"
            className="btn"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "Show top 10" : `Show all ${rows.length}`}
          </button>
        </div>
      )}
    </div>
  );
}

export default InsiderTable;
