"use client";
import { AlertTriangle } from "lucide-react";

export interface LiveBannerProps {
  host: string;
  port: number;
  onSwitchToPaper: () => void;
}

export function LiveBanner({ host, port, onSwitchToPaper }: LiveBannerProps) {
  return (
    <div className="live-banner" role="alert">
      <AlertTriangle className="w-3.5 h-3.5" style={{ color: "var(--destructive)" }} />
      <span>
        <strong>LIVE ACCOUNT</strong> — orders fire immediately on confirm. Connected to{" "}
        <span className="mono tabular-nums">
          {host}:{port}
        </span>
        .
      </span>
      <button
        type="button"
        className="btn btn-sm ml-auto"
        onClick={onSwitchToPaper}
      >
        Switch to paper
      </button>
    </div>
  );
}
