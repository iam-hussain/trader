import { Topbar } from "@/components/Topbar";

export default function BacktestPage() {
  return (
    <>
      <Topbar crumbs={["Markets", "Backtest"]} />
      <div className="page max-w-[1100px]">
        <div className="b-card p-4 text-[12px] text-fg-muted leading-[1.6]">
          Phase 5: vectorbt-backed strategy library (EMA crossover, RSI mean
          reversion, Earnings PEAD, gap-and-go, ATR breakout, opening range
          breakout) with walk-forward + Monte Carlo. Outputs equity curve,
          drawdown, win rate, profit factor, Sharpe / Sortino, expectancy, max
          DD, and the trade list.
        </div>
      </div>
    </>
  );
}
