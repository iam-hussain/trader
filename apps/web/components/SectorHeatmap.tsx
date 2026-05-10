export interface Sector {
  label: string;
  pct: number;
}

export function SectorHeatmap({ sectors }: { sectors: Sector[] }) {
  return (
    <div className="heatmap">
      {sectors.map((s) => {
        const intensity = Math.min(Math.abs(s.pct) / 1.5, 1);
        const base = s.pct >= 0 ? "var(--success)" : "var(--danger)";
        const bg = `color-mix(in oklab, ${base} ${15 + intensity * 50}%, var(--bg-elev-2))`;
        return (
          <div key={s.label} className="heatmap-cell" style={{ background: bg }}>
            <span>{s.label}</span>
            <span className="pct">
              {s.pct >= 0 ? "+" : ""}
              {s.pct.toFixed(2)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
