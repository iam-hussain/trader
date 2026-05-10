"use client";
import { use, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import clsx from "clsx";
import {
  Activity,
  Brain,
  FileText,
  LineChart,
  Newspaper,
  Plus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { fetcher } from "@/lib/api";
import { KpiTile } from "@/components/KpiTile";
import { NewsTile, type NewsArticle } from "@/components/NewsTile";
import { PutCallGauge } from "@/components/PutCallGauge";
import {
  UnusualActivityList,
  type UnusualActivityItem,
} from "@/components/UnusualActivityList";
import { FilingsList, type FilingRow } from "@/components/FilingsList";
import {
  TechnicalSummary,
  type TechnicalData,
} from "@/components/TechnicalSummary";

interface Quote {
  symbol: string;
  name?: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  asOf: string;
}

interface NewsResponse {
  articles: NewsArticle[];
}

interface FilingsResponse {
  filings: FilingRow[];
}

interface PutCallSource {
  source: string;
  ratio: number;
}

interface OptionsAnalysis {
  putCall?: PutCallSource[];
  putCallReconciled?: number;
  unusualActivity?: UnusualActivityItem[];
  maxPain?: number;
  ivRank?: number;
}

interface Fundamentals {
  pe?: number | null;
  eps?: number | null;
  beta?: number | null;
  shortPct?: number | null;
  weekRange52?: { low: number; high: number } | null;
}

interface LlmAnalysis {
  thesis?: string;
  signals?: string[];
  catalysts?: string[];
  riskReward?: { reward: number; risk: number };
}

interface AnalysisBundle {
  fundamentals?: Fundamentals;
  technicals?: TechnicalData;
  options?: OptionsAnalysis;
  llmAnalysis?: LlmAnalysis;
}

const TABS = [
  { id: "overview", label: "Overview", Icon: Activity },
  { id: "chart", label: "Chart", Icon: LineChart },
  { id: "options", label: "Options", Icon: TrendingUp },
  { id: "news", label: "News", Icon: Newspaper },
  { id: "filings", label: "Filings", Icon: FileText },
  { id: "analysis", label: "Analysis", Icon: Brain },
] as const;

type TabId = (typeof TABS)[number]["id"];

function fmtPct(n: number | null | undefined, digits = 2) {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  return n;
}

function ErrorCard({ what }: { what: string }) {
  return (
    <div className="card p-3 border-neg/40 text-sm text-neg">
      Could not load {what}.
    </div>
  );
}

export default function TickerPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = use(params);
  const sym = symbol.toUpperCase();
  const [tab, setTab] = useState<TabId>("overview");

  // Hash sync
  useEffect(() => {
    const h = window.location.hash.replace("#", "") as TabId;
    if (TABS.some((t) => t.id === h)) setTab(h);
    const onHash = () => {
      const next = window.location.hash.replace("#", "") as TabId;
      if (TABS.some((t) => t.id === next)) setTab(next);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const setTabAndHash = (id: TabId) => {
    setTab(id);
    if (typeof window !== "undefined") {
      history.replaceState(null, "", `#${id}`);
    }
  };

  const {
    data: quote,
    error: quoteErr,
  } = useSWR<Quote>(`/api/ticker/${sym}/quote`, fetcher, {
    refreshInterval: 30_000,
    keepPreviousData: true,
  });

  const { data: analysis, error: analysisErr } = useSWR<AnalysisBundle>(
    `/api/analysis/${sym}`,
    fetcher,
    { refreshInterval: 120_000, keepPreviousData: true },
  );

  const { data: news, error: newsErr } = useSWR<NewsResponse>(
    tab === "news" ? `/api/ticker/${sym}/news` : null,
    fetcher,
    { refreshInterval: 120_000, keepPreviousData: true },
  );

  const { data: filings, error: filingsErr } = useSWR<FilingsResponse>(
    tab === "filings" ? `/api/ticker/${sym}/filings` : null,
    fetcher,
    { refreshInterval: 300_000, keepPreviousData: true },
  );

  const newsSummary = useMemo(() => {
    const list = news?.articles ?? [];
    if (list.length === 0) return null;
    let pos = 0;
    let neu = 0;
    let neg = 0;
    let scoreSum = 0;
    let scoreCount = 0;
    for (const a of list) {
      if (a.sentiment === "positive") pos++;
      else if (a.sentiment === "negative") neg++;
      else neu++;
      if (typeof a.sentimentScore === "number") {
        scoreSum += a.sentimentScore;
        scoreCount++;
      }
    }
    const avg = scoreCount > 0 ? scoreSum / scoreCount : null;
    return { total: list.length, pos, neu, neg, avg };
  }, [news]);

  return (
    <div className="space-y-6 max-w-6xl">
      <header className="sticky top-0 z-10 -mx-4 px-4 py-3 bg-bg-base/85 backdrop-blur border-b border-border flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-3xl font-semibold tracking-tight font-mono">
              {sym}
            </h1>
            {quote?.name && (
              <span className="text-sm text-fg-muted truncate">
                {quote.name}
              </span>
            )}
          </div>
          {quote ? (
            <div className="mt-1 flex items-baseline gap-3">
              <span className="font-mono tabular-nums text-2xl">
                ${quote.price.toFixed(2)}
              </span>
              <span
                className={clsx(
                  "font-mono tabular-nums text-sm inline-flex items-center gap-1",
                  quote.change >= 0 ? "text-pos" : "text-neg",
                )}
              >
                {quote.change >= 0 ? (
                  <TrendingUp className="w-3.5 h-3.5" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5" />
                )}
                {quote.change >= 0 ? "+" : ""}
                {quote.change.toFixed(2)} ({quote.changePct.toFixed(2)}%)
              </span>
            </div>
          ) : quoteErr ? (
            <div className="mt-1 text-sm text-neg">Could not load quote.</div>
          ) : (
            <div className="mt-1 text-sm text-fg-muted">Loading…</div>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button className="btn">
            <Plus className="w-4 h-4" />
            Watchlist
          </button>
          <button className="btn btn-primary">Stage trade</button>
        </div>
      </header>

      <nav
        role="tablist"
        aria-label="Ticker sections"
        className="flex gap-1 border-b border-border overflow-x-auto"
      >
        {TABS.map(({ id, label, Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              role="tab"
              id={`tab-${id}`}
              aria-selected={active}
              aria-controls={`panel-${id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setTabAndHash(id)}
              className={clsx(
                "inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors",
                active
                  ? "text-fg border-accent"
                  : "text-fg-muted border-transparent hover:text-fg hover:border-border-strong",
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          );
        })}
      </nav>

      {/* Overview */}
      {tab === "overview" && (
        <section
          role="tabpanel"
          id="panel-overview"
          aria-labelledby="tab-overview"
          className="space-y-4"
        >
          {analysisErr && <ErrorCard what="analysis bundle" />}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <KpiTile
              label="P/E"
              value={fmtPct(analysis?.fundamentals?.pe ?? null)}
              unit="x"
              hint="Price to earnings"
            />
            <KpiTile
              label="EPS"
              value={fmtPct(analysis?.fundamentals?.eps ?? null)}
              unit="$"
              hint="Earnings per share"
            />
            <KpiTile
              label="RSI(14)"
              value={analysis?.technicals?.rsi14 ?? null}
              hint="Relative strength index"
            />
            <KpiTile
              label="ATR(14)"
              value={analysis?.technicals?.atr14 ?? null}
              hint="Average true range"
            />
            <KpiTile
              label="IV rank"
              value={analysis?.options?.ivRank ?? null}
              unit="%"
              hint="Implied volatility rank"
            />
            <KpiTile
              label="52w range"
              value={
                analysis?.fundamentals?.weekRange52
                  ? `${analysis.fundamentals.weekRange52.low.toFixed(2)} – ${analysis.fundamentals.weekRange52.high.toFixed(2)}`
                  : null
              }
              hint="52-week low to high"
            />
            <KpiTile
              label="Short %"
              value={fmtPct(analysis?.fundamentals?.shortPct ?? null)}
              unit="%"
              hint="Short interest as % float"
            />
            <KpiTile
              label="Beta"
              value={fmtPct(analysis?.fundamentals?.beta ?? null)}
              hint="5-year beta vs benchmark"
            />
          </div>
          {analysis?.technicals ? (
            <TechnicalSummary data={analysis.technicals} />
          ) : (
            <div className="card p-4 text-sm text-fg-muted">
              Technicals unavailable.
            </div>
          )}
        </section>
      )}

      {/* Chart */}
      {tab === "chart" && (
        <section
          role="tabpanel"
          id="panel-chart"
          aria-labelledby="tab-chart"
          className="card p-4"
        >
          <iframe
            title={`${sym} chart`}
            src={`https://s.tradingview.com/widgetembed/?symbol=${sym}&interval=D&theme=dark&style=1&hide_side_toolbar=0&withdateranges=1`}
            className="w-full h-[560px] rounded-md border border-border"
          />
        </section>
      )}

      {/* Options */}
      {tab === "options" && (
        <section
          role="tabpanel"
          id="panel-options"
          aria-labelledby="tab-options"
          className="space-y-4"
        >
          {analysisErr && <ErrorCard what="options data" />}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <KpiTile
              label="Max pain"
              value={analysis?.options?.maxPain ?? null}
              unit="$"
              hint="Strike with maximum pain"
            />
            <KpiTile
              label="IV rank"
              value={analysis?.options?.ivRank ?? null}
              unit="%"
              hint="Implied volatility rank"
            />
            <KpiTile
              label="P/C reconciled"
              value={analysis?.options?.putCallReconciled ?? null}
              hint="Reconciled put/call ratio across sources"
            />
          </div>
          <PutCallGauge
            ratio={
              analysis?.options?.putCallReconciled ??
              analysis?.options?.putCall?.[0]?.ratio ??
              0
            }
            sources={analysis?.options?.putCall}
          />
          <UnusualActivityList items={analysis?.options?.unusualActivity ?? []} />
        </section>
      )}

      {/* News */}
      {tab === "news" && (
        <section
          role="tabpanel"
          id="panel-news"
          aria-labelledby="tab-news"
          className="space-y-3"
        >
          {newsErr && <ErrorCard what="news" />}
          {newsSummary && (
            <div className="card p-3 text-sm flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-mono tabular-nums">
                {newsSummary.total} articles
              </span>
              <span className="text-fg-subtle">·</span>
              <span className="font-mono tabular-nums text-pos">
                {newsSummary.pos} positive
              </span>
              <span className="text-fg-subtle">/</span>
              <span className="font-mono tabular-nums text-fg-muted">
                {newsSummary.neu} neutral
              </span>
              <span className="text-fg-subtle">/</span>
              <span className="font-mono tabular-nums text-neg">
                {newsSummary.neg} negative
              </span>
              {newsSummary.avg !== null && (
                <>
                  <span className="text-fg-subtle">·</span>
                  <span className="text-fg-muted">avg</span>
                  <span
                    className={clsx(
                      "font-mono tabular-nums",
                      newsSummary.avg >= 0 ? "text-pos" : "text-neg",
                    )}
                  >
                    {newsSummary.avg >= 0 ? "+" : ""}
                    {newsSummary.avg.toFixed(2)}
                  </span>
                </>
              )}
            </div>
          )}
          <div className="space-y-2">
            {(news?.articles ?? []).map((a, i) => (
              <NewsTile key={`${a.url}-${i}`} article={a} />
            ))}
            {news && news.articles.length === 0 && (
              <div className="card p-4 text-sm text-fg-muted">
                No recent news.
              </div>
            )}
          </div>
        </section>
      )}

      {/* Filings */}
      {tab === "filings" && (
        <section
          role="tabpanel"
          id="panel-filings"
          aria-labelledby="tab-filings"
          className="space-y-3"
        >
          {filingsErr && <ErrorCard what="filings" />}
          <FilingsList rows={filings?.filings ?? []} />
        </section>
      )}

      {/* Analysis */}
      {tab === "analysis" && (
        <section
          role="tabpanel"
          id="panel-analysis"
          aria-labelledby="tab-analysis"
          className="space-y-4"
        >
          {analysisErr && <ErrorCard what="analysis" />}
          <article className="card p-4 space-y-3">
            <header className="flex items-center justify-between">
              <h3 className="text-sm font-medium inline-flex items-center gap-2">
                <Brain className="w-4 h-4" />
                LLM Thesis
              </h3>
            </header>
            {analysis?.llmAnalysis ? (
              <>
                {analysis.llmAnalysis.thesis && (
                  <div className="prose prose-sm prose-invert max-w-none text-fg leading-relaxed whitespace-pre-wrap">
                    {analysis.llmAnalysis.thesis}
                  </div>
                )}
                {analysis.llmAnalysis.signals &&
                  analysis.llmAnalysis.signals.length > 0 && (
                    <div>
                      <div className="text-xs uppercase tracking-wide text-fg-muted mb-1.5">
                        Signals
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {analysis.llmAnalysis.signals.map((s) => (
                          <span
                            key={s}
                            className="text-[11px] px-2 py-0.5 rounded-full border border-border bg-bg-elevated text-fg-muted"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                {analysis.llmAnalysis.catalysts &&
                  analysis.llmAnalysis.catalysts.length > 0 && (
                    <div>
                      <div className="text-xs uppercase tracking-wide text-fg-muted mb-1.5">
                        Catalysts
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {analysis.llmAnalysis.catalysts.map((c) => (
                          <span
                            key={c}
                            className="text-[11px] px-2 py-0.5 rounded-full border border-accent/30 bg-accent/10 text-accent"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                {analysis.llmAnalysis.riskReward && (
                  <RiskRewardMeter
                    reward={analysis.llmAnalysis.riskReward.reward}
                    risk={analysis.llmAnalysis.riskReward.risk}
                  />
                )}
              </>
            ) : (
              <p className="text-sm text-fg-muted">
                Phase 3 — generate a brief to see LLM analysis here.
              </p>
            )}
          </article>
        </section>
      )}
    </div>
  );
}

function RiskRewardMeter({ reward, risk }: { reward: number; risk: number }) {
  const safeReward = Math.max(reward, 0);
  const safeRisk = Math.max(risk, 0.0001);
  const rr = safeReward / safeRisk;
  const total = safeReward + safeRisk;
  const rewardPct = total > 0 ? (safeReward / total) * 100 : 0;

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-fg-muted mb-1">
        <span>Risk : Reward</span>
        <span className="font-mono tabular-nums text-fg">
          1 : {rr.toFixed(2)}
        </span>
      </div>
      <div className="h-2 rounded-full bg-bg-elevated overflow-hidden flex">
        <div className="h-full bg-neg/60" style={{ width: `${100 - rewardPct}%` }} />
        <div className="h-full bg-pos/70" style={{ width: `${rewardPct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] font-mono tabular-nums text-fg-subtle mt-0.5">
        <span>risk {safeRisk.toFixed(2)}</span>
        <span>reward {safeReward.toFixed(2)}</span>
      </div>
    </div>
  );
}
