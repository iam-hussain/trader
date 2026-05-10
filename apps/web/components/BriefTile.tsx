import { Check, Moon } from "lucide-react";

export type BriefStatus = "done" | "live" | "queued";

export interface BriefTileProps {
  status: BriefStatus;
  session: "PRE-MARKET" | "MID-DAY" | "POST-MARKET";
  scheduledAt: string;
  inLabel?: string; // e.g. "in 2h 19m"
  summary?: string;
  chips?: { label: string; tone?: "info" | "pos" | "neg" | "warn" | "default" }[];
  cta?: React.ReactNode;
}

const TONE_CLASS: Record<NonNullable<BriefTileProps["chips"]>[number]["tone"] & string, string> = {
  info: "chip chip-info",
  pos: "chip chip-pos",
  neg: "chip chip-neg",
  warn: "chip chip-warn",
  default: "chip",
};

export function BriefTile({
  status,
  session,
  scheduledAt,
  inLabel,
  summary,
  chips = [],
  cta,
}: BriefTileProps) {
  const tileClass =
    status === "done" ? "brief-tile done"
    : status === "live" ? "brief-tile live"
    : "brief-tile";
  const statusChip =
    status === "done" ? (
      <span className="chip chip-pos">
        <Check className="w-3 h-3" /> done
      </span>
    ) : status === "live" ? (
      <span className="chip chip-info">
        <span className="pulse-dot" style={{ background: "var(--primary)" }} />
        next
      </span>
    ) : (
      <span className="chip">
        <Moon className="w-3 h-3" /> queued
      </span>
    );

  return (
    <div className={tileClass}>
      <div className="flex items-center gap-1.5">
        {statusChip}
        <span className="text-[11px] text-fg-muted font-medium">{session}</span>
        <span className="ml-auto mono text-[11px] text-fg-dim">
          {scheduledAt}
          {inLabel ? ` · ${inLabel}` : ""}
        </span>
      </div>
      {summary && (
        <div className="text-[12px] leading-[1.5]" style={{ color: "var(--text)" }}>
          {summary}
        </div>
      )}
      <div className="mt-auto flex items-center gap-2">
        {chips.map((c, i) => (
          <span key={i} className={TONE_CLASS[c.tone ?? "default"]}>
            {c.label}
          </span>
        ))}
        {cta}
      </div>
    </div>
  );
}
