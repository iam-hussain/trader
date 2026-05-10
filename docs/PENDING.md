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

## Phase 3 (signal & risk) — in progress

Shipped (or in this commit batch):
- [x] **Signal engine** at `apps/api/src/services/signal-engine.ts` —
      bundle assembly + prompt + `completeStructured(TradeSignalArray)` +
      Zod re-validation + price-vs-quote sanity check + persistence
- [x] **Risk engine** at `apps/api/src/services/risk-engine.ts` —
      fixed-fractional sizing + confidence-weighted (capped) Kelly +
      max-trades/day + max-daily-loss + FOMC/CPI/NFP/PCE blackout
- [x] **Macro events** at `apps/api/src/services/macro-events.ts` —
      hardcoded calendar + `isInBlackout()` helper
- [x] **BullMQ jobs** under `apps/api/src/jobs/` — queue setup, brief
      worker, alert worker stub, recurring scheduler
- [x] **Scheduled briefs** at 08:00 / 12:00 / 16:30 ET via cron
- [x] **Manual brief trigger** through `POST /api/briefs/generate`
      with LLM provider override
- [x] **Brief job status polling** at `GET /api/briefs/jobs/:jobId`
- [x] **Journal routes + heatmap** at `/api/journal/*`
- [x] **Alerts CRUD** at `/api/alerts/*`
- [x] **Server-Sent Events** stream at `GET /api/sse/events`
- [x] **Web UI** — Briefs list + brief detail with `SignalCard`,
      Journal calendar heatmap + entries, Alerts CRUD,
      `RunBriefDialog` modal, `useUserEvents` SSE hook

Remaining for Phase 3+ (carry-over):
- [ ] **Real watchlist alert evaluator** (current worker is stub) — price
      level / IV change / news keyword / breakout
- [ ] **Sector + beta-basket concentration caps** in risk engine
- [ ] **Telegram + SMTP delivery** of alerts
- [ ] **Manual signal entry** (user types a setup, runs through risk engine)
- [ ] **Brief delta view** for mid-day session — diff vs pre-market
- [ ] **Macro calendar from a scraper** (Forex Factory / Investing.com)
      to replace the hardcoded fallback
- [ ] **Quarterly edge analysis** chart (P/L by setup tag)
- [ ] **Screenshot drop zone** in journal entries

## Phase 4 (execution) — in progress

Shipped (or in this commit batch):
- [x] **Full IbkrAdapter** in `packages/brokers/src/ibkr.ts` — @stoqey/ib
      connect/disconnect with auto-reconnect, OCA bracket placement,
      cancel single + cancel all, getPositions, getDailyPnl, EventEmitter
      for fill/status/position updates
- [x] **Broker singleton** in `packages/brokers/src/singleton.ts`
- [x] **Order service** at `apps/api/src/services/order-service.ts` —
      stage / confirm / cancel / cancel-all / flatten-all + signal→bracket
      mapping
- [x] **Risk middleware** at `apps/api/src/middleware/risk-middleware.ts` —
      runRiskCheck called on every confirm (UI can't bypass)
- [x] **Order events bus** at `apps/api/src/services/order-events.ts` —
      Redis pubsub of order.staged / .confirmed / .fill / .cancel /
      .reject / .update + positions.update
- [x] **Order routes** `/api/orders/{stage,:id/confirm,:id/cancel,
      cancel-all,flatten-all,:id/edit,history}`
- [x] **Positions routes** `/api/positions`, `/api/positions/pnl`,
      `/api/positions/broker/{status,connect,disconnect}`
- [x] **Positions publisher job** — 3s polling loop publishing changed
      positions to SSE channel
- [x] **Live mode switch route** at `POST /api/settings/broker/switch-mode`
      requiring `confirmText === "LIVE"` for paper→live
- [x] **Web UI** — orders page rebuilt with KillSwitch (top-right,
      hold-to-confirm 2s), Flatten (separate hold-to-confirm), StagedOrderRow
      (Confirm/Edit/Cancel + inline risk-rejection display), PositionsPanel
      (SSE-subscribed), RiskHeader, LiveBanner, LiveModeModal
- [x] **Order history page** at `/orders/history`
- [x] **SignalCard.Stage** wired through `apps/web/lib/orders.ts`

Remaining for Phase 4+:
- [ ] **Manual market-data subscription** for non-watchlist symbols
- [ ] **OCO update** on bracket leg edit (currently edit only allowed
      pre-broker-submission)
- [ ] **Margin requirement preview** in staging row (uses IBKR
      `whatIf` order request)
- [ ] **Partial-fill handling** edge cases — current row shows partial
      but doesn't allow extending TIF or flattening just the unfilled
      portion
- [ ] **Multi-account** support (current P4 assumes one user/account)
- [ ] **Real-time fill toasts** (currently SSE updates list; toast
      on the dashboard would be nice)

## Phase 5 (forecast & backtest) — in progress

Shipped (or in this commit batch):
- [x] **Forecast modules** at `apps/quant/forecast/`:
      Prophet (`prophet_model.py`), ARIMA+GARCH vol (`arima_garch.py`),
      candlestick patterns with 5-year edge stats (`patterns.py`),
      shared `common.py` with lazy-import + JSON-safe casting,
      FastAPI APIRouter (`router.py`)
- [x] **Backtest framework** at `apps/quant/backtest/`:
      pure-pandas `engine.run_backtest`, intra-bar stop/target evaluation,
      6 strategies (ema_crossover, rsi_mean_reversion, earnings_pead,
      gap_and_go, atr_breakout, opening_range), `monte_carlo.py`
      bootstrap, `walk_forward.py` harness, FastAPI APIRouter
- [x] **TS BullMQ workers**: `backtest-worker.ts`, `replay-worker.ts`
- [x] **API routes**: `/api/forecast/*`, `/api/backtest/*`,
      `/api/replay/*`, `/api/attribution/{by-tag,by-sector,by-hold-period,
      by-llm}`
- [x] **Prisma models**: BacktestRun, Replay
- [x] **Web UI**: forecast/[symbol], backtest list + [id] detail with
      EquityCurveChart + DrawdownChart + KPI grid + trade list +
      Monte Carlo, replay with diff view, attribution dashboard with
      4 tabs
- [x] **Inline SVG charts**: EquityCurveChart, DrawdownChart, ForecastChart
      (zero new chart deps)
- [x] **Sidebar**: Replay (g r) + Attribution (g p) entries

Remaining for Phase 5+ (carry-over):
- [ ] **vectorbt** integration for vectorized backtests (current is
      pure pandas, slower but dependency-free)
- [ ] **Snapshot the analysis bundle** at brief generation so replay can
      re-run the engine against historical data (current replay re-runs
      against current data)
- [ ] **Walk-forward parameter optimization** (current harness leaves
      hooks but doesn't optimize)
- [ ] **More strategies**: opening range with intraday data,
      momentum with relative strength, volatility expansion
- [ ] **Backtest result comparison view** (overlay multiple equity curves)

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
