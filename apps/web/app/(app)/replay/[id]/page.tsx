"use client";
import { use } from "react";
import useSWR from "swr";
import clsx from "clsx";
import { Topbar } from "@/components/Topbar";
import { fetcher } from "@/lib/api";

interface ReplaySignal {
  ticker: string;
  direction?: string;
  instrument?: string;
  thesis?: string;
  entry?: number;
  stop?: number;
  target1?: number;
  confidence?: number;
}

interface DiffEntry {
  ticker: string;
  status: "match" | "extra" | "missing";
  generated?: ReplaySignal;
  actual?: ReplaySignal;
  reason?: string;
}

interface ReplayDetail {
  id: string;
  date: string;
  session: string;
  status: string;
  createdAt: string;
  llmProvider?: string;
  llmModel?: string;
  matchCount: number;
  extraCount: number;
  missingCount: number;
  generatedSignals: ReplaySignal[];
  actualSignals: ReplaySignal[];
  diff?: DiffEntry[];
  error?: string;
}

function StatusChip({ status }: { status: string }) {
  const cls =
    status === "done"
      ? "chip chip-pos"
      : status === "failed"
        ? "chip chip-neg"
        : status === "running"
          ? "chip chip-info"
          : "chip";
  return <span className={cls}>{status}</span>;
}

function dirChip(direction?: string): string {
  switch ((direction ?? "").toLowerCase()) {
    case "long":
      return "chip chip-pos";
    case "short":
      return "chip chip-neg";
    case "hedge":
      return "chip chip-info";
    case "wait":
      return "chip chip-warn";
    default:
      return "chip";
  }
}

function SignalLine({
  sig,
  match,
}: {
  sig: ReplaySignal;
  match?: "match" | "extra" | "missing";
}) {
  const matchChip =
    match === "match"
      ? "chip chip-pos"
      : match === "extra"
        ? "chip chip-warn"
        : match === "missing"
          ? "chip chip-neg"
          : null;
  return (
    <div className="b-card p-2.5 flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="font-semibold mono tabular-nums">{sig.ticker}</span>
        {sig.direction && (
          <span className={dirChip(sig.direction)}>
            {sig.direction.toUpperCase()}
          </span>
        )}
        {sig.instrument && <span className="chip">{sig.instrument}</span>}
        {matchChip && <span className={`${matchChip} ml-auto`}>{match}</span>}
      </div>
      {sig.thesis && (
        <p className="text-[11px] leading-[1.5] text-fg-muted">{sig.thesis}</p>
      )}
      <div className="flex items-center gap-3 text-[11px] mono tabular-nums t-dim">
        {typeof sig.entry === "number" && <span>e {sig.entry.toFixed(2)}</span>}
        {typeof sig.stop === "number" && <span>s {sig.stop.toFixed(2)}</span>}
        {typeof sig.target1 === "number" && <span>t {sig.target1.toFixed(2)}</span>}
        {typeof sig.confidence === "number" && (
          <span>conf {sig.confidence}</span>
        )}
      </div>
    </div>
  );
}

