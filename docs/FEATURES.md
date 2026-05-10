# Features

Status legend: ✅ shipped · 🟡 partial / Phase 2 in progress · ⏳ planned

## Identity & access

| Feature | Status | Notes |
| --- | --- | --- |
| Email + password registration | ✅ | argon2 hash, single-user app |
| HTTP-only cookie JWT auth | ✅ | 30-day expiry, sameSite=lax |
| Logout | ✅ | clears cookie |
| Password reset | ⏳ | low priority, single-user app |

## Watchlists

| Feature | Status | Notes |
| --- | --- | --- |
| Multiple named watchlists | ✅ | per-user; unique by name |
| Add / remove tickers | ✅ | symbol regex validated |
| Drag-to-reorder | ⏳ | Phase 2/3 UI polish |
| Per-ticker alerts CRUD (price / IV / news / breakout) | 🟡 | Phase 3 — alerts page + worker stub |
| Watchlist alert evaluator (real triggers + push delivery) | ⏳ | Phase 3+ |

## Ticker detail page (`/ticker/:symbol`)

| Feature | Status | Notes |
| --- | --- | --- |
| Live quote header (refresh 30 s) | ✅ | yfinance via quant `/quote` |
| TradingView Advanced Chart embed | ✅ | free widget, no subscription |
| Tabbed layout (Overview / Chart / Options / News / Filings / Analysis) | 🟡 | Phase 2 — wired this iteration |
| KPI grid (P/E, EPS, IV Rank, RSI, ATR, 52w range, short %, beta) | 🟡 | depends on `/api/analysis` bundle |
| Technical summary (RSI / MACD / BB / EMAs / ATR / trend / signals) | 🟡 | quant bundle ready, UI in P2 |
| Options chain table | ⏳ | Phase 2 polish |
| Put/Call ratio gauge with multi-source attribution | 🟡 | reconciler ready, UI gauge in P2 |
| Max pain marker | 🟡 | calc ready, surface in UI in P2 |
| IV surface heatmap | ⏳ | Phase 2 stretch |
| Unusual options activity feed | 🟡 | detector ready, UI in P2 |
| News feed with sentiment per article | 🟡 | scrapers + FinBERT/lexicon ready, UI in P2 |
| Sentiment summary at top of news tab | 🟡 | aggregator ready |
| SEC filings list | 🟡 | scraper ready |
| Insider Form 4 transactions | 🟡 | scraper ready |
| LLM-generated thesis/analysis tab | ⏳ | Phase 3 |

## Briefs (morning / mid-day / postmarket)

| Feature | Status | Notes |
| --- | --- | --- |
| Brief CRUD endpoints | ✅ | `/api/briefs` |
| Manual "Run Morning Brief" CTA | 🟡 | Phase 3 — wired via /generate + RunBriefDialog |
| Scheduled briefs at 08:00 / 12:00 / 16:30 ET | 🟡 | Phase 3 — BullMQ cron jobs |
| Per-ticker signal cards | 🟡 | Phase 3 — SignalCard component |
| Macro context strip (VIX, SPY, QQQ, yields, regime) | ✅ | renders on dashboard + brief detail |
| Earnings + econ calendar sidebar | ⏳ | Phase 3+ |
| Re-run brief with different LLM | 🟡 | Phase 3 — provider override on /generate |

## Trade signal & risk engine (Phase 3)

