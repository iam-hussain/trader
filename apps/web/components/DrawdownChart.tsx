"use client";
import { useMemo } from "react";

export interface DrawdownPoint {
  date: string;
  drawdown: number;
}

export interface DrawdownChartProps {
  data: DrawdownPoint[];
  height?: number;
}

/**
 * Inline SVG drawdown chart. Drawdowns are non-positive percentages.
 * Each bar extends downward from y=0.
 */
export function DrawdownChart({ data, height = 120 }: DrawdownChartProps) {
  const layout = useMemo(() => {
    if (!data || data.length < 2) return null;
    const width = 1000;
    const padL = 44;
    const padR = 12;
    const padT = 10;
    const padB = 22;
    const innerW = width - padL - padR;
    const innerH = height - padT - padB;

    const dds = data.map((d) => Math.min(0, d.drawdown));
    const minVal = Math.min(...dds, -0.0001);
    const x = (i: number) => padL + (i / (data.length - 1)) * innerW;
    const y = (v: number) => {
      const t = v / minVal; // v is <= 0, minVal <= 0
      return padT + Math.max(0, Math.min(1, t)) * innerH;
    };

    const barW = Math.max(1, innerW / data.length - 0.5);

    const ticks: { v: number; y: number }[] = [];
    for (let i = 0; i <= 3; i++) {
      const v = (minVal * i) / 3;
      ticks.push({ v, y: y(v) });
    }

    return { width, height, padL, padR, padT, padB, innerW, innerH, x, y, dds, minVal, barW, ticks };
  }, [data, height]);

  if (!layout) {
    return (
      <div
        className="b-card p-3 flex items-center justify-center text-[11px] t-dim"
        style={{ height }}
      >
        Not enough data
      </div>
    );
  }

  return (
    <div className="b-card p-3">
      <div className="text-[11px] uppercase tracking-[0.06em] text-fg-muted font-medium mb-1">
        Drawdown
      </div>
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
              {t.v.toFixed(1)}%
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const v = Math.min(0, d.drawdown);
          const yTop = layout.padT;
          const yEnd = layout.y(v);
          const h = Math.max(0, yEnd - yTop);
          return (
            <rect
              key={i}
              x={layout.x(i) - layout.barW / 2}
              y={yTop}
              width={layout.barW}
              height={h}
              fill="var(--danger)"
              opacity={0.55}
            />
          );
        })}

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
    </div>
  );
}

export default DrawdownChart;
