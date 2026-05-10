"use client";
import { useMemo, useState } from "react";

export interface HistoryPoint {
  date: string;
  close: number;
}

export interface ForecastBandPoint {
  date: string;
  yhat: number;
  yhatLower: number;
  yhatUpper: number;
}

export interface ForecastChartProps {
  history: HistoryPoint[];
  forecast: ForecastBandPoint[];
  height?: number;
}

/**
 * Inline SVG chart: history line connected to a forecast line, with a
 * shaded confidence band over the forecast horizon.
 *
 * Date axis is treated as ordered indices (so weekends/gaps are not over-
 * weighted), with the boundary index = history.length - 1.
 */
export function ForecastChart({
  history,
  forecast,
  height = 260,
}: ForecastChartProps) {
  const [hover, setHover] = useState<number | null>(null);

  const layout = useMemo(() => {
    if (!history || history.length < 2) return null;
    const width = 1000;
    const padL = 48;
    const padR = 12;
    const padT = 14;
    const padB = 26;
    const innerW = width - padL - padR;
    const innerH = height - padT - padB;

    type Pt = { i: number; date: string; v: number; segment: "history" | "forecast" };
    const pts: Pt[] = [];
    history.forEach((h, i) =>
      pts.push({ i, date: h.date, v: h.close, segment: "history" }),
    );
    // Forecast continues after history. We anchor by appending the forecast
    // points after the last history index.
    forecast.forEach((f, idx) =>
      pts.push({
        i: history.length + idx,
        date: f.date,
        v: f.yhat,
        segment: "forecast",
      }),
    );

    const total = pts.length;
    if (total < 2) return null;

    const allValues: number[] = [
      ...history.map((h) => h.close),
      ...forecast.flatMap((f) => [f.yhat, f.yhatLower, f.yhatUpper]),
    ];
    let lo = Math.min(...allValues);
    let hi = Math.max(...allValues);
    if (lo === hi) {
      lo -= 1;
      hi += 1;
    }
    const range = hi - lo;

    const x = (i: number) =>
      padL + (i / (total - 1)) * innerW;
    const y = (v: number) =>
      padT + (1 - (v - lo) / range) * innerH;

    const histPath = history
      .map(
        (h, i) =>
          `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(h.close).toFixed(1)}`,
      )
      .join(" ");

    const lastHistIdx = history.length - 1;
    const lastHist = history[lastHistIdx]!;

    // Forecast line connects from the last history point.
    const fcPath =
      forecast.length > 0
        ? `M${x(lastHistIdx).toFixed(1)},${y(lastHist.close).toFixed(1)} ` +
          forecast
            .map(
              (f, idx) =>
                `L${x(history.length + idx).toFixed(1)},${y(f.yhat).toFixed(1)}`,
            )
            .join(" ")
        : "";

    // Confidence band polygon
    let bandPath = "";
    if (forecast.length > 0) {
      const upper = forecast
        .map(
          (f, idx) =>
            `${idx === 0 ? "M" : "L"}${x(history.length + idx).toFixed(1)},${y(f.yhatUpper).toFixed(1)}`,
        )
        .join(" ");
      const lowerRev = forecast
        .map(
          (f, idx) =>
            `L${x(history.length + idx).toFixed(1)},${y(f.yhatLower).toFixed(1)}`,
        )
        .reverse()
        .join(" ");
      // Anchor the band so it starts at the last history point (visually continuous)
      const anchorTop = `M${x(lastHistIdx).toFixed(1)},${y(lastHist.close).toFixed(1)} `;
      bandPath = `${anchorTop}${upper.slice(1)} ${lowerRev} L${x(lastHistIdx).toFixed(1)},${y(lastHist.close).toFixed(1)} Z`;
    }

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
      pts,
      x,
      y,
      lastHistIdx,
      histPath,
      fcPath,
      bandPath,
      ticks,
      lo,
      hi,
    };
  }, [history, forecast, height]);

  if (!layout) {
    return (
      <div
        className="b-card p-3 flex items-center justify-center text-[11px] t-dim"
        style={{ height }}
      >
        Not enough data to render forecast
      </div>
    );
  }

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const xPx = ((e.clientX - rect.left) / rect.width) * layout.width;
    let bestI = 0;
    let bestD = Infinity;
    for (let i = 0; i < layout.pts.length; i++) {
      const px = layout.x(layout.pts[i]!.i);
      const d = Math.abs(px - xPx);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    setHover(bestI);
  };

  const hovered = hover !== null ? layout.pts[hover] : null;
  const hoveredFc =
    hovered && hovered.segment === "forecast"
      ? forecast[hovered.i - history.length]
      : null;

  return (
    <div className="b-card p-3">
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="w-full block"
        style={{ height: layout.height }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
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
              {t.v.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </text>
          </g>
        ))}

        {/* Forecast region indicator */}
        {forecast.length > 0 && (
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

        {/* Confidence band */}
        {layout.bandPath && (
          <path d={layout.bandPath} fill="var(--primary)" opacity={0.18} />
        )}

        {/* History line */}
        <path
          d={layout.histPath}
          fill="none"
          stroke="var(--text)"
          strokeWidth={1.4}
          strokeLinejoin="round"
        />

        {/* Forecast line */}
        {layout.fcPath && (
          <path
            d={layout.fcPath}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            strokeLinejoin="round"
          />
        )}

        {/* Hover */}
        {hovered && (
          <g>
            <line
              x1={layout.x(hovered.i)}
              x2={layout.x(hovered.i)}
              y1={layout.padT}
              y2={layout.padT + layout.innerH}
              stroke="var(--text-muted)"
              strokeDasharray="2 3"
              opacity={0.6}
            />
            <circle
              cx={layout.x(hovered.i)}
              cy={layout.y(hovered.v)}
              r={3}
              fill="var(--bg-base)"
              stroke={
                hovered.segment === "forecast"
                  ? "var(--primary)"
                  : "var(--text)"
              }
              strokeWidth={1.5}
            />
          </g>
        )}

        {/* X-axis labels */}
        <text
          x={layout.padL}
          y={layout.height - layout.padB + 14}
          fontSize={9}
          fill="var(--text-dim)"
          fontFamily="var(--font-mono)"
        >
          {history[0]!.date}
        </text>
        {forecast.length > 0 && (
          <text
            x={layout.x(layout.lastHistIdx)}
            y={layout.height - layout.padB + 14}
            textAnchor="middle"
            fontSize={9}
            fill="var(--text-dim)"
            fontFamily="var(--font-mono)"
          >
            now
          </text>
        )}
        <text
          x={layout.width - layout.padR}
          y={layout.height - layout.padB + 14}
          textAnchor="end"
          fontSize={9}
          fill="var(--text-dim)"
          fontFamily="var(--font-mono)"
        >
          {forecast.length > 0
            ? forecast[forecast.length - 1]!.date
            : history[history.length - 1]!.date}
        </text>
      </svg>

      <div className="flex items-center gap-3 mt-2 text-[11px] mono tabular-nums">
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
            style={{
              background: "var(--primary)",
              borderTop: "1px dashed var(--primary)",
            }}
          />
          <span className="t-dim">forecast</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-2"
            style={{ background: "var(--primary)", opacity: 0.18 }}
          />
          <span className="t-dim">conf band</span>
        </span>
        {hovered && (
          <span className="ml-auto t-dim">
            {hovered.date}{" "}
            <span className="text-fg">{hovered.v.toFixed(2)}</span>
            {hoveredFc && (
              <span className="t-dim ml-2">
                [{hoveredFc.yhatLower.toFixed(2)} —{" "}
                {hoveredFc.yhatUpper.toFixed(2)}]
              </span>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

export default ForecastChart;
