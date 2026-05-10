"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import clsx from "clsx";
import { Topbar } from "@/components/Topbar";
import { fetcher } from "@/lib/api";

type TabId = "by-tag" | "by-sector" | "by-hold-period" | "by-llm";

interface Bucket {
  tag?: string;
  sector?: string;
  holdPeriod?: string;
  llm?: string;
  count: number;
  totalPnl: number;
  avgPnl: number;
  winRate: number;
}

interface AttributionResponse {
  buckets: Bucket[];
}

const TABS: Array<{ id: TabId; label: string; key: keyof Bucket }> = [
  { id: "by-tag", label: "By tag", key: "tag" },
  { id: "by-sector", label: "By sector", key: "sector" },
  { id: "by-hold-period", label: "By hold period", key: "holdPeriod" },
  { id: "by-llm", label: "By LLM", key: "llm" },
];

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(Date.now() - 90 * 86400_000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function bucketLabel(b: Bucket, key: keyof Bucket): string {
  return String(b[key] ?? "—");
}

function BarRow({
  label,
  value,
  min,
  max,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
}) {
  const range = Math.max(Math.abs(min), Math.abs(max), 1);
  const pct = (Math.abs(value) / range) * 100;
  const pos = value >= 0;
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <div className="w-32 truncate">{label}</div>
      <div className="flex-1 relative h-3">
        <div
          className="absolute top-0 bottom-0"
          style={{ left: "50%", width: 1, background: "var(--border)" }}
        />
        <div
          className="absolute top-0 bottom-0 rounded-sm"
          style={{
            left: pos ? "50%" : `${50 - pct / 2}%`,
            width: `${pct / 2}%`,
            background: pos ? "var(--success)" : "var(--danger)",
            opacity: 0.8,
          }}
        />
      </div>
      <div
        className={clsx(
          "w-20 text-right mono tabular-nums",
          pos ? "t-pos" : "t-neg",
        )}
      >
        {value > 0 ? "+" : ""}
        {value.toFixed(2)}
      </div>
    </div>
  );
}

export default function AttributionPage() {
  const init = defaultRange();
  const [from, setFrom] = useState(init.from);
  const [to, setTo] = useState(init.to);
  const [tab, setTab] = useState<TabId>("by-tag");

  const tabKey = useMemo(
    () => TABS.find((t) => t.id === tab)?.key ?? "tag",
    [tab],
  );
  const url = `/api/attribution/${tab}?from=${from}&to=${to}`;
  const { data, error, isLoading } = useSWR<AttributionResponse>(
    url,
    fetcher,
    { keepPreviousData: true },
  );

  const buckets = data?.buckets ?? [];
  const sorted = useMemo(
    () => [...buckets].sort((a, b) => b.avgPnl - a.avgPnl),
    [buckets],
  );
  const min = sorted.length ? Math.min(...sorted.map((b) => b.avgPnl)) : 0;
  const max = sorted.length ? Math.max(...sorted.map((b) => b.avgPnl)) : 0;

  return (
    <>
      <Topbar crumbs={["Workspace", "Attribution"]} />
      <div className="page max-w-[1100px] flex flex-col gap-3">
        <div className="b-card p-3 flex items-center gap-3 flex-wrap">
          <div className="text-[13px] font-medium">P&amp;L attribution</div>
          <span className="text-[11px] t-dim">
            Slice realized P&amp;L by tag, sector, hold period, or LLM.
          </span>
          <label className="ml-auto flex flex-col gap-1 text-[11px]">
            <span className="t-dim">From</span>
            <input
              type="date"
              className="input mono h-[28px] text-[12px]"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px]">
            <span className="t-dim">To</span>
            <input
              type="date"
              className="input mono h-[28px] text-[12px]"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>

        <div className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={clsx("tab", tab === t.id && "active")}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="b-card p-3 t-neg text-[12px]">
            Failed to load attribution: <span className="mono">{String(error)}</span>
          </div>
        )}

        {isLoading && !data && (
          <div className="b-card p-3">
            <div className="skel h-4 w-1/3 mb-2" />
            <div className="skel h-3 w-full mb-1" />
            <div className="skel h-3 w-2/3" />
          </div>
        )}

        {data && sorted.length === 0 && (
          <div className="b-card p-3 text-[12px] t-dim">
            No data in this range.
          </div>
        )}

        {data && sorted.length > 0 && (
          <>
            <section className="b-card p-3 flex flex-col gap-2">
              <div className="text-[11px] uppercase tracking-[0.06em] text-fg-muted font-medium mb-1">
                Avg P&amp;L by bucket
              </div>
              <div className="flex flex-col gap-1.5">
                {sorted.map((b, i) => (
                  <BarRow
                    key={`${bucketLabel(b, tabKey)}-${i}`}
                    label={bucketLabel(b, tabKey)}
                    value={b.avgPnl}
                    min={min}
                    max={max}
                  />
                ))}
              </div>
            </section>

            <section className="b-card p-0 overflow-hidden">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.06em] text-fg-muted">
                    <th className="text-left p-2 font-medium">
                      {tabKey === "tag"
                        ? "Tag"
                        : tabKey === "sector"
                          ? "Sector"
                          : tabKey === "holdPeriod"
                            ? "Hold period"
                            : "LLM"}
                    </th>
                    <th className="text-right p-2 font-medium">Count</th>
                    <th className="text-right p-2 font-medium">Total P&amp;L</th>
                    <th className="text-right p-2 font-medium">Avg P&amp;L</th>
                    <th className="text-right p-2 font-medium">Win Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((b, i) => (
                    <tr
                      key={`${bucketLabel(b, tabKey)}-${i}`}
                      style={{ borderTop: "1px solid var(--border)" }}
                    >
                      <td className="p-2">{bucketLabel(b, tabKey)}</td>
                      <td className="p-2 text-right mono tabular-nums">
                        {b.count}
                      </td>
                      <td
                        className={clsx(
                          "p-2 text-right mono tabular-nums",
                          b.totalPnl > 0
                            ? "t-pos"
                            : b.totalPnl < 0
                              ? "t-neg"
                              : "",
                        )}
                      >
                        {b.totalPnl > 0 ? "+" : ""}
                        {b.totalPnl.toFixed(2)}
                      </td>
                      <td
                        className={clsx(
                          "p-2 text-right mono tabular-nums",
                          b.avgPnl > 0
                            ? "t-pos"
                            : b.avgPnl < 0
                              ? "t-neg"
                              : "",
                        )}
                      >
                        {b.avgPnl > 0 ? "+" : ""}
                        {b.avgPnl.toFixed(2)}
                      </td>
                      <td className="p-2 text-right mono tabular-nums">
                        {(b.winRate * 100).toFixed(0)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}
      </div>
    </>
  );
}
