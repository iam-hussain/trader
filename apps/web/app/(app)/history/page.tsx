"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { api } from "@/lib/api";

const DEFAULT_TICKERS = ["SPY", "QQQ", "AAPL", "NVDA", "TSLA", "MSFT", "AMD", "META"];
const SUMMARY_DAYS = 7;

interface DayGroup {
  date: string;
  count: number;
  positive: number;
  negative: number;
  neutral: number;
  dailyReturnPct?: number | null;
  fwd5dPct?: number | null;
}

interface HistorySummary {
  symbol: string;
  horizonDays: number;
  totalCount: number;
  daysWithNews: number;
  days: DayGroup[];
}

interface TickerCard {
  symbol: string;
  status: "loading" | "ok" | "error";
  total?: number;
  positive?: number;
  negative?: number;
  neutral?: number;
  latestDate?: string;
  latestArticles?: number;
  /** Forward 5-trading-day return from the most recent news day (if available). */
  fwd5dFromLastNews?: number | null;
  /** Date used as t=0 for the forward-5d reading. */
  fwd5dRefDate?: string | null;
  error?: string;
}

function tone(p: number, n: number): "pos" | "neg" | "neutral" {
  if (p > n * 1.5 && p >= 2) return "pos";
  if (n > p * 1.5 && n >= 2) return "neg";
  return "neutral";
}

export default function HistoryIndexPage() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [cards, setCards] = useState<TickerCard[]>(
    DEFAULT_TICKERS.map((s) => ({ symbol: s, status: "loading" })),
  );

  useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      const results = await Promise.all(
        DEFAULT_TICKERS.map(async (sym): Promise<TickerCard> => {
          try {
            const data = await api<HistorySummary>(
              `/api/history/${encodeURIComponent(sym)}?days=${SUMMARY_DAYS}`,
            );
            let pos = 0;
            let neg = 0;
            let neutral = 0;
            for (const d of data.days) {
              pos += d.positive;
              neg += d.negative;
              neutral += d.neutral;
            }
            const latest = data.days[0];
            // Find the most recent day in the window that has both news and
            // a forward-5d return — that's the "since-news" signal.
            const withFwd = data.days.find(
              (d) => typeof d.fwd5dPct === "number",
            );
            return {
              symbol: sym,
              status: "ok",
              total: data.totalCount,
              positive: pos,
              negative: neg,
              neutral,
              latestDate: latest?.date,
              latestArticles: latest?.count,
              fwd5dFromLastNews:
                typeof withFwd?.fwd5dPct === "number" ? withFwd.fwd5dPct : null,
              fwd5dRefDate: withFwd?.date ?? null,
            };
          } catch (e) {
            return {
              symbol: sym,
              status: "error",
              error: e instanceof Error ? e.message : String(e),
            };
          }
        }),
      );
      if (!cancelled) setCards(results);
    }
    void loadAll();
    return () => {
      cancelled = true;
    };
  }, []);

  function open(sym: string) {
    const clean = sym.trim().toUpperCase();
    if (!clean) return;
    router.push(`/history/${encodeURIComponent(clean)}`);
  }

  return (
    <>
      <Topbar crumbs={["Markets", "History"]} />
      <div className="page max-w-[1100px] flex flex-col gap-4">
        <div className="b-card p-4">
          <h1 className="text-lg font-semibold mb-1">News history</h1>
          <p className="text-[12px] t-dim mb-3">
            Day-by-day news timeline for a ticker. Aggregates Yahoo, Finviz,
            Google News and Benzinga. Tile sentiment summarizes the last{" "}
            {SUMMARY_DAYS} days.
          </p>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              open(input);
            }}
          >
            <input
              className="input flex-1 mono uppercase"
              placeholder="Ticker (e.g. SPY)"
              maxLength={10}
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
            />
            <button type="submit" className="btn btn-primary">
              Open history
            </button>
          </form>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {cards.map((c) => {
            const t = c.status === "ok" ? tone(c.positive ?? 0, c.negative ?? 0) : "neutral";
            const Icon = t === "pos" ? TrendingUp : t === "neg" ? TrendingDown : Minus;
            const toneClass = t === "pos" ? "t-pos" : t === "neg" ? "t-neg" : "t-dim";
            return (
              <Link
                key={c.symbol}
                href={`/history/${encodeURIComponent(c.symbol)}`}
                className="b-card p-3 no-underline text-fg hover:bg-bg-elev-1 transition-colors"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold mono tabular-nums text-[15px]">
                    {c.symbol}
                  </span>
                  <Icon className={clsx("w-4 h-4 ml-auto", toneClass)} />
                </div>
                {c.status === "loading" && (
                  <div className="text-[11px] t-dim">Loading…</div>
                )}
                {c.status === "error" && (
                  <div className="text-[11px] t-neg truncate" title={c.error}>
                    Failed to load
                  </div>
                )}
                {c.status === "ok" && (
                  <>
                    <div className="flex items-center gap-2 text-[11px] mono tabular-nums">
                      <span className="t-pos">+{c.positive}</span>
                      <span className="t-neg">−{c.negative}</span>
                      <span className="t-dim">·{c.neutral}</span>
                      <span className="ml-auto t-dim">{c.total} art</span>
                    </div>
                    <div
                      className="flex items-center gap-2 text-[11px] mono tabular-nums mt-1.5"
                      title="Stock return 5 trading days after the most recent day that had news in the window. Context, not attribution."
                    >
                      <span className="text-[10px] t-dim uppercase tracking-[0.06em]">
                        +5d since news
                      </span>
                      {c.fwd5dFromLastNews === null ||
                      c.fwd5dFromLastNews === undefined ? (
                        <span className="t-dim">—</span>
                      ) : (
                        <span
                          className={clsx(
                            c.fwd5dFromLastNews > 0
                              ? "t-pos"
                              : c.fwd5dFromLastNews < 0
                                ? "t-neg"
                                : "t-dim",
                          )}
                        >
                          {c.fwd5dFromLastNews > 0 ? "+" : ""}
                          {c.fwd5dFromLastNews.toFixed(2)}%
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] t-dim mt-1 mono tabular-nums">
                      {c.latestDate
                        ? `latest ${c.latestDate} · ${c.latestArticles}`
                        : `no news in ${SUMMARY_DAYS}d`}
                    </div>
                  </>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
