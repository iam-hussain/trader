"use client";
import { useMemo } from "react";

export interface HeatmapDay {
  date: string; // YYYY-MM-DD
  pnl: number;
  tradeCount: number;
}

export interface CalendarHeatmapProps {
  data: HeatmapDay[];
  days?: number;
}

/**
 * Render a GitHub-style commit calendar — 7 rows × N columns going back from today.
 * Color intensity scales with the absolute P/L magnitude relative to the largest |pnl|.
 * Mon = row 0, Sun = row 6 (Mon-first weeks).
 */
export function CalendarHeatmap({ data, days = 90 }: CalendarHeatmapProps) {
  const byDate = useMemo(() => {
    const m = new Map<string, HeatmapDay>();
    for (const d of data) m.set(d.date, d);
    return m;
  }, [data]);

  const maxAbs = useMemo(() => {
    let m = 0;
    for (const d of data) m = Math.max(m, Math.abs(d.pnl));
    return m || 1;
  }, [data]);

  const cells = useMemo(() => {
    const out: { date: string; day: HeatmapDay | null; col: number; row: number }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Walk back `days` days inclusive. We render columns left→right oldest→newest.
    const start = new Date(today);
    start.setDate(start.getDate() - (days - 1));
    // Align to Monday at start (so weeks line up)
    const startDow = (start.getDay() + 6) % 7; // Mon=0
    // First column may have leading empty cells for the start week alignment
    const firstColDate = new Date(start);
    firstColDate.setDate(firstColDate.getDate() - startDow);

    let col = 0;
    let row = 0;
    const cur = new Date(firstColDate);
    while (cur <= today) {
      if (cur >= start && cur <= today) {
        const iso = cur.toISOString().slice(0, 10);
        out.push({
          date: iso,
          day: byDate.get(iso) ?? null,
          col,
          row,
        });
      }
      row++;
      if (row > 6) {
        row = 0;
        col++;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }, [days, byDate]);

  const totalCols = useMemo(
    () => (cells.length === 0 ? 0 : Math.max(...cells.map((c) => c.col)) + 1),
    [cells],
  );

  const colorFor = (day: HeatmapDay | null): string => {
    if (!day || day.tradeCount === 0) return "var(--bg-elev-2)";
    const intensity = Math.min(1, Math.abs(day.pnl) / maxAbs);
    const alpha = 0.15 + intensity * 0.75;
    const base = day.pnl >= 0 ? "var(--success)" : "var(--danger)";
    return `color-mix(in oklch, ${base} ${(alpha * 100).toFixed(0)}%, var(--bg-elev-2))`;
  };

  return (
    <div className="b-card p-3">
      <div
        className="grid gap-[2px]"
        style={{
          gridTemplateColumns: `repeat(${totalCols}, 11px)`,
          gridTemplateRows: "repeat(7, 11px)",
          gridAutoFlow: "column",
        }}
      >
        {cells.map((c) => (
          <div
            key={c.date}
            className="rounded-[2px] tip"
            style={{
              gridColumn: c.col + 1,
              gridRow: c.row + 1,
              background: colorFor(c.day),
              width: 11,
              height: 11,
            }}
            data-tip={
              c.day
                ? `${c.date} · $${c.day.pnl.toFixed(0)} · ${c.day.tradeCount} trade${c.day.tradeCount === 1 ? "" : "s"}`
                : `${c.date} · no trades`
            }
            title={
              c.day
                ? `${c.date} · ${c.day.pnl >= 0 ? "+" : ""}$${c.day.pnl.toFixed(2)} · ${c.day.tradeCount} trade${c.day.tradeCount === 1 ? "" : "s"}`
                : `${c.date} · no trades`
            }
          />
        ))}
      </div>
      <div className="flex items-center gap-2 mt-2 text-[10px] text-fg-muted">
        <span>less</span>
        <span
          className="inline-block rounded-[2px]"
          style={{ width: 11, height: 11, background: "var(--bg-elev-2)" }}
        />
        <span
          className="inline-block rounded-[2px]"
          style={{
            width: 11,
            height: 11,
            background: "color-mix(in oklch, var(--success) 30%, var(--bg-elev-2))",
          }}
        />
        <span
          className="inline-block rounded-[2px]"
          style={{
            width: 11,
            height: 11,
            background: "color-mix(in oklch, var(--success) 70%, var(--bg-elev-2))",
          }}
        />
        <span>more</span>
        <span className="ml-auto">last {days} days</span>
      </div>
    </div>
  );
}