export default function ReplayDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, error, isLoading } = useSWR<ReplayDetail>(
    `/api/replay/${encodeURIComponent(id)}`,
    fetcher,
    { refreshInterval: 5_000 },
  );

  // Status maps for left/right columns: match status by ticker
  const statusByTicker = new Map<string, "match" | "extra" | "missing">();
  const generatedSignals = data?.generatedSignals ?? [];
  const actualSignals = data?.actualSignals ?? [];
  if (data?.diff) {
    for (const d of data.diff) statusByTicker.set(d.ticker, d.status);
  } else if (data) {
    const actualSet = new Set(actualSignals.map((s) => s.ticker));
    const generatedSet = new Set(generatedSignals.map((s) => s.ticker));
    for (const g of generatedSignals) {
      statusByTicker.set(g.ticker, actualSet.has(g.ticker) ? "match" : "extra");
    }
    for (const a of actualSignals) {
      if (!generatedSet.has(a.ticker)) statusByTicker.set(a.ticker, "missing");
    }
  }

  const headerLabel = data ? `${data.date} ${data.session}` : "Replay";

  return (
    <>
      <Topbar crumbs={["Workspace", "Replay", headerLabel]} />
      <div className="page max-w-[1200px] flex flex-col gap-3">
        {error && (
          <div className="b-card p-4 t-neg text-[12px]">
            Failed to load replay: <span className="mono">{String(error)}</span>
          </div>
        )}
        {isLoading && !data && (
          <div className="b-card p-4">
            <div className="skel h-5 w-1/3 mb-2" />
            <div className="skel h-40 w-full" />
          </div>
        )}

        {data && (
          <>
            <div className="b-card p-3 flex items-center gap-3 flex-wrap">
              <div className="flex flex-col">
                <div className="text-[11px] uppercase tracking-[0.06em] text-fg-muted">
                  Date
                </div>
                <div className="font-medium mono tabular-nums text-[13px]">
                  {data.date}
                </div>
              </div>
              <div className="flex flex-col">
                <div className="text-[11px] uppercase tracking-[0.06em] text-fg-muted">
                  Session
                </div>
                <div className="font-medium text-[13px]">{data.session}</div>
              </div>
              <div className="flex flex-col">
                <div className="text-[11px] uppercase tracking-[0.06em] text-fg-muted">
                  Status
                </div>
                <StatusChip status={data.status} />
              </div>
              {(data.llmProvider || data.llmModel) && (
                <div className="flex flex-col">
                  <div className="text-[11px] uppercase tracking-[0.06em] text-fg-muted">
                    LLM
                  </div>
                  <div className="mono tabular-nums text-[12px]">
                    {data.llmProvider ?? "—"}
                    {data.llmModel ? ` · ${data.llmModel}` : ""}
                  </div>
                </div>
              )}
              <div className="ml-auto flex items-center gap-2">
                <span className="chip chip-pos">
                  match {data.matchCount}
                </span>
                <span className="chip chip-warn">
                  extra {data.extraCount}
                </span>
                <span className="chip chip-neg">
                  missing {data.missingCount}
                </span>
              </div>
            </div>

            {data.error && (
              <div className="b-card p-3 t-neg text-[12px]">{data.error}</div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <section className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="text-[11px] uppercase tracking-[0.06em] text-fg-muted font-medium">
                    Generated signals
                  </div>
                  <span className="text-[11px] t-dim mono tabular-nums">
                    {generatedSignals.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {generatedSignals.length === 0 ? (
                    <div className="b-card p-3 text-[12px] t-dim">
                      No signals generated.
                    </div>
                  ) : (
                    generatedSignals.map((s, i) => (
                      <SignalLine
                        key={`${s.ticker}-${i}`}
                        sig={s}
                        match={statusByTicker.get(s.ticker)}
                      />
                    ))
                  )}
                </div>
              </section>

              <section className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="text-[11px] uppercase tracking-[0.06em] text-fg-muted font-medium">
                    Actual brief signals
                  </div>
                  <span className="text-[11px] t-dim mono tabular-nums">
                    {actualSignals.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {actualSignals.length === 0 ? (
                    <div className="b-card p-3 text-[12px] t-dim">
                      No signals in actual brief.
                    </div>
                  ) : (
                    actualSignals.map((s, i) => (
                      <SignalLine
                        key={`${s.ticker}-${i}`}
                        sig={s}
                        match={statusByTicker.get(s.ticker)}
                      />
                    ))
                  )}
                </div>
              </section>
            </div>

            {data.diff && data.diff.length > 0 && (
              <section className="b-card p-0 overflow-hidden">
                <div className="p-2 text-[11px] uppercase tracking-[0.06em] text-fg-muted font-medium">
                  Diff details
                </div>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-[0.06em] text-fg-muted">
                      <th className="text-left p-2 font-medium">Ticker</th>
                      <th className="text-left p-2 font-medium">Status</th>
                      <th className="text-left p-2 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.diff.map((d, i) => (
                      <tr
                        key={`${d.ticker}-${i}`}
                        style={{ borderTop: "1px solid var(--border)" }}
                      >
                        <td className="p-2 mono tabular-nums">{d.ticker}</td>
                        <td className="p-2">
                          <span
                            className={clsx(
                              "chip",
                              d.status === "match"
                                ? "chip-pos"
                                : d.status === "extra"
                                  ? "chip-warn"
                                  : "chip-neg",
                            )}
                          >
                            {d.status}
                          </span>
                        </td>
                        <td className="p-2 t-dim">{d.reason ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}
