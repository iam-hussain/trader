"use client";

export interface RiskHeaderProps {
  tradesUsed: number;
  tradesCap: number;
  pnlPct: number;
  pnlAtRisk: number;
  drawdownPct: number;
  drawdownCap: number;
}

function colorForRatio(used: number, cap: number): string {
  if (cap <= 0) return "var(--text)";
  const r = used / cap;
  if (r >= 1) return "var(--danger)";
  if (r >= 0.8) return "var(--warning)";
  return "var(--text)";
}

function colorForPnl(pnlPct: number): string {
  if (pnlPct > 0) return "var(--success)";
  if (pnlPct < 0) return "var(--danger)";
  return "var(--text)";
}

export function RiskHeader({
  tradesUsed,
  tradesCap,
  pnlPct,
  pnlAtRisk,
  drawdownPct,
  drawdownCap,
}: RiskHeaderProps) {
  const tradesColor = colorForRatio(tradesUsed, tradesCap);
  const ddColor = colorForRatio(drawdownPct, drawdownCap);
  const pnlColor = colorForPnl(pnlPct);
  const sign = pnlPct >= 0 ? "+" : "";

  return (
    <div className="b-card p-3 flex items-center gap-4 flex-wrap text-[12px]">
      <span className="t-dim uppercase tracking-wide text-[10px]">Today</span>

      <span className="flex items-baseline gap-1">
        <span className="t-muted">trades</span>
        <span className="mono tabular-nums" style={{ color: tradesColor }}>
          {tradesUsed}/{tradesCap}
        </span>
      </span>

      <span className="t-dim">·</span>

      <span className="flex items-baseline gap-1">
        <span className="t-muted">P/L</span>
        <span className="mono tabular-nums" style={{ color: pnlColor }}>
          {sign}
          {pnlPct.toFixed(2)}%
        </span>
        <span className="t-dim mono tabular-nums">
          (${pnlAtRisk.toFixed(0)})
        </span>
      </span>

      <span className="t-dim">·</span>

      <span className="flex items-baseline gap-1">
        <span className="t-muted">DD</span>
        <span className="mono tabular-nums" style={{ color: ddColor }}>
          {drawdownPct.toFixed(1)}/{drawdownCap.toFixed(1)}%
        </span>
      </span>
    </div>
  );
}
