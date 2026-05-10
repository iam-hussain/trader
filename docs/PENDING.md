# Pending

The concrete TODO list, organized by phase. When you ship something, move it
to [`FEATURES.md`](./FEATURES.md) under "shipped" instead of deleting it
here — keep the trail.

## Phase 2 (analysis engine) — finishing touches

- [ ] **Tests for stable scrapers**: CBOE CSV columns, FRED API series shape,
      SEC submissions API. These have stable contracts; lock with snapshots.
- [ ] **Caching layer for scrapers**: Redis TTL cache by `(source, symbol)`
      to avoid hammering. 5-min TTL for quotes, 30-min for fundamentals,
      24-h for filings.
- [ ] **Macro page**: market regime detector that combines VIX + SPY 200-EMA
      + breadth (% of S&P above 50-EMA) into a single regime classification.
- [ ] **Sector heatmap data**: replace dashboard's mock `SECTORS` constant
      with a real endpoint that pulls XL? sector ETF percent-changes.
- [ ] **News sentiment polish**: weight FinBERT score by article recency
      (decay over 48 h) for the aggregate.
- [ ] **Earnings calendar endpoint**: scrape Earnings Whispers / Investing.com.
- [ ] **Econ calendar endpoint**: scrape Forex Factory.

## Phase 3 (signal & risk) — to do

- [ ] **Signal engine** (`apps/api/src/services/signal-engine.ts`):
  - bundle assembly (analysis + macro + risk limits)
  - prompt template with house style + JSON schema description
  - `completeStructured(TradeSignalArray)` call
  - per-signal Zod re-validation + price-vs-quote sanity check
  - persistence: signals + brief link
- [ ] **Risk engine** (`apps/api/src/services/risk-engine.ts`):
  - ATR-based stop-distance
  - fixed-fractional sizing
  - capped Kelly (1/4 cap)
  - max-trades/day enforcement
  - max-daily-loss enforcement (live broker P/L)
  - FOMC/CPI/PCE/NFP blackout windows
  - sector + beta-basket concentration caps
- [ ] **Scheduled briefs** via BullMQ:
  - 08:00 ET pre-market (full bundle)
  - 12:00 ET mid-day (delta only)
  - 16:30 ET post-market (review + tomorrow setups)
- [ ] **Manual brief trigger** wired to dashboard CTA (replace stub job in
      `apps/api/src/routes/brief.ts`).
- [ ] **LLM provider re-run** chip in brief detail page — fires a new brief
      with a different model and stores both for comparison.
- [ ] **Trade journal**:
  - auto-create entry on signal acceptance with thesis snapshot
  - manual edit: outcome, lessons, screenshots, tags
  - calendar heatmap
- [ ] **Watchlist alerts**:
  - price level
  - IV change %
  - news keyword
  - breakout (close above N-day high)
  - delivery via web SSE + Telegram + email channels (toggle per channel)

## Phase 4 (execution) — to do

- [ ] **Full IbkrAdapter** in `packages/brokers/src/ibkr.ts`:
  - connect to TWS / IB Gateway via @stoqey/ib
  - account summary (buying power, daily P/L)
  - place bracket order (parent limit + OCO TP/SL)
  - cancel single + cancel all
  - position update subscription → SSE → UI
- [ ] **Order staging UI** at `/orders`:
  - staged-orders queue with full risk profile per row
  - Confirm + Edit + Cancel per row
  - kill switch (red, 2s hold-to-confirm) with optional flatten toggle
  - today's risk header
- [ ] **Server-side risk middleware** rejecting confirmed orders that violate
      caps (UI cannot bypass).
- [ ] **Live-account banner** + type-to-confirm modal on paper→live switch.
- [ ] **Real-time positions panel** with live P/L (SSE feed).
- [ ] **Order history view** with filters.

## Phase 5 (forecast & backtest) — to do

- [ ] **Forecast modules** (`apps/quant/forecast/`):
  - Prophet next-week directional forecast w/ confidence bands
  - ARIMA + GARCH short-term vol forecast
  - candlestick pattern recognition + statistical edge
- [ ] **Backtest framework** (`apps/quant/backtest/`):
  - vectorbt runner
  - built-in strategies (EMA crossover, RSI MR, Earnings PEAD, gap-and-go,
    ATR breakout, opening-range breakout)
  - walk-forward + Monte Carlo
  - equity curve / DD / win rate / profit factor / Sharpe / Sortino /
    expectancy / max DD / trade list
- [ ] **Replay / sandbox mode**:
  - re-run any past day's signal pipeline using only data available then
  - compare engine output to actual journal entries
- [ ] **Performance attribution**:
  - P/L by setup tag
  - P/L by sector
  - P/L by holding period
  - LLM provider attribution: which model produced winning signals?

## Cross-cutting

- [ ] **Notifications**: Telegram bot + SMTP wired to BullMQ events
- [ ] **Bull Board** mounted at `/admin/queues` (gated by env flag) for
      queue inspection
- [ ] **Prometheus metrics** endpoint on api + quant
- [ ] **OpenAPI spec** auto-generated from Fastify route schemas
- [ ] **CI**: GitHub Actions running pnpm lint + typecheck + test +
      python -m pytest on PRs
- [ ] **Pre-commit hook** for lint + format
- [ ] **Settings → "Default LLM model + per-feature override"** so signal
      generation can use Opus while news summarization uses Haiku
- [ ] **Settings → "Notification channel toggles"** (signals / fills / alerts
      / errors per channel)
- [ ] **Drag-to-reorder** on watchlist (currently click-to-remove only)
- [ ] **Per-ticker price/IV/news-keyword/breakout alert config** popover on
      watchlist row
- [ ] **IV surface heatmap** on stock detail Options tab
- [ ] **Options chain table** (strike-centered, calls left / puts right)
      proper render — currently we only surface volumes & reconciled P/C

## UX polish backlog

- [ ] Command palette (`⌘K`) — wire the search box in sidebar to a real
      jump-to / action launcher
- [ ] Keyboard shortcuts global handler (`g d`, `g b`, etc — nav)
- [ ] `(g s)` settings page tabbed layout (currently single scroll)
- [ ] Mobile: stack sidebar to a drawer below 1024 px
- [ ] Light theme parity check (we ship dark; light works but is
      under-tested)
- [ ] All buttons that fire writes should show a brief loading spinner
- [ ] All `Could not load X` errors should have a Retry button

## Documentation

- [ ] Per-scraper TROUBLESHOOTING note when a free source breaks (most do
      every 6 months)
- [ ] Phase 3 / 4 / 5 architecture diagrams added to ARCHITECTURE.md
- [ ] Recording of a full daily flow (morning brief → stage → confirm → fill
      → journal → postmarket review) for onboarding
- [ ] CLAUDE.md at repo root documenting the agent workflow conventions
