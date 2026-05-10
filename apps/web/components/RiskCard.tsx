export interface RiskCardProps {
  pnlPct: number;       // today's P/L %
  pnlAtRisk: number;    // remaining risk budget $
  tradesUsed: number;
  tradesCap: number;
  drawdownPct: number;
  drawdownCap: number;
  exposurePct: number;  // % of account currently deployed
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

export function RiskCard({
  pnlPct,
  pnlAtRisk,
  tradesUsed,
  tradesCap,
  drawdownPct,
  drawdownCap,
  exposurePct,
}: RiskCardProps) {
  const pnlSign = pnlPct >= 0 ? "+" : "";
  const tradesProgress = clamp((tradesUsed / tradesCap) * 100);
  const ddProgress = clamp((Math.abs(drawdownPct) / drawdownCap) * 100);
  const ddBarColor = ddProgress > 80 ? "var(--danger)" : ddProgress > 50 ? "var(--warning)" : "var(--success)";
  const expProgress = clamp(exposurePct);
  const expBarColor = expProgress > 80 ? "var(--danger)" : expProgress > 50 ? "var(--warning)" : "var(--primary)";

  return (
    <div className="b-card" style={{ padding: "12px 14px" }}>
      <div className="text-[11px] text-fg-muted mb-1.5 font-medium">Today's risk</div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className={`mono text-[20px] font-semibold tracking-tight ${pnlPct >= 0 ? "t-pos" : "t-neg"}`}>
          {pnlSign}
          {pnlPct.toFixed(2)}%
        </span>
        <span className="mono t-muted text-[11px]">${pnlAtRisk.toLocaleString()} R</span>
      </div>
      <div className="flex flex-col gap-2 text-[11px] text-fg-muted">
        <div>
          <div className="flex justify-between mb-0.5">
            <span>Trades today</span>
            <span className="mono t-text">
              {tradesUsed} / {tradesCap}
            </span>
          </div>
          <div className="progress">
            <span style={{ width: `${tradesProgress}%` }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between mb-0.5">
            <span>Drawdown</span>
            <span className="mono t-text">
              {Math.abs(drawdownPct).toFixed(1)} / {drawdownCap.toFixed(1)}%
            </span>
          </div>
          <div className="progress">
            <span style={{ width: `${ddProgress}%`, background: ddBarColor }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between mb-0.5">
            <span>Acct exposure</span>
            <span className="mono t-text">{exposurePct}%</span>
          </div>
          <div className="progress">
            <span style={{ width: `${expProgress}%`, background: expBarColor }} />
          </div>
        </div>
      </div>
    </div>
  );
}
