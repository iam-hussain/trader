"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/api";
import { useUserEvents } from "@/lib/sse";

export interface Position {
  symbol: string;
  qty: number;
  avgCost: number;
  marketPrice?: number;
  unrealizedPnl?: number;
  realizedPnl?: number;
}

interface PositionsResponse {
  positions: Position[];
  asOf: string;
  source: string;
}

interface PnlResponse {
  realizedPnl: number;
  unrealizedPnl: number;
  pnl: number;
  asOf: string;
  source: string;
}

export interface PositionsPanelProps {
  height?: number;
  accountSizeUsd?: number;
}

function fmtNum(v: number, digits = 2) {
  return v.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtUsd(v?: number) {
  if (v === undefined || v === null || Number.isNaN(v)) return "—";
  const sign = v < 0 ? "-" : v > 0 ? "+" : "";
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}

function pnlClass(v?: number) {
  if (v === undefined || v === null || v === 0) return "";
  return v > 0 ? "t-pos" : "t-neg";
}

export function PositionsPanel({ height, accountSizeUsd }: PositionsPanelProps) {
  const { data, mutate } = useSWR<PositionsResponse>("/api/positions", fetcher, {
    keepPreviousData: true,
    refreshInterval: 15_000,
  });
  const { data: pnl } = useSWR<PnlResponse>("/api/positions/pnl", fetcher, {
    keepPreviousData: true,
    refreshInterval: 15_000,
  });

  const [livePositions, setLivePositions] = useState<Position[] | null>(null);

  useUserEvents((e) => {
    if (e.type === "positions.update" && Array.isArray(e.data)) {
      setLivePositions(e.data as Position[]);
    } else if (
      e.type === "order.fill" ||
      e.type === "order.cancel" ||
      e.type === "order.update"
    ) {
      void mutate();
    }
  });

  // Reset overlay when SWR data refetches
  useEffect(() => {
    if (data?.positions) setLivePositions(null);
  }, [data?.positions]);

  const positions = livePositions ?? data?.positions ?? [];

  const totalUnreal = positions.reduce((s, p) => s + (p.unrealizedPnl ?? 0), 0);
  const totalReal = pnl?.realizedPnl ?? 0;
  const exposure = positions.reduce(
    (s, p) => s + Math.abs((p.marketPrice ?? p.avgCost) * p.qty),
    0,
  );
  const exposurePct =
    accountSizeUsd && accountSizeUsd > 0 ? (exposure / accountSizeUsd) * 100 : null;

  return (
    <div
      className="b-card overflow-hidden"
      style={height ? { maxHeight: height, display: "flex", flexDirection: "column" } : undefined}
    >
      <div className="flex items-center px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
        <span className="text-[12px] font-medium">Live positions</span>
        <span className="chip ml-2">{positions.length}</span>
        <span className="ml-auto t-dim text-[10px] mono">
          {data?.source ?? "—"} · {data?.asOf ? new Date(data.asOf).toLocaleTimeString() : "—"}
        </span>
      </div>

      <div style={{ overflow: "auto", flex: 1 }}>
        <table className="t">
          <thead>
            <tr>
              <th>Symbol</th>
              <th className="r">Qty</th>
              <th className="r">Avg cost</th>
              <th className="r">Last</th>
              <th className="r">Unrealized $</th>
              <th className="r">Unrealized %</th>
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center t-muted py-6">
                  No open positions.
                </td>
              </tr>
            )}
            {positions.map((p) => {
              const last = p.marketPrice ?? p.avgCost;
              const pct =
                p.avgCost > 0 ? ((last - p.avgCost) / p.avgCost) * 100 * (p.qty >= 0 ? 1 : -1) : 0;
              return (
                <tr key={p.symbol}>
                  <td className="mono tabular-nums">{p.symbol}</td>
                  <td className="r mono tabular-nums">{fmtNum(p.qty, 0)}</td>
                  <td className="r mono tabular-nums">{fmtNum(p.avgCost)}</td>
                  <td className="r mono tabular-nums">{fmtNum(last)}</td>
                  <td className={`r mono tabular-nums ${pnlClass(p.unrealizedPnl)}`}>
                    {fmtUsd(p.unrealizedPnl)}
                  </td>
                  <td className={`r mono tabular-nums ${pnlClass(pct)}`}>
                    {pct >= 0 ? "+" : ""}
                    {pct.toFixed(2)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        className="flex items-center px-3 py-2 border-t text-[11px] mono tabular-nums"
        style={{ borderColor: "var(--border)", background: "var(--bg-elev-1)" }}
      >
        <span className="t-muted">Unrealized</span>
        <span className={`ml-1 ${pnlClass(totalUnreal)}`}>{fmtUsd(totalUnreal)}</span>
        <span className="t-dim mx-2">·</span>
        <span className="t-muted">Realized today</span>
        <span className={`ml-1 ${pnlClass(totalReal)}`}>{fmtUsd(totalReal)}</span>
        {exposurePct !== null && (
          <>
            <span className="t-dim mx-2">·</span>
            <span className="t-muted">Exposure</span>
            <span className="ml-1">{exposurePct.toFixed(1)}%</span>
          </>
        )}
      </div>
    </div>
  );
}
