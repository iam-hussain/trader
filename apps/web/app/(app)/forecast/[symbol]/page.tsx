"use client";
import { use, useMemo, useState } from "react";
import useSWR from "swr";
import clsx from "clsx";
import { TrendingUp, TrendingDown, Minus, Activity, Shapes } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { ForecastChart } from "@/components/ForecastChart";
import { PatternList } from "@/components/PatternList";
import { fetcher } from "@/lib/api";
import {
  isError,
  type ForecastBundle,
  type GarchForecast,
  type PatternForecast,
  type ProphetForecast,
} from "@/lib/forecast";

type TabId = "direction" | "volatility" | "patterns";

const TABS: Array<{ id: TabId; label: string; Icon: React.ComponentType<{ className?: string }> }> = [
  { id: "direction", label: "Direction (Prophet)", Icon: TrendingUp },
  { id: "volatility", label: "Volatility (GARCH)", Icon: Activity },
  { id: "patterns", label: "Patterns", Icon: Shapes },
];

// Trading-day approximations: ~21 td/month, ~252 td/year. Capped server-side
// at 1260 trading days (~5y).
const HORIZONS: Array<{ id: string; label: string; days: number }> = [
  { id: "1d", label: "1D", days: 1 },
  { id: "1w", label: "1W", days: 5 },
  { id: "1m", label: "1M", days: 21 },
  { id: "3m", label: "3M", days: 63 },
  { id: "6m", label: "6M", days: 126 },
  { id: "1y", label: "1Y", days: 252 },
  { id: "2y", label: "2Y", days: 504 },
  { id: "5y", label: "5Y", days: 1260 },
];

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="b-card p-4 text-[12px] t-neg">
      Forecast failed: <span className="mono">{message}</span>
    </div>
  );
}

function DirectionTab({ data }: { data: ProphetForecast }) {
  const dir = (data.direction || "flat").toLowerCase();
  const ret = data.expectedReturnPct ?? 0;
  const dirChip =
    dir === "up" ? "chip chip-pos" : dir === "down" ? "chip chip-neg" : "chip";
  const DirIcon = dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : Minus;

  return (
    <div className="flex flex-col gap-3">
      <div className="b-card p-3 flex items-center gap-3">
        <span className={dirChip}>
          <DirIcon className="w-3 h-3" /> {dir.toUpperCase()}
        </span>
        <span className="mono tabular-nums text-[12px] t-dim">
          horizon {data.horizonDays}d
        </span>
        <span className="ml-auto mono tabular-nums text-[14px]">
          expected{" "}
          <span className={clsx(ret > 0 ? "t-pos" : ret < 0 ? "t-neg" : "")}>
            {ret > 0 ? "+" : ""}
            {ret.toFixed(2)}%
          </span>
        </span>
        <span className="text-[11px] t-dim mono">
          as of {new Date(data.asOf).toLocaleString()}
        </span>
      </div>
      <ForecastChart history={data.history} forecast={data.forecast} />
    </div>
  );
}

