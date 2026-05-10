"use client";
import { useState } from "react";
import clsx from "clsx";

export interface UnusualActivityItem {
  type: "call" | "put";
  strike: number;
  expiry: string;
  volume: number;
  openInterest: number;
  ratio: number;
  premium: number;
  bidAsk: string;
}

function formatPremium(p: number) {
  if (!Number.isFinite(p)) return "—";
  if (Math.abs(p) >= 1_000_000)
    return `$${(p / 1_000_000).toFixed(2)}M`;
  return `$${(p / 1_000).toFixed(1)}K`;
}

function bidAskClass(label: string) {
  const s = label.toLowerCase();
  if (s.includes("ask") || s.includes("above")) return "bg-pos/10 text-pos border-pos/30";
  if (s.includes("bid") || s.includes("below")) return "bg-neg/10 text-neg border-neg/30";
  return "bg-bg-elevated text-fg-muted border-border";
}

export function UnusualActivityList({ items }: { items: UnusualActivityItem[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, 10);

  if (!items || items.length === 0) {
    return (
      <div className="card p-4 text-sm text-fg-muted">
        No unusual options activity.
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-medium">Unusual options activity</h3>
        <span className="text-xs text-fg-muted font-mono tabular-nums">
          {items.length} contracts
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-fg-muted">
            <tr className="border-b border-border">
              <th className="text-left px-4 py-2 font-medium">Type</th>
              <th className="text-right px-4 py-2 font-medium">Strike</th>
              <th className="text-left px-4 py-2 font-medium">Expiry</th>
              <th className="text-right px-4 py-2 font-medium">Vol / OI</th>
              <th className="text-right px-4 py-2 font-medium">Ratio</th>
              <th className="text-right px-4 py-2 font-medium">Premium</th>
              <th className="text-left px-4 py-2 font-medium">Side</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((it, i) => (
              <tr
                key={`${it.type}-${it.strike}-${it.expiry}-${i}`}
                className="border-b border-border/60 last:border-0 hover:bg-bg-elevated/40"
              >
                <td className="px-4 py-2">
                  <span
                    className={clsx(
                      "inline-block text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border",
                      it.type === "call"
                        ? "bg-pos/10 text-pos border-pos/30"
                        : "bg-neg/10 text-neg border-neg/30",
                    )}
                  >
                    {it.type}
                  </span>
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">
                  {it.strike.toFixed(2)}
                </td>
                <td className="px-4 py-2 font-mono tabular-nums text-fg-muted">
                  {it.expiry}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">
                  {it.volume.toLocaleString()} /{" "}
                  <span className="text-fg-muted">
                    {it.openInterest.toLocaleString()}
                  </span>
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">
                  {it.ratio.toFixed(2)}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">
                  {formatPremium(it.premium)}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={clsx(
                      "inline-block text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border",
                      bidAskClass(it.bidAsk),
                    )}
                  >
                    {it.bidAsk}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {items.length > 10 && (
        <div className="px-4 py-2 border-t border-border">
          <button
            type="button"
            className="btn"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "Show top 10" : `Show all ${items.length}`}
          </button>
        </div>
      )}
    </div>
  );
}

export default UnusualActivityList;
