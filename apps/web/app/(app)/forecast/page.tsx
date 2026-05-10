import { Topbar } from "@/components/Topbar";

export default function ForecastPage() {
  return (
    <>
      <Topbar crumbs={["Markets", "Forecast"]} />
      <div className="page max-w-[1100px]">
        <div className="b-card p-4 text-[12px] text-fg-muted leading-[1.6]">
          Phase 5: Prophet next-week directional forecast with confidence bands,
          ARIMA + GARCH volatility forecast, and pattern recognition over recent
          candles. &ldquo;Replay mode&rdquo; lets you re-run the engine on
          historical data.
        </div>
      </div>
    </>
  );
}