function VolatilityTab({ data }: { data: GarchForecast }) {
  const layout = useMemo(() => {
    const hist = data.history || [];
    const fc = data.forecast || [];
    if (hist.length + fc.length < 2) return null;
    const width = 1000;
    const height = 260;
    const padL = 48;
    const padR = 12;
    const padT = 14;
    const padB = 26;
    const innerW = width - padL - padR;
    const innerH = height - padT - padB;
    const total = hist.length + fc.length;

    const vols = [...hist.map((h) => h.vol), ...fc.map((f) => f.vol)];
    let lo = Math.min(...vols);
    let hi = Math.max(...vols);
    if (lo === hi) {
      lo = Math.max(0, lo - 0.001);
      hi = hi + 0.001;
    }
    const range = hi - lo;
    const x = (i: number) => padL + (i / (total - 1)) * innerW;
    const y = (v: number) => padT + (1 - (v - lo) / range) * innerH;
    const histPath = hist
      .map(
        (h, i) =>
          `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(h.vol).toFixed(1)}`,
      )
      .join(" ");
    const lastHistIdx = hist.length - 1;
    const fcPath =
      fc.length > 0 && hist.length > 0
        ? `M${x(lastHistIdx).toFixed(1)},${y(hist[lastHistIdx]!.vol).toFixed(1)} ` +
          fc
            .map(
              (f, idx) =>
                `L${x(hist.length + idx).toFixed(1)},${y(f.vol).toFixed(1)}`,
            )
            .join(" ")
        : fc
            .map(
              (f, idx) =>
                `${idx === 0 ? "M" : "L"}${x(idx).toFixed(1)},${y(f.vol).toFixed(1)}`,
            )
            .join(" ");
    const ticks: { v: number; y: number }[] = [];
    for (let i = 0; i <= 4; i++) {
      const v = lo + (range * i) / 4;
      ticks.push({ v, y: y(v) });
    }
    return {
      width,
      height,
      padL,
      padR,
      padT,
      padB,
      innerW,
      innerH,
      histPath,
      fcPath,
      x,
      y,
      ticks,
      lastHistIdx,
      hist,
      fc,
    };
  }, [data]);

  const change = data.forecastVol - data.currentVol;
  const changePct = data.currentVol !== 0 ? (change / data.currentVol) * 100 : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="b-card p-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Current Vol" value={data.currentVol} unit="" digits={4} />
        <Stat label="Forecast Vol" value={data.forecastVol} unit="" digits={4} />
        <Stat
          label="Change"
          value={changePct}
          unit="%"
          digits={2}
          tone={changePct > 0 ? "neg" : "pos"}
        />
        <Stat
          label="Annualized (last)"
          value={data.forecast?.[data.forecast.length - 1]?.volAnnualized ?? null}
          unit=""
          digits={4}
        />
      </div>
      <div className="b-card p-3">
        <div className="text-[11px] uppercase tracking-[0.06em] text-fg-muted font-medium mb-1">
          Vol bands (history vs forecast)
        </div>
        {layout ? (
          <svg
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            className="w-full block"
            style={{ height: layout.height }}
            preserveAspectRatio="none"
          >
            {layout.ticks.map((t, i) => (
              <g key={i}>
                <line
                  x1={layout.padL}
                  x2={layout.width - layout.padR}
                  y1={t.y}
                  y2={t.y}
                  stroke="var(--border)"
                  strokeDasharray="2 3"
                  opacity={0.5}
                />
                <text
                  x={layout.padL - 6}
                  y={t.y + 3}
                  textAnchor="end"
                  fontSize={9}
                  fill="var(--text-dim)"
                  fontFamily="var(--font-mono)"
                >
                  {t.v.toFixed(4)}
                </text>
              </g>
            ))}
            {layout.fc.length > 0 && layout.hist.length > 0 && (
              <line
                x1={layout.x(layout.lastHistIdx)}
                x2={layout.x(layout.lastHistIdx)}
                y1={layout.padT}
                y2={layout.padT + layout.innerH}
                stroke="var(--text-dim)"
                strokeDasharray="3 3"
                opacity={0.5}
              />
            )}
            <path
              d={layout.histPath}
              fill="none"
              stroke="var(--text)"
              strokeWidth={1.4}
            />
            <path
              d={layout.fcPath}
              fill="none"
              stroke="var(--warning)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
          </svg>
        ) : (
          <div className="text-[11px] t-dim">Not enough data.</div>
        )}
        <div className="flex items-center gap-3 mt-2 text-[11px] mono">
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-px"
              style={{ background: "var(--text)" }}
            />
            <span className="t-dim">history</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-px"
              style={{ background: "var(--warning)" }}
            />
            <span className="t-dim">forecast</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  digits = 2,
  tone,
}: {
  label: string;
  value: number | null | undefined;
  unit?: string;
  digits?: number;
  tone?: "pos" | "neg" | "auto";
}) {
  const isNum = typeof value === "number" && Number.isFinite(value);
  const cls =
    tone === "pos"
      ? "t-pos"
      : tone === "neg"
        ? "t-neg"
        : tone === "auto" && isNum
          ? value! > 0
            ? "t-pos"
            : value! < 0
              ? "t-neg"
              : ""
          : "";
  return (
    <div className="flex flex-col">
      <div className="text-[10px] uppercase tracking-[0.06em] text-fg-muted">
        {label}
      </div>
      <div
        className={clsx("mono tabular-nums text-[14px] font-medium", cls)}
      >
        {isNum
          ? `${value! > 0 && tone === "auto" ? "+" : ""}${value!.toFixed(digits)}${unit ?? ""}`
          : "—"}
      </div>
    </div>
  );
}

function PatternsTab({ data }: { data: PatternForecast }) {
  return <PatternList detections={data.detections ?? []} />;
}

export default function ForecastSymbolPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = use(params);
  const sym = symbol.toUpperCase();
  const [tab, setTab] = useState<TabId>("direction");
  const [horizonId, setHorizonId] = useState<string>("1w");
  const horizon = HORIZONS.find((h) => h.id === horizonId) ?? HORIZONS[1];

  const { data, error, isLoading } = useSWR<ForecastBundle>(
    `/api/forecast/${encodeURIComponent(sym)}?days=${horizon.days}`,
    fetcher,
    { keepPreviousData: true },
  );

  return (
    <>
      <Topbar crumbs={["Markets", "Forecast", sym]} />
      <div className="page max-w-[1100px] flex flex-col gap-3">
        <div className="b-card p-3 flex items-center gap-2 flex-wrap">
          <span className="font-semibold mono tabular-nums text-[18px]">
            {sym}
          </span>
          <span className="text-[11px] t-dim">
            forecast bundle (Prophet · GARCH · patterns)
          </span>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] t-dim uppercase tracking-[0.06em]">Horizon</span>
            <div className="seg">
              {HORIZONS.map((h) => (
                <button
                  key={h.id}
                  className={clsx(horizonId === h.id && "active")}
                  onClick={() => setHorizonId(h.id)}
                  title={`${h.days} trading days`}
                >
                  {h.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="tabs">
          {TABS.map((t) => {
            const active = tab === t.id;
            const Icon = t.Icon;
            return (
              <button
                key={t.id}
                className={clsx("tab", active && "active")}
                onClick={() => setTab(t.id)}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {error && (
          <div className="b-card p-4 t-neg text-[12px]">
            Failed to load forecast: <span className="mono">{String(error)}</span>
          </div>
        )}

        {isLoading && !data && (
          <div className="b-card p-4">
            <div className="skel h-5 w-1/3 mb-2" />
            <div className="skel h-40 w-full" />
          </div>
        )}

        {data && tab === "direction" && (
          isError(data.prophet) ? (
            <ErrorPanel message={data.prophet.error} />
          ) : data.prophet ? (
            <DirectionTab data={data.prophet} />
          ) : null
        )}
        {data && tab === "volatility" && (
          isError(data.garch) ? (
            <ErrorPanel message={data.garch.error} />
          ) : data.garch ? (
            <VolatilityTab data={data.garch} />
          ) : null
        )}
        {data && tab === "patterns" && (
          isError(data.patterns) ? (
            <ErrorPanel message={data.patterns.error} />
          ) : data.patterns ? (
            <PatternsTab data={data.patterns} />
          ) : null
        )}
      </div>
    </>
  );
}