| Feature | Status | Notes |
| --- | --- | --- |
| `TradeSignal` Zod schema (entry/target/stop/qty/R:R/confidence/thesis/etc) | ✅ | with directional consistency checks |
| LLM `completeStructured` with TradeSignal schema | ✅ | provider-agnostic |
| Signal engine orchestration (assemble bundle, prompt LLM, validate) | 🟡 | Phase 3 in progress |
| Risk engine — fixed-fractional sizing | 🟡 | Phase 3 in progress |
| Risk engine — capped Kelly variant (confidence-weighted) | 🟡 | Phase 3 in progress |
| Risk engine — max-trades-per-day cap | 🟡 | Phase 3 in progress |
| Risk engine — max-daily-loss cap | 🟡 | Phase 3 in progress |
| Risk engine — FOMC/CPI/NFP/PCE blackout windows | 🟡 | Phase 3 in progress |
| BullMQ scheduled briefs (08:00 / 12:00 / 16:30 ET) | 🟡 | Phase 3 in progress |
| Manual brief trigger via /generate endpoint | 🟡 | Phase 3 in progress |
| Server-Sent Events stream (briefs / orders / alerts) | 🟡 | Phase 3 in progress |
| Risk engine — sector / beta concentration limits | ⏳ | Phase 3+ |
| Server-side risk middleware (rejects orders regardless of UI) | ⏳ | Phase 4 |
| Manual signal entry (user types a setup) | ⏳ | Phase 3 stretch |

## Order execution (Phase 4)

| Feature | Status | Notes |
| --- | --- | --- |
| BrokerAdapter interface | ✅ | placeBracket, cancelOrder, cancelAll, getPositions, getDailyPnl |
| IbkrAdapter (TWS API via @stoqey/ib) | 🟡 | full impl landing this commit (OCA bracket, auto-reconnect, EventEmitter for fills) |
| Order staging UI with full risk profile | 🟡 | P4 — StagedOrderRow + RiskHeader |
| One-click confirm → fires bracket order | 🟡 | P4 — POST /api/orders/:id/confirm |
| Server-side risk middleware re-checks every order | 🟡 | P4 — runRiskCheck before broker dispatch |
| Live positions panel with real-time P&L | 🟡 | P4 — SSE positions.update + 3s polling |
| Kill switch (hold-to-confirm 2 s) | 🟡 | P4 — KillSwitch component |
| Optional flatten-positions on kill | 🟡 | P4 — POST /api/orders/flatten-all |
| Live-account red banner + type-to-confirm modal | 🟡 | P4 — LiveBanner + LiveModeModal |
| Order history with broker IDs | 🟡 | P4 — /orders/history page |

## Journal

| Feature | Status | Notes |
| --- | --- | --- |
| Per-trade journal entry (thesis snapshot, lessons, tags) | 🟡 | Phase 3 — auto-snapshot on signal accept, manual edit |
| Calendar heatmap of trading days (P/L) | 🟡 | Phase 3 — `/api/journal/heatmap` + CalendarHeatmap component |
| Screenshot drop zone | ⏳ | Phase 3+ |
| Tag filters | 🟡 | Phase 3 — query params on /api/journal |
| Quarterly edge analysis (P/L by setup tag) | ⏳ | Phase 3+ |

## Forecast & backtest (Phase 5)

| Feature | Status | Notes |
| --- | --- | --- |
| Prophet next-week direction | ⏳ | Phase 5 |
| ARIMA + GARCH volatility forecast | ⏳ | Phase 5 |
| Pattern recognition (candlestick patterns) | ⏳ | Phase 5 |
| vectorbt backtest framework | ⏳ | Phase 5 |
| Built-in strategies (EMA crossover, RSI mean-reversion, PEAD, gap-and-go) | ⏳ | Phase 5 |
| Walk-forward + Monte Carlo | ⏳ | Phase 5 |
| Replay / sandbox mode | ⏳ | Phase 5 |
| Performance attribution | ⏳ | Phase 5 |

## Macro & calendar

| Feature | Status | Notes |
| --- | --- | --- |
| VIX latest from CBOE | 🟡 | scraper ready |
| Total + equity put/call ratio (CBOE) | 🟡 | scraper ready |
| Market regime detector (VIX + SPY 200-EMA + breadth) | ⏳ | Phase 2/3 |
| Sector heatmap | ⏳ | Phase 2/3 |
| Watchlist correlation matrix | ⏳ | Phase 3 |
| FOMC / CPI / PCE / NFP calendar | ⏳ | Phase 3 |
| Earnings calendar | ⏳ | Phase 3 |
| FRED yield curve / DGS3MO risk-free | 🟡 | scraper ready (used for Greeks) |
| CNN Fear & Greed | ⏳ | Phase 3 |

