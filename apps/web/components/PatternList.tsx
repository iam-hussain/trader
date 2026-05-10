"use client";
import clsx from "clsx";
import type { PatternDetection } from "@/lib/forecast";

export interface PatternListProps {
  detections: PatternDetection[];
}

function fmtPattern(p: string): string {
  // Normalize "BULLISH_ENGULFING" / "bullish_engulfing" -> "Bullish Engulfing"
  return p
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function patternTone(p: string): "pos" | "neg" | "info" {
  const lower = p.toLowerCase();
  if (
    lower.includes("bullish") ||
    lower.includes("hammer") ||
    lower.includes("morning") ||
    lower.includes("piercing")
  ) {
    return "pos";
  }
  if (
    lower.includes("bearish") ||
    lower.includes("shooting") ||
    lower.includes("evening") ||
    lower.includes("hanging")
  ) {
    return "neg";
  }
  return "info";
}

export function PatternList({ detections }: PatternListProps) {
  if (!detections || detections.length === 0) {
    return (
      <div className="b-card p-3 text-[12px] t-dim">
        No candlestick patterns detected in the lookback window.
      </div>
    );
  }
  const sorted = [...detections].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );
  return (
    <div className="b-card p-0 overflow-hidden">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-[0.06em] text-fg-muted">
            <th className="text-left p-2 font-medium">Pattern</th>
            <th className="text-left p-2 font-medium">Date</th>
            <th className="text-right p-2 font-medium">Bar Close</th>
            <th className="text-right p-2 font-medium">5d Win Rate</th>
            <th className="text-right p-2 font-medium">5d Mean Return</th>
            <th className="text-right p-2 font-medium">N</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((d, i) => {
            const tone = patternTone(d.pattern);
            const winRate = d.edge5d?.winRate ?? 0;
            const meanRet = d.edge5d?.meanReturnPct ?? 0;
            return (
              <tr
                key={`${d.pattern}-${d.date}-${i}`}
                style={{ borderTop: "1px solid var(--border)" }}
              >
                <td className="p-2">
                  <span
                    className={clsx(
                      "chip",
                      tone === "pos"
                        ? "chip-pos"
                        : tone === "neg"
                          ? "chip-neg"
                          : "chip-info",
                    )}
                  >
                    {fmtPattern(d.pattern)}
                  </span>
                </td>
                <td className="p-2 mono tabular-nums t-dim">{d.date}</td>
                <td className="p-2 text-right mono tabular-nums">
                  {d.barClose.toFixed(2)}
                </td>
                <td
                  className={clsx(
                    "p-2 text-right mono tabular-nums",
                    winRate >= 0.55 ? "t-pos" : winRate <= 0.45 ? "t-neg" : "",
                  )}
                >
                  {(winRate * 100).toFixed(0)}%
                </td>
                <td
                  className={clsx(
                    "p-2 text-right mono tabular-nums",
                    meanRet > 0 ? "t-pos" : meanRet < 0 ? "t-neg" : "",
                  )}
                >
                  {meanRet > 0 ? "+" : ""}
                  {meanRet.toFixed(2)}%
                </td>
                <td className="p-2 text-right mono tabular-nums t-dim">
                  {d.edge5d?.n ?? 0}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default PatternList;
