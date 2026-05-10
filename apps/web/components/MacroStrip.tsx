interface MacroItem {
  label: string;
  value: string;
  changeStr?: string;
  positive?: boolean;
}

export interface MacroStripProps {
  regime?: "risk-on" | "neutral" | "risk-off";
  items: MacroItem[];
  asOfTime?: string;
}

const REGIME_LABEL: Record<NonNullable<MacroStripProps["regime"]>, string> = {
  "risk-on": "RISK-ON",
  neutral: "NEUTRAL",
  "risk-off": "RISK-OFF",
};

const REGIME_VAR: Record<NonNullable<MacroStripProps["regime"]>, string> = {
  "risk-on": "var(--regime-on)",
  neutral: "var(--regime-neutral)",
  "risk-off": "var(--regime-off)",
};

const REGIME_BG: Record<NonNullable<MacroStripProps["regime"]>, string> = {
  "risk-on": "color-mix(in oklab, var(--success) 10%, transparent)",
  neutral: "color-mix(in oklab, var(--warning) 8%, transparent)",
  "risk-off": "color-mix(in oklab, var(--danger) 10%, transparent)",
};

export function MacroStrip({ regime = "neutral", items, asOfTime }: MacroStripProps) {
  return (
    <div className="macro-strip">
      <div className="macro-item" style={{ background: REGIME_BG[regime] }}>
        <span className="dot" style={{ background: REGIME_VAR[regime] }} />
        <span style={{ fontWeight: 600 }}>{REGIME_LABEL[regime]}</span>
        <span className="t-muted text-[10px]">regime</span>
      </div>
      {items.map((it) => (
        <div key={it.label} className="macro-item">
          <span className="lbl">{it.label}</span>
          <span className="mono">{it.value}</span>
          {it.changeStr && (
            <span className={`mono ${it.positive ? "t-pos" : "t-neg"}`}>{it.changeStr}</span>
          )}
        </div>
      ))}
      {asOfTime && (
        <div className="ml-auto flex items-center gap-1.5 px-3.5 text-[11px] text-fg-muted">
          <span className="pulse-dot" /> Live · {asOfTime}
        </div>
      )}
    </div>
  );
}
