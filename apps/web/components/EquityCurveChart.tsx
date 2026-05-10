"use client";
import { useMemo, useState } from "react";

export interface EquityPoint {
  date: string;
  equity: number;
  drawdown?: number;
}

export interface EquityCurveChartProps {
  data: EquityPoint[];
  height?: number;
  showDrawdown?: boolean;
}

/**
 * Inline SVG equity curve. Splits the line into "above start" (success)
 * and "below start" (danger) segments. Optional drawdown shading is drawn
 * along the bottom of the chart.
 */
export function EquityCurveChart({
  data,
  height = 240,
  showDrawdown = false,
}: EquityCurveChartProps) {
  const [hover, setHover] = useState<number | null>(null);

  const layout = useMemo(() => {
    if (!data || data.length < 2) return null;
    const width = 1000; // viewBox width (responsive via SVG)
    const padL = 44;
    const padR = 12;
    const padT = 12;
    const ddH = showDrawdown ? Math.min(60, Math.round(height * 0.28)) : 0;
    const padB = 22 + ddH;

    const innerW = width - padL - padR;
    const innerH = height - padT - padB;

    const equities = data.map((d) => d.equity);
    const start = equities[0]!;
    let lo = Math.min(...equities);
    let hi = Math.max(...equities);
    if (lo === hi) {
      lo = lo - 1;
      hi = hi + 1;
    }
    const range = hi - lo;

    const x = (i: number) => padL + (i / (data.length - 1)) * innerW;
    const y = (v: number) => padT + (1 - (v - lo) / range) * innerH;

    const startY = y(start);

    // Build segments split at every crossing of the start line.
    type Pt = { x: number; y: number; pos: boolean };
    const pts: Pt[] = data.map((d, i) => ({
      x: x(i),
      y: y(d.equity),
      pos: d.equity >= start,
    }));

    const segs: Pt[][] = [];
    let cur: Pt[] = [pts[0]!];
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1]!;
      const next = pts[i]!;
      if (prev.pos !== next.pos) {
        // Linear-interpolate to start line
        const t =
          (start - data[i - 1]!.equity) /
          (data[i]!.equity - data[i - 1]!.equity || 1);
        const cx = prev.x + (next.x - prev.x) * t;
        const cy = startY;
        cur.push({ x: cx, y: cy, pos: prev.pos });
        segs.push(cur);
        cur = [{ x: cx, y: cy, pos: next.pos }, next];
      } else {
        cur.push(next);
      }
    }
    segs.push(cur);

    // Drawdown shading polygon (within ddBand)
    let ddPath = "";
    if (showDrawdown && ddH > 0) {
      const dds = data.map((d) => d.drawdown ?? 0);
      const ddMin = Math.min(0, ...dds); // most negative
      const ddRange = ddMin === 0 ? -1 : ddMin; // negative
      const ddTop = padT + innerH + 8;
      const ddBot = ddTop + ddH;
      const ddY = (v: number) => {
        // v is <= 0 typically. Map ddMin -> ddBot, 0 -> ddTop
        const t = ddRange === 0 ? 0 : v / ddRange;
        return ddTop + Math.max(0, Math.min(1, t)) * ddH;
      };
      const top = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${ddTop.toFixed(1)}`).join(" ");
      const bot = data
        .map((d, i) => `L${x(i).toFixed(1)},${ddY(d.drawdown ?? 0).toFixed(1)}`)
        .reverse()
        .join(" ");
      ddPath = `${top} ${bot} Z`;
    }

    // Y-axis ticks (5)
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
      x,
      y,
      lo,
      hi,
      start,
      startY,
      segs,
      ddPath,
      ddH,
      ticks,
      pts,
    };
  }, [data, height, showDrawdown]);

  if (!layout) {
    return (
      <div
        className="b-card p-3 flex items-center justify-center text-[11px] t-dim"
        style={{ height }}
      >
        Not enough data to render chart
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
      const d = Math.abs(layout.pts[i]!.x - xPx);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    setHover(bestI);
  };

  const hovered = hover !== null ? data[hover] : null;
  const hoveredPt = hover !== null ? layout.pts[hover] : null;

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
        {/* Grid + y ticks */}
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
              {t.v.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </text>
          </g>
        ))}

        {/* Start baseline */}
        <line
          x1={layout.padL}
          x2={layout.width - layout.padR}
          y1={layout.startY}
          y2={layout.startY}
          stroke="var(--text-dim)"
          strokeDasharray="3 3"
          opacity={0.6}
        />

        {/* Drawdown shading */}
        {showDrawdown && layout.ddPath && (
          <path d={layout.ddPath} fill="var(--danger)" opacity={0.18} />
        )}

        {/* Equity segments (split by sign) */}
        {layout.segs.map((seg, i) => {
          if (seg.length < 2) return null;
          const d = seg
            .map((p, j) => `${j === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
            .join(" ");
          const color = seg[0]!.pos ? "var(--success)" : "var(--danger)";
          return (
            <path
              key={i}
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={1.6}
              strokeLinejoin="round"
            />
          );
        })}

        {/* Hover crosshair */}
        {hoveredPt && (
          <g>
            <line
              x1={hoveredPt.x}
              x2={hoveredPt.x}
              y1={layout.padT}
              y2={layout.padT + layout.innerH}
              stroke="var(--text-muted)"
              strokeDasharray="2 3"
              opacity={0.6}
            />
            <circle
              cx={hoveredPt.x}
              cy={hoveredPt.y}
              r={3}
              fill="var(--bg-base)"
              stroke={hoveredPt.pos ? "var(--success)" : "var(--danger)"}
              strokeWidth={1.5}
            />
          </g>
        )}

        {/* X-axis: first / last labels */}
        <text
          x={layout.padL}
          y={layout.height - layout.padB + 14}
          fontSize={9}
          fill="var(--text-dim)"
          fontFamily="var(--font-mono)"
        >
          {data[0]!.date}
        </text>
        <text
          x={layout.width - layout.padR}
          y={layout.height - layout.padB + 14}
          textAnchor="end"
          fontSize={9}
          fill="var(--text-dim)"
          fontFamily="var(--font-mono)"
        >
          {data[data.length - 1]!.date}
        </text>
      </svg>

      <div className="flex items-center justify-between mt-2 text-[11px] mono tabular-nums">
        <span className="t-dim">
          start{" "}
          <span className="text-fg">
            {data[0]!.equity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
        </span>
        {hovered ? (
          <span className="t-dim">
            {hovered.date}{" "}
            <span className="text-fg">
              {hovered.equity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
            {typeof hovered.drawdown === "number" && (
              <span className="t-neg ml-2">
                dd {hovered.drawdown.toFixed(2)}%
              </span>
            )}
          </span>
        ) : (
          <span className="t-dim">
            end{" "}
            <span className="text-fg">
              {data[data.length - 1]!.equity.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

export default EquityCurveChart;
