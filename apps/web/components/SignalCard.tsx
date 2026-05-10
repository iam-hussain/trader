"use client";
import { Check, X, Pencil } from "lucide-react";
import { ConfBar } from "./ConfBar";

export interface SignalCardProps {
  ticker: string;
  name?: string;
  direction: "long" | "short" | "hedge" | "wait";
  instrument: string;
  thesis: string;
  signals?: string[];
  catalysts?: string[];
  invalidation?: string;
  entry: number;
  target1: number;
  target2?: number;
  stop: number;
  qty: number;
  riskUsd?: number;
  riskPct?: number;
  riskReward: number;
  confidence: number;
  holdPeriod: "intraday" | "swing" | "position";
  llmProvider?: string;
  llmModel?: string;
  staged?: boolean;
  onStage?: () => void;
  onSkip?: () => void;
  onEdit?: () => void;
}

const DIR_CHIP: Record<SignalCardProps["direction"], string> = {
  long: "chip chip-pos",
  short: "chip chip-neg",
  hedge: "chip chip-info",
  wait: "chip chip-warn",
};

const DIR_LABEL: Record<SignalCardProps["direction"], string> = {
  long: "LONG",
  short: "SHORT",
  hedge: "HEDGE",
  wait: "WAIT",
};

const HOLD_LABEL: Record<SignalCardProps["holdPeriod"], string> = {
  intraday: "Intraday",
  swing: "Swing",
  position: "Position",
};

/**
 * Visualize entry/stop/target on a horizontal line.
 * Compute fractional position of each level between min and max.
 */
function levelPos(value: number, min: number, max: number) {
  if (max === min) return 50;
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

export function SignalCard({
  ticker,
  name,
  direction,
  instrument,
  thesis,
  signals = [],
  catalysts = [],
  invalidation,
  entry,
  target1,
  target2,
  stop,
  qty,
  riskUsd,
  riskPct,
  riskReward,
  confidence,
  holdPeriod,
  llmProvider,
  llmModel,
  staged,
  onStage,
  onSkip,
  onEdit,
}: SignalCardProps) {
  const allLevels = [entry, target1, stop, ...(target2 !== undefined ? [target2] : [])];
  const min = Math.min(...allLevels);
  const max = Math.max(...allLevels);
  const span = max - min || 1;
  const padded = { lo: min - span * 0.08, hi: max + span * 0.08 };

  return (
    <div className="b-card p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex flex-col">
          <div className="flex items-baseline gap-2">
            <span className="font-semibold text-[18px] mono tabular-nums">{ticker}</span>
            {name && <span className="text-[11px] text-fg-muted">{name}</span>}
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={DIR_CHIP[direction]}>{DIR_LABEL[direction]}</span>
            <span className="chip">{instrument}</span>
            <span className="chip">{HOLD_LABEL[holdPeriod]}</span>
          </div>
        </div>
        <div className="ml-auto flex flex-col items-end gap-1">
          <span className="mono tabular-nums text-[13px] font-semibold">
            R:R {riskReward.toFixed(2)}
          </span>
          <div className="flex items-center gap-1.5">
            <ConfBar value={confidence} width={80} />
            <span className="mono tabular-nums text-[10px] text-fg-muted">
              conf {confidence}
            </span>
          </div>
        </div>
      </div>

      {/* Thesis */}
      <p className="text-[12px] leading-[1.6] text-fg">{thesis}</p>

      {/* Signal & catalyst chips */}
      {(signals.length > 0 || catalysts.length > 0) && (
        <div className="flex flex-col gap-1.5">
          {signals.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] uppercase tracking-wide t-dim">signals</span>
              {signals.map((s) => (
                <span key={s} className="chip">
                  {s}
                </span>
              ))}
            </div>
          )}
          {catalysts.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] uppercase tracking-wide t-dim">catalysts</span>
              {catalysts.map((c) => (
                <span key={c} className="chip chip-info">
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Levels visualization */}
      <div className="flex flex-col gap-1.5">
        <div className="relative h-7 mt-2">
          <div
            className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px"
            style={{ background: "var(--border)" }}
          />
          {/* Stop marker */}
          <Marker
            color="var(--danger)"
            label="S"
            value={stop}
            position={levelPos(stop, padded.lo, padded.hi)}
          />
          {/* Entry marker */}
          <Marker
            color="var(--text)"
            label="E"
            value={entry}
            position={levelPos(entry, padded.lo, padded.hi)}
          />
          {/* Target1 marker */}
          <Marker
            color="var(--success)"
            label="T1"
            value={target1}
            position={levelPos(target1, padded.lo, padded.hi)}
          />
          {target2 !== undefined && (
            <Marker
              color="var(--success)"
              label="T2"
              value={target2}
              position={levelPos(target2, padded.lo, padded.hi)}
            />
          )}
        </div>
      </div>

      {/* Risk row */}
      <div className="flex items-center gap-3 mt-1 mono tabular-nums text-[11px] text-fg-muted">
        <span>
          qty <span className="text-fg">{qty}</span>
        </span>
        {riskUsd !== undefined && (
          <span>
            risk <span className="text-fg">${riskUsd.toFixed(0)}</span>
          </span>
        )}
        {riskPct !== undefined && (
          <span>
            <span className="text-fg">{riskPct.toFixed(2)}%</span> of acct
          </span>
        )}
        {invalidation && (
          <span className="t-dim ml-auto truncate">invalidation: {invalidation}</span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 mt-1">
        {(llmProvider || llmModel) && (
          <span className="chip">
            {llmProvider ?? "llm"}
            {llmModel ? ` · ${llmModel}` : ""}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {onEdit && (
            <button className="btn btn-ghost btn-sm" onClick={onEdit}>
              <Pencil className="w-3 h-3" /> Edit
            </button>
          )}
          {onSkip && (
            <button className="btn btn-ghost btn-sm" onClick={onSkip}>
              <X className="w-3 h-3" /> Skip
            </button>
          )}
          {staged ? (
            <button className="btn btn-sm" disabled>
              <Check className="w-3 h-3" /> Staged
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={onStage}>
              Stage
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Marker({
  color,
  label,
  value,
  position,
}: {
  color: string;
  label: string;
  value: number;
  position: number;
}) {
  return (
    <div
      className="absolute top-0 -translate-x-1/2 flex flex-col items-center"
      style={{ left: `${position}%` }}
    >
      <span
        className="mono tabular-nums text-[10px] leading-none"
        style={{ color }}
      >
        {value.toFixed(2)}
      </span>
      <span
        className="block w-0.5 h-3 mt-0.5"
        style={{ background: color }}
      />
      <span className="mono text-[9px] mt-0.5" style={{ color }}>
        {label}
      </span>
    </div>
  );
}
