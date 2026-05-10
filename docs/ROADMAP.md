# Roadmap

The product is built in five phases. Each phase produces something runnable
and useful on its own. We don't merge a phase until its verification checklist
passes.

## Phase 1 — Foundation ✅

**Goal:** the cabinet for everything else. Auth, watchlists, settings, ticker
detail page, LLM provider switcher, quant service skeleton.

### Delivered
- pnpm + Turborepo monorepo with `apps/{web,api,quant}` and
  `packages/{db,schemas,llm,brokers,config,ui}`
- Docker Compose: mongo (single-node RS), redis, api, web, quant, opt-in ollama
- Prisma + Mongo schema (User, Watchlist, Ticker, Signal, Trade,
  JournalEntry, Setting, ApiKey, Brief, Alert)
- Zod schemas (TradeSignal with directional consistency, Brief, RiskLimits,
  market types)
- LLM provider abstraction (Anthropic / OpenAI / Google / Ollama) over Vercel
  AI SDK with structured-output support
- BrokerAdapter interface + IbkrAdapter stub
- Fastify API: cookie-JWT auth, watchlist CRUD, settings, encrypted-at-rest
  API key store with env fallback, providers/validate, ticker proxy → quant,
  brief stub, pre-wired TradingView webhook endpoint
- Next.js web: dark/dense UI with mono numerics, login, dashboard, watchlist,
  ticker detail with TradingView embed, settings (risk + broker + API keys)
- FastAPI quant: `/healthz`, `/quote`, `/news`, `/options` (yfinance-backed)

### Verification
- `docker compose up` brings all services healthy
- `curl localhost:4000/healthz` and `localhost:8000/healthz` → 200
- Register → login → add watchlist → add ticker → see live quote
- Paste an LLM key in Settings → click Validate → green check

---

## Phase 2 — Analysis engine 🟡 (current)

**Goal:** turn raw data into useful, reconciled, sentiment-aware analysis.

### Delivered (this iteration)
- Scrapers: Finviz, CBOE, NASDAQ.com, Barchart, OptionCharts.io,
  MarketChameleon, OpenInsider, SEC EDGAR, FRED, Google News RSS, Benzinga RSS
- Common HTTP scaffold (per-host rate limiting, Tenacity retry, browser UA,
  SEC compliance headers, ScraperError class)
- Options analytics: Black-Scholes greeks + IV solver, IV rank/percentile,
  put/call ratio reconciler (median + disagreement flag), unusual options
  activity detector, max-pain calculator
- Technical indicators bundle: RSI, MACD, Bollinger, EMAs (20/50/200), VWAP,
  ATR, support/resistance, trend classification, signal triggers
  (rsi_oversold, macd_bull_cross, bb_squeeze, golden_cross, etc.)
- Sentiment: lazy-loaded FinBERT classifier with finance lexicon fallback
  + article aggregator producing avg score and top positive/negative
- Web ticker detail tabs (Overview / Chart / Options / News / Filings /
  Analysis) with KpiTile, NewsTile, PutCallGauge, UnusualActivityList,
  InsiderTable, FilingsList, TechnicalSummary components

### Pending in Phase 2
- Wire the new endpoints into `apps/quant/main.py` (`/analysis/{symbol}`
  bundle, `/technicals/{symbol}`, `/options/{symbol}/full`,
  `/insider/{symbol}`, `/filings/{symbol}`, `/macro/regime`,
  `/calendar/earnings`, `/calendar/economic`)
- Add API routes `/api/analysis/{symbol}`, `/api/macro/*`,
  `/api/calendar/*`, extend `/api/ticker/*` for insider/filings/technicals
- Integration tests for at least the scrapers that hit stable URLs
  (CBOE CSV, FRED API, SEC submissions)

### Verification
- `GET /api/analysis/AAPL` returns full bundle (price, fundamentals,
  technicals, options snapshot with reconciled P/C across ≥3 sources, news
  with sentiment, insider trades, filings)
- Spot-check P/C against CBOE site for SPY (market-wide) and AAPL (per-ticker)
- News sentiment aggregator returns consistent results between FinBERT and
  lexicon for a smoke-test set

---

## Phase 3 — Trade signal & risk engine ⏳

**Goal:** turn analysis into validated trade ideas with hard risk discipline.

### Will deliver
- **Signal engine** at `apps/api/src/services/signal-engine.ts`:
  - Assembles per-ticker bundle (analysis + macro + risk limits)
  - Builds prompt with house-style guidance and JSON schema description
  - Calls `completeStructured(TradeSignalArray)` against the user's chosen LLM
  - Re-validates each signal (Zod + price-vs-quote sanity check + stop/target
    direction)
  - Persists accepted signals; logs rejections with reason
