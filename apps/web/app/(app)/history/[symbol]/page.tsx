"use client";

import { use, useState } from "react";
import useSWR from "swr";
import clsx from "clsx";
import { Topbar } from "@/components/Topbar";
import { fetcher } from "@/lib/api";

// Calendar-day horizons (news is reported by publish date, which is calendar
// not trading days). Same set as Forecast for muscle-memory parity.
const HORIZONS: Array<{ id: string; label: string; days: number }> = [
  { id: "1d", label: "1D", days: 1 },
  { id: "1w", label: "1W", days: 7 },
  { id: "1m", label: "1M", days: 30 },
  { id: "3m", label: "3M", days: 90 },
  { id: "6m", label: "6M", days: 180 },
  { id: "1y", label: "1Y", days: 365 },
  { id: "2y", label: "2Y", days: 730 },
  { id: "5y", label: "5Y", days: 1825 },
];

interface Article {
  title: string;
  url?: string;
  source?: string;
  publishedAt?: string;
  summary?: string;
  sentiment?: "positive" | "negative" | "neutral";
  sentimentScore?: number;
  tickers?: string[];
}

interface DayGroup {
  date: string;
  count: number;
  positive: number;
  negative: number;
  neutral: number;
  /** Day's own daily return (close vs prev close). Context, not attribution. */
  dailyReturnPct?: number | null;
  /** Close-to-close return 1 / 5 / 21 trading days after this date. */
  fwd1dPct?: number | null;
  fwd5dPct?: number | null;
  fwd21dPct?: number | null;
  articles: Article[];
}

interface HistoryResponse {
  symbol: string;
  horizonDays: number;
  fromDate: string;
  toDate: string;
  totalCount: number;
  daysWithNews: number;
  coverageNote?: string | null;
  summary?: {
    positive?: number;
    negative?: number;
    neutral?: number;
    score?: number;
  };
  days: DayGroup[];
}

function SentimentDot({ s }: { s?: string }) {
  const cls =
    s === "positive"
      ? "bg-emerald-500"
      : s === "negative"
        ? "bg-rose-500"
        : "bg-zinc-400";
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full ${cls}`}
      aria-hidden="true"
    />
  );
}

function ReturnCell({
  label,
  pct,
  tip,
}: {
  label: string;
  pct: number | null | undefined;
  tip: string;
}) {
  const cls =
    typeof pct === "number"
      ? pct > 0
        ? "t-pos"
        : pct < 0
          ? "t-neg"
          : "t-dim"
      : "t-dim";
  const display =
    typeof pct === "number" ? `${pct > 0 ? "+" : ""}${pct.toFixed(2)}%` : "—";
  return (
    <div className="flex flex-col items-end gap-0" title={tip}>
      <span className="text-[9px] uppercase tracking-[0.04em] t-dim">{label}</span>
      <span className={clsx("text-[11px] mono tabular-nums", cls)}>{display}</span>
    </div>
  );
}

export default function HistorySymbolPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = use(params);
  const sym = symbol.toUpperCase();
  const [horizonId, setHorizonId] = useState<string>("1w");
  const horizon = HORIZONS.find((h) => h.id === horizonId) ?? HORIZONS[1];

  const { data, error, isLoading } = useSWR<HistoryResponse>(
    `/api/history/${encodeURIComponent(sym)}?days=${horizon.days}`,
    fetcher,
    { keepPreviousData: true, refreshInterval: 0 },
  );

  return (
    <>
      <Topbar crumbs={["Markets", "History", sym]} />
      <div className="page max-w-[1100px] flex flex-col gap-3">
        <div className="b-card p-3 flex items-center gap-2 flex-wrap">
          <span className="font-semibold mono tabular-nums text-[18px]">
            {sym}
          </span>
          <span className="text-[11px] t-dim">
            news timeline (Yahoo · Finviz · Google · Benzinga)
          </span>
          {data && (
            <span className="text-[11px] t-dim mono tabular-nums">
              · {data.totalCount} articles across {data.daysWithNews} day{data.daysWithNews === 1 ? "" : "s"}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] t-dim uppercase tracking-[0.06em]">Horizon</span>
            <div className="seg">
              {HORIZONS.map((h) => (
                <button
                  key={h.id}
                  className={clsx(horizonId === h.id && "active")}
                  onClick={() => setHorizonId(h.id)}
                  title={`${h.days} calendar days`}
                >
                  {h.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {data?.coverageNote && (
          <div className="b-card p-3 text-[12px] t-dim">
            ⚠ {data.coverageNote}
          </div>
        )}

        {error && (
          <div className="b-card p-4 t-neg text-[12px]">
            Failed to load history: <span className="mono">{String(error)}</span>
          </div>
        )}

        {isLoading && !data && (
          <div className="b-card p-4">
            <div className="skel h-5 w-1/3 mb-2" />
            <div className="skel h-40 w-full" />
          </div>
        )}

        {data && data.days.length === 0 && (
          <div className="b-card p-6 text-center t-dim text-[13px]">
            No news found for {sym} in the last {horizon.label}.
          </div>
        )}

        {data &&
          data.days.map((g) => (
            <section key={g.date} className="b-card overflow-hidden">
              <header className="flex items-start gap-4 px-4 py-2.5 hairline-b">
                <div className="flex flex-col">
                  <div className="font-semibold mono tabular-nums text-[13px]">
                    {g.date}
                  </div>
                  <div className="text-[11px] t-dim mono tabular-nums">
                    {g.count} article{g.count === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-4">
                  <ReturnCell
                    label="Day"
                    pct={g.dailyReturnPct}
                    tip="Same-day return: (close − previous close) / previous close. Context only — does not attribute to any specific article."
                  />
                  <ReturnCell
                    label="+1d"
                    pct={g.fwd1dPct}
                    tip="Forward 1 trading day: (close[t+1] − close[t]) / close[t]"
                  />
                  <ReturnCell
                    label="+5d"
                    pct={g.fwd5dPct}
                    tip="Forward 5 trading days (~1 week)"
                  />
                  <ReturnCell
                    label="+21d"
                    pct={g.fwd21dPct}
                    tip="Forward 21 trading days (~1 month)"
                  />
                  <div className="flex items-center gap-2 text-[11px] mono tabular-nums pl-3 hairline-l">
                    {g.positive > 0 && (
                      <span className="t-pos">+{g.positive}</span>
                    )}
                    {g.negative > 0 && (
                      <span className="t-neg">−{g.negative}</span>
                    )}
                    {g.neutral > 0 && (
                      <span className="t-dim">·{g.neutral}</span>
                    )}
                  </div>
                </div>
              </header>
              <ul className="divide-y divide-bg-3">
                {g.articles.map((a, i) => (
                  <li key={`${a.url ?? a.title}-${i}`} className="px-4 py-2.5 flex items-start gap-3">
                    <SentimentDot s={a.sentiment} />
                    <div className="flex-1 min-w-0">
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[13px] hover:underline block truncate"
                      >
                        {a.title}
                      </a>
                      <div className="text-[11px] t-dim flex items-center gap-2 mt-0.5">
                        {a.source && <span className="mono uppercase">{a.source}</span>}
                        {a.publishedAt && (
                          <span className="mono tabular-nums">
                            {new Date(a.publishedAt).toLocaleTimeString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>
    </>
  );
}
