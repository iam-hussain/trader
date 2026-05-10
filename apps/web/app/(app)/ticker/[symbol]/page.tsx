"use client";
import useSWR from "swr";
import { use } from "react";
import { fetcher } from "@/lib/api";

interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  asOf: string;
}

export default function TickerPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = use(params);
  const sym = symbol.toUpperCase();
  const { data: quote, error } = useSWR<Quote>(`/api/ticker/${sym}/quote`, fetcher, {
    refreshInterval: 30_000,
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight mono">{sym}</h1>
          {quote && (
            <div className="flex items-baseline gap-3 mt-1">
              <span className="mono tabular text-2xl">${quote.price.toFixed(2)}</span>
              <span
                className={`mono tabular text-sm ${
                  quote.change >= 0 ? "text-pos" : "text-neg"
                }`}
              >
                {quote.change >= 0 ? "+" : ""}
                {quote.change.toFixed(2)} ({quote.changePct.toFixed(2)}%)
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button className="btn">Add to watchlist</button>
          <button className="btn btn-primary">Stage trade</button>
        </div>
      </header>

      {error && (
        <div className="card p-4 border-neg/50 text-neg text-sm">
          Could not load quote. Is the quant service running?
        </div>
      )}

      <nav className="flex gap-1 border-b border-border">
        {["Overview", "Chart", "Options", "News", "Filings", "Analysis"].map((t) => (
          <button
            key={t}
            className="px-3 py-2 text-sm text-fg-muted border-b-2 border-transparent hover:text-fg hover:border-border-strong"
          >
            {t}
          </button>
        ))}
      </nav>

      <section className="card p-4">
        <iframe
          title={`${sym} chart`}
          src={`https://s.tradingview.com/widgetembed/?symbol=${sym}&interval=D&theme=dark&style=1&hide_side_toolbar=0&withdateranges=1`}
          className="w-full h-[480px] rounded-md border border-border"
        />
      </section>

      <section className="card p-4">
        <div className="text-xs uppercase tracking-wide text-fg-muted mb-2">Phase 1</div>
        <div className="text-sm text-fg-muted">
          Options chain, P/C reconciliation, news + sentiment, filings, and the LLM analysis tab
          are scaffolded server-side and will populate in Phase 2.
        </div>
      </section>
    </div>
  );
}
