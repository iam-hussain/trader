"use client";
import clsx from "clsx";
import type { BacktestKpis as BacktestKpisType } from "@/lib/backtest";

export interface BacktestKpisProps {
  kpis: BacktestKpisType;
}

interface Tile {
  label: string;
  value: number | string | null;
  unit?: string;
  tone?: "auto" | "neutral" | "pos" | "neg" | "warn";
  digits?: number;
  hint?: string;
}

function fmt(n: number | string | null | undefined, digits = 2) {
  if (n === null || n === undefined) return "—";
  if (typeof n === "string") return n;
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function toneFor(value: number | null | undefined, mode: Tile["tone"] = "auto"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  if (mode === "neutral") return "";
  if (mode === "warn") return "t-neg";
  if (mode === "pos") return "t-pos";
  if (mode === "neg") return "t-neg";
  // auto: positive -> success; negative -> danger
  if (value > 0) return "t-pos";
  if (value < 0) return "t-neg";
  return "";
}

function chipFor(value: number | null | undefined, mode: Tile["tone"] = "auto"): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "chip";
  if (mode === "neutral") return "chip";
  if (mode === "warn") return value <= 0 ? "chip chip-warn" : "chip";
  if (value > 0) return "chip chip-pos";
  if (value < 0) return "chip chip-neg";
  return "chip";
}

function KpiCell({ label, value, unit, tone, digits = 2, hint }: Tile) {
  const numeric = typeof value === "number" ? value : null;
  return (
    <div className="b-card p-3 flex flex-col gap-1" title={hint}>
      <div className="text-[11px] uppercase tracking-[0.06em] text-fg-muted font-medium">
        {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className={clsx(
            "text-[16px] font-medium mono tabular-nums",
            toneFor(numeric, tone),
          )}
        >
          {fmt(value, digits)}
        </span>
        {unit && value !== null && value !== undefined && (
          <span className="text-[11px] t-dim">{unit}</span>
        )}
      </div>
      {numeric !== null && tone !== "neutral" && (
        <span
          className={clsx(chipFor(numeric, tone), "self-start mt-0.5 text-[9px]")}
        >
          {numeric > 0 ? "▲" : numeric < 0 ? "▼" : "·"}{" "}
          {Math.abs(numeric).toLocaleString(undefined, {
            maximumFractionDigits: digits,
          })}
          {unit ?? ""}
        </span>
      )}
    </div>
  );
}

export function BacktestKpis({ kpis }: BacktestKpisProps) {
  const tiles: Tile[] = [
    { label: "Total Return", value: kpis.totalReturnPct, unit: "%", tone: "auto" },
    { label: "Annualized", value: kpis.annualizedReturnPct, unit: "%", tone: "auto" },
    { label: "Sharpe", value: kpis.sharpe, tone: "auto" },
    { label: "Sortino", value: kpis.sortino, tone: "auto" },
    { label: "Max Drawdown", value: kpis.maxDrawdownPct, unit: "%", tone: "warn" },
    { label: "Win Rate", value: kpis.winRate, unit: "%", tone: "neutral" },
    { label: "Profit Factor", value: kpis.profitFactor, tone: "auto" },
    { label: "Expectancy", value: kpis.expectancy, unit: "$", tone: "auto" },
    { label: "Trades", value: kpis.tradeCount, tone: "neutral", digits: 0 },
    { label: "Avg Hold", value: kpis.avgHoldDays, unit: "d", tone: "neutral", digits: 1 },
    { label: "Best Trade", value: kpis.bestTradePct, unit: "%", tone: "auto" },
    { label: "Worst Trade", value: kpis.worstTradePct, unit: "%", tone: "auto" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
      {tiles.map((t) => (
        <KpiCell key={t.label} {...t} />
      ))}
    </div>
  );
}

export default BacktestKpis;
