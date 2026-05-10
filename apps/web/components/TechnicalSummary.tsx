import clsx from "clsx";
import { Activity, TrendingDown, TrendingUp } from "lucide-react";
import { KpiTile } from "./KpiTile";

export interface TechnicalData {
  lastClose: number;
  rsi14: number | null;
  macd: { line: number; signal: number; hist: number } | null;
  ema: { ema20: number; ema50: number; ema200: number };
  atr14: number | null;
  trend: string;
  signals: string[];
  bbands: { upper: number; mid: number; lower: number; width: number } | null;
}

function trendStyle(trend: string) {
  const t = trend.toLowerCase();
  if (t.includes("up"))
    return {
      cls: "bg-pos/10 text-pos border-pos/30",
      Icon: TrendingUp,
    };
  if (t.includes("down"))
    return {
      cls: "bg-neg/10 text-neg border-neg/30",
      Icon: TrendingDown,
    };
  return {
    cls: "bg-bg-elevated text-fg-muted border-border",
    Icon: Activity,
  };
}

export function TechnicalSummary({ data }: { data: TechnicalData }) {
  const { cls, Icon } = trendStyle(data.trend);

  return (
    <section className="card p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Technical summary</h3>
        <span
          className={clsx(
            "inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border",
            cls,
          )}
        >
          <Icon className="w-3 h-3" />
          {data.trend}
        </span>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <KpiTile
          label="Last close"
          value={data.lastClose}
          unit="$"
          hint="Most recent close price"
        />
        <KpiTile
          label="RSI(14)"
          value={data.rsi14}
          hint="Relative strength index, 14-period"
        />
        <KpiTile
          label="MACD hist"
          value={data.macd ? data.macd.hist : null}
          delta={data.macd ? data.macd.hist : undefined}
          hint="MACD histogram"
        />
        <KpiTile
          label="ATR(14)"
          value={data.atr14}
          hint="Average true range, 14-period"
        />
        <KpiTile
          label="EMA20"
          value={data.ema.ema20}
          hint="20-period exponential moving average"
        />
        <KpiTile
          label="EMA50"
          value={data.ema.ema50}
          hint="50-period exponential moving average"
        />
        <KpiTile
          label="EMA200"
          value={data.ema.ema200}
          hint="200-period exponential moving average"
        />
        <KpiTile
          label="BB width"
          value={data.bbands ? data.bbands.width : null}
          hint="Bollinger Band width"
        />
        {data.bbands && (
          <>
            <KpiTile
              label="BB upper"
              value={data.bbands.upper}
              hint="Bollinger Band upper"
            />
            <KpiTile
              label="BB mid"
              value={data.bbands.mid}
              hint="Bollinger Band mid"
            />
            <KpiTile
              label="BB lower"
              value={data.bbands.lower}
              hint="Bollinger Band lower"
            />
          </>
        )}
        {data.macd && (
          <>
            <KpiTile
              label="MACD line"
              value={data.macd.line}
              hint="MACD line"
            />
            <KpiTile
              label="MACD signal"
              value={data.macd.signal}
              hint="MACD signal"
            />
          </>
        )}
      </div>

      {data.signals && data.signals.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.signals.map((s) => (
            <span
              key={s}
              className="inline-block text-[11px] px-2 py-0.5 rounded-full border border-border bg-bg-elevated text-fg-muted"
            >
              {s}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

export default TechnicalSummary;
