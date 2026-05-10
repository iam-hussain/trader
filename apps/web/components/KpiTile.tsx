import clsx from "clsx";

export interface KpiTileProps {
  label: string;
  value: number | string | null;
  unit?: string;
  delta?: number;
  hint?: string;
}

export function KpiTile({ label, value, unit, delta, hint }: KpiTileProps) {
  const isNumeric = typeof value === "number";
  const display =
    value === null || value === undefined
      ? "—"
      : isNumeric
        ? (value as number).toLocaleString(undefined, { maximumFractionDigits: 2 })
        : value;

  return (
    <div
      className="b-card p-3 flex flex-col gap-1"
      title={hint}
      aria-label={hint ? `${label}: ${hint}` : label}
    >
      <div className="text-[11px] uppercase tracking-[0.06em] text-fg-muted font-medium">
        {label}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={clsx("text-[16px] font-medium", isNumeric || value === null ? "mono" : "")}>
          {display}
        </span>
        {unit && value !== null && value !== undefined && (
          <span className="text-[11px] t-dim">{unit}</span>
        )}
      </div>
      {typeof delta === "number" && (
        <div className={clsx("text-[11px] mono", delta >= 0 ? "t-pos" : "t-neg")}>
          {delta >= 0 ? "+" : ""}
          {delta.toFixed(2)}
        </div>
      )}
    </div>
  );
}

export default KpiTile;
