import { ConfBar } from "./ConfBar";

export interface SignalRowProps {
  ticker: string;
  name?: string;
  direction: "long" | "short" | "hedge" | "wait";
  instrument: string; // "EQUITY", "CALL DEBIT", "PUT 525/520", etc
  thesis: string;
  entry: number;
  target: number;
  stop: number;
  riskReward: number;
  confidence: number; // 0..100
  staged?: boolean;
  shortcut?: string;
  onStage?: () => void;
}

const DIR_CHIP: Record<SignalRowProps["direction"], string> = {
  long: "chip chip-pos",
  short: "chip chip-neg",
  hedge: "chip chip-info",
  wait: "chip chip-warn",
};

const DIR_LABEL: Record<SignalRowProps["direction"], string> = {
  long: "LONG",
  short: "SHORT",
  hedge: "HEDGE",
  wait: "WAIT",
};

export function SignalRow({
  ticker,
  name,
  direction,
  instrument,
  thesis,
  entry,
  target,
  stop,
  riskReward,
  confidence,
  staged,
  shortcut = "S",
  onStage,
}: SignalRowProps) {
  return (
    <div
      className="signal-mini grid items-center gap-2.5"
      style={{ gridTemplateColumns: "60px 90px 1fr 100px 80px 90px" }}
    >
      <div className="flex flex-col gap-0.5">
        <span className="font-semibold text-[13px]">{ticker}</span>
        {name && <span className="text-[9px] text-fg-muted">{name}</span>}
      </div>
      <div className="flex flex-col gap-0.5 items-start">
        <span className={DIR_CHIP[direction]}>{DIR_LABEL[direction]}</span>
        <span className="chip">{instrument}</span>
      </div>
      <div className="text-[11px] leading-[1.5] text-fg-muted">{thesis}</div>
      <div
        className="grid gap-1 mono text-[10px] text-fg-muted text-right"
        style={{ gridTemplateColumns: "1fr 1fr" }}
      >
        <span>E</span>
        <span>{entry.toFixed(2)}</span>
        <span>T</span>
        <span className="t-pos">{target.toFixed(2)}</span>
        <span>S</span>
        <span className="t-neg">{stop.toFixed(2)}</span>
      </div>
      <div className="flex flex-col gap-1 items-end">
        <span className="mono text-[11px] font-semibold">R:R {riskReward.toFixed(1)}</span>
        <ConfBar value={confidence} />
        <span className="mono text-[9px] text-fg-muted">conf {confidence}</span>
      </div>
      {staged ? (
        <button className="btn btn-sm">Staged ✓</button>
      ) : (
        <button className="btn btn-primary btn-sm" onClick={onStage}>
          Stage{" "}
          <span
            className="kbd"
            style={{ background: "rgba(255,255,255,0.2)", color: "white", borderColor: "transparent" }}
          >
            {shortcut}
          </span>
        </button>
      )}
    </div>
  );
}
