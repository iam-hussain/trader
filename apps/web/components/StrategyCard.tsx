"use client";
import { Play } from "lucide-react";
import type { ParamSchema } from "@/lib/backtest";

export interface StrategyCardProps {
  id: string;
  name: string;
  description: string;
  params: Record<string, ParamSchema>;
  onRun: (id: string) => void;
}

export function StrategyCard({
  id,
  name,
  description,
  params,
  onRun,
}: StrategyCardProps) {
  const paramKeys = Object.keys(params ?? {});
  return (
    <div className="b-card p-3 flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0">
          <div className="font-medium text-[13px] truncate">{name}</div>
          <div className="text-[11px] t-dim mono mt-0.5">{id}</div>
        </div>
        <button
          className="btn btn-primary btn-sm ml-auto"
          onClick={() => onRun(id)}
          title="Configure & run"
        >
          <Play className="w-3 h-3" />
          Run
        </button>
      </div>
      <p className="text-[11px] leading-[1.5] text-fg-muted">{description}</p>
      {paramKeys.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 mt-1">
          <span className="text-[10px] uppercase tracking-wide t-dim">params</span>
          {paramKeys.slice(0, 6).map((k) => (
            <span key={k} className="chip">
              {k}
            </span>
          ))}
          {paramKeys.length > 6 && (
            <span className="chip t-dim">+{paramKeys.length - 6}</span>
          )}
        </div>
      )}
    </div>
  );
}

export default StrategyCard;