## Scanners (Phase 3)

| Feature | Status | Notes |
| --- | --- | --- |
| Earnings PEAD scanner | ⏳ | |
| Gap scanner | ⏳ | |
| Unusual options sweep detector | 🟡 | detector ready |
| 52w high / low scanner | ⏳ | |

## Notifications

| Feature | Status | Notes |
| --- | --- | --- |
| Web inline alerts (toast / banner) | ⏳ | Phase 3 |
| Telegram bot push | ⏳ | Phase 3 |
| Email (SMTP) | ⏳ | Phase 3 |
| Channel toggles (signals / fills / alerts / errors) | ⏳ | Phase 3 |

## Settings

| Feature | Status | Notes |
| --- | --- | --- |
| Risk limits (account size, max risk/trade, max daily loss, max trades/day) | ✅ | persisted in Mongo |
| LLM provider switcher (Claude / GPT / Gemini / Ollama) | ✅ | with key validation |
| API key management (encrypted at rest, env fallback) | ✅ | AES-256-GCM, lastFour hint |
| IBKR Gateway host/port + paper/live toggle | ✅ | live UI uses red banner (P4) |
| Theme (dark default, light option) | ✅ | dark only in v1 |
| Default LLM model + per-feature override | ⏳ | Phase 3 |
| Notification channel toggles | ⏳ | Phase 3 |
| Blackout configuration (FOMC ± min) | ✅ | settings stored, enforced in P3 |

## Integrations

| Integration | Status | Notes |
| --- | --- | --- |
| Anthropic Claude | ✅ | structured output via Vercel AI SDK |
| OpenAI GPT | ✅ | structured output |
| Google Gemini | ✅ | structured output |
| Local Ollama | ✅ | profile-gated docker service |
| Yahoo Finance (yfinance) | ✅ | quotes, news, options chain |
| Finviz | ✅ | snapshot + news |
| CBOE | ✅ | VIX + total/equity P/C |
| NASDAQ.com | ✅ | per-ticker option chains |
| Barchart | ✅ | per-ticker P/C, IV rank, max pain |
| OptionCharts.io | ✅ | max pain, P/C, IV rank, GEX |
| MarketChameleon | ✅ | overview + unusual flow |
| OpenInsider | ✅ | insider transactions |
| SEC EDGAR | ✅ | filings + Form 4 metadata |
| FRED | ✅ | macro series + risk-free rate |
| Google News RSS | ✅ | per-ticker news |
| Benzinga RSS | ✅ | filtered news feed |
| Interactive Brokers (TWS) | 🟡 | adapter stub; full P4 |
| TradingView Advanced Chart embed | ✅ | free widget |
| TradingView webhook receiver | 🟡 | endpoint pre-wired; Pro+ user only |
| Telegram bot | ⏳ | Phase 3 |
| SMTP email | ⏳ | Phase 3 |

## Admin / dev

| Feature | Status | Notes |
| --- | --- | --- |
| Health endpoints on api + quant | ✅ | `/healthz` |
| Docker Compose (mongo / redis / api / web / quant) | ✅ | mongo runs as single-node RS |
| Opt-in Ollama profile | ✅ | `--profile ollama` |
| Prisma generate / push scripts | ✅ | from monorepo root |
| Encrypted API key storage | ✅ | AES-256-GCM, key derived from NEXTAUTH_SECRET |
| BullMQ scheduled jobs | ⏳ | Phase 3 |
| Prometheus metrics | ⏳ | nice-to-have |
| Bull Board for queue ops | ⏳ | Phase 3 |

## Out of scope (won't build)

- Crypto / FX / futures
- Multi-tenant / SaaS
- Mobile native app
- Auto-execution without confirmation
- Pine indicator porting
- Public dashboard / social features