- **Risk engine** at `apps/api/src/services/risk-engine.ts`:
  - ATR-based stop-distance calculation
  - Fixed-fractional position sizing (riskPerTrade × accountSize / stopDist)
  - Capped Kelly variant (1/4 Kelly cap)
  - Max-trades/day, max-daily-loss enforcement (with current-day fills)
  - FOMC/CPI/PCE/NFP blackout windows (configurable ± minutes)
  - Concentration caps: per sector, per beta basket
- **Three scheduled briefs** via BullMQ:
  - 08:00 ET pre-market (full analysis bundle)
  - 12:00 ET mid-day (deltas only — what changed since open?)
  - 16:30 ET post-market (today's outcomes + tomorrow's setups)
- **Manual brief trigger** from dashboard CTA
- **LLM provider re-run** chip in brief detail page
- **Trade journal**:
  - Auto-create journal entry on signal acceptance (thesis snapshot)
  - Manual entry edit: outcome, lessons, screenshots, tags
  - Calendar heatmap of P/L per trading day
- **Watchlist alerts**: price level, IV change %, news keyword, breakout —
  served via BullMQ poll workers

### Verification
- Trigger morning brief manually → returns ≥1 valid `TradeSignal` per ticker
  (or explicit "no setup")
- Unit tests:
  - Risk engine rejects oversize positions
  - Risk engine respects blackout windows
  - Risk engine refuses entries after max-daily-loss
- Integration test: end-to-end brief generation against a recorded fixture
  bundle

---

## Phase 4 — Execution ⏳

**Goal:** stage and fire bracket orders to IBKR with hard server-side
guardrails and a kill switch.

### Will deliver
- **Full IbkrAdapter** at `packages/brokers/src/ibkr.ts`:
  - Connect to TWS / IB Gateway via `@stoqey/ib`
  - Get account summary + buying power + daily P/L
  - Place bracket: parent limit + OCO take-profit + stop-loss children
  - Cancel single, cancel all
  - Subscribe to position updates (SSE → UI)
- **Order staging UI** at `/orders`:
  - Queue of staged orders with: ticker, side, qty, entry, target, stop,
    max-loss-$, est fees, margin impact, R:R chip, confidence chip
  - Per-row Confirm + Edit + Cancel
  - Kill switch top-right (red, hold-to-confirm 2 s); optional flatten toggle
  - Today's risk header: "2/5 trades · -0.4% P/L · 0.6% DD vs 3% cap"
- **Server-side risk middleware** that re-checks every confirmed order
  against the risk engine **before** dispatch — UI cannot bypass
- **Live-account banner** + type-to-confirm modal when switching paper → live
- **Real-time positions panel** with live P/L
- **Order history** view — filterable by date / ticker / outcome

### Verification
- IB Gateway in **paper mode** running locally
- Stage an order from the brief → click Confirm → observe fill in TWS
- Kill switch cancels all open orders
- Max-daily-loss threshold blocks new entries (UI shows "Trading paused")
- Type-to-confirm modal prevents accidental live mode

---

## Phase 5 — Forecast & backtest ⏳

**Goal:** measure edge before risking it. Forecasts that say what the
historical evidence supports.

### Will deliver
- **Forecasts** at `apps/quant/forecast/`:
  - Prophet — next-week directional forecast with confidence bands
  - ARIMA + GARCH — short-term volatility forecast
  - Pattern recognition — common candlestick patterns + statistical edge
- **Backtest framework** at `apps/quant/backtest/`:
  - Built-in strategies: EMA crossover, RSI mean-reversion, Earnings PEAD,
    Gap-and-go, ATR breakout, opening range breakout
  - Walk-forward + Monte Carlo
  - vectorbt for vectorized speed
  - Output: equity curve, drawdown, win rate, profit factor, Sharpe / Sortino,
    expectancy, max DD, trade list
- **Replay / sandbox mode**:
  - Re-run any past day's signal pipeline with the data available at that
    moment
  - Compare engine output to actual trades and outcomes
  - Used to measure changes to the signal pipeline before deploying
- **Performance attribution**:
  - P/L by setup tag, by sector, by holding period
  - "Which catalysts paid?" — tag analysis
  - "Which LLM was most accurate?" — provider attribution

### Verification
- vectorbt MA-crossover backtest on AAPL 2020-2024 renders equity curve in UI
- Replay yesterday → compare signal output to journal entries
- Forecast page renders Prophet + GARCH for SPY without errors

---

## Beyond Phase 5 (someday, maybe)

- Multi-account support (joint accounts, separate margin / cash sub-accounts)
- Tax-aware exit suggestions (wash sale flags, LT vs ST holding period)
- Earnings transcript summarization at release
- Social / regulatory sentiment from 8-K filings auto-summarization
- Options strategy builder (calendars, butterflies, iron condors)
- Mobile-first responsive overhaul
- Self-hosted alternative front-end (htmx? Phoenix LiveView clone?)
