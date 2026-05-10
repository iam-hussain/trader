import clsx from "clsx";

export interface PutCallGaugeProps {
  ratio: number;
  sources?: { source: string; ratio: number }[];
}

function classify(ratio: number) {
  if (ratio < 0.7) return { label: "bullish", tone: "text-pos", bar: "bg-pos" };
  if (ratio <= 1.0)
    return { label: "neutral", tone: "text-fg-muted", bar: "bg-fg-muted" };
  if (ratio <= 1.5)
    return { label: "bearish", tone: "text-neg", bar: "bg-neg/70" };
  return { label: "strongly bearish", tone: "text-neg", bar: "bg-neg" };
}

export function PutCallGauge({ ratio, sources }: PutCallGaugeProps) {
  const safe = Number.isFinite(ratio) ? ratio : 0;
  const clamped = Math.min(Math.max(safe, 0), 2);
  const pct = (clamped / 2) * 100;
  const cls = classify(safe);

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-fg-muted">
            Put / Call ratio
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono tabular-nums text-2xl">
              {safe.toFixed(2)}
            </span>
            <span className={clsx("text-xs uppercase tracking-wide", cls.tone)}>
              {cls.label}
            </span>
          </div>
        </div>
      </div>

      <div className="relative h-2 rounded-full bg-bg-elevated overflow-hidden">
        <div className="absolute inset-y-0 left-0 w-full flex">
          <div className="h-full bg-pos/20" style={{ width: "35%" }} />
          <div className="h-full bg-fg-muted/15" style={{ width: "15%" }} />
          <div className="h-full bg-neg/15" style={{ width: "25%" }} />
          <div className="h-full bg-neg/30" style={{ width: "25%" }} />
        </div>
        <div
          className={clsx(
            "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1 h-4 rounded-sm",
            cls.bar,
          )}
          style={{ left: `${pct}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="flex justify-between text-[10px] font-mono tabular-nums text-fg-subtle">
        <span>0.0</span>
        <span>0.7</span>
        <span>1.0</span>
        <span>1.5</span>
        <span>2.0+</span>
      </div>

      {sources && sources.length > 0 && (
        <div className="text-xs text-fg-muted flex flex-wrap gap-x-2 gap-y-1">
          {sources.map((s, i) => (
            <span key={s.source} className="inline-flex items-center gap-1">
              <span>{s.source}:</span>
              <span className="font-mono tabular-nums text-fg">
                {s.ratio.toFixed(2)}
              </span>
              {i < sources.length - 1 && (
                <span className="text-fg-subtle ml-1">·</span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default PutCallGauge;
