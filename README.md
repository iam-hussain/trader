# Trader Daily

Personal daily trading helper for **US equities & options**. Runs locally via Docker Compose.
Pulls free market + news + options data, runs analysis, asks an LLM
(Claude / GPT / Gemini / local Ollama — switchable) to produce structured trade
ideas with entry/target/stop/qty/risk, stages bracket orders to **Interactive
Brokers**, and lets you fire them with one-click confirm.

> Status: **Phase 1 — Foundation.** Auth, watchlists, settings, ticker detail,
> LLM provider switcher, Python quant service with quote / news / options
> endpoints. Phase 2+ adds analysis, signal engine, broker execution,
> forecasting, backtest. See [the plan](./PLAN.md) for the full roadmap.

## Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **Web**: Next.js 15 + Tailwind + lucide-react (dark, dense, mono numerics)
- **API**: Fastify + Prisma (MongoDB) + Auth.js-compatible JWT cookies
- **Quant**: Python 3.11 + FastAPI + yfinance + pandas (DuckDB / Parquet for time-series)
- **Cache / queue**: Redis + BullMQ
- **LLM**: Vercel AI SDK (Anthropic / OpenAI / Google / Ollama)
- **Broker**: Interactive Brokers via `@stoqey/ib` (Phase 4)

## Repo layout

```
apps/
  web/    Next.js (port 3000)
  api/    Fastify (port 4000)
  quant/  FastAPI (port 8000)
packages/
  db/         Prisma + Mongo schema
  schemas/    Zod (TradeSignal, RiskLimits, Brief, market types)
  llm/        provider abstraction
  brokers/    BrokerAdapter + IbkrAdapter (stub in P1)
  config/     tsconfig + eslint presets
  ui/         shared UI (extracted in P2)
data/parquet/  OHLCV cache (created on first run)
```

## Quick start

### Prereqs
- Docker + Docker Compose v2
- Node 20+, pnpm 9+ (only needed if running outside Docker)
- Python 3.11+ (only needed if running quant service outside Docker)

### Boot
```bash
cp .env.example .env
# edit .env — at minimum set NEXTAUTH_SECRET to a random 32+ char string
docker compose up -d
# generate Prisma client (first time only)
docker compose exec api pnpm --filter @trader/db prisma:generate
docker compose exec api pnpm --filter @trader/db prisma:push
```

Then open <http://localhost:3000>, register an account, add a watchlist.

### Ports
| Service | Port |
| --- | --- |
| web    | 3000 |
| api    | 4000 |
| quant  | 8000 |
| mongo  | 27017 |
| redis  | 6379 |
| ollama | 11434 (only with `--profile ollama`) |

### Local LLM (optional)
```bash
docker compose --profile ollama up -d
docker compose exec ollama ollama pull llama3.1:8b
```

## What's required from you

### Credentials (all optional in P1, fill what you have via Settings page)
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY` — LLMs
- `FRED_API_KEY` — yields, CPI macro data (free)
- `NEWSAPI_KEY` — supplemental news (free tier)
- `SEC_EDGAR_USER_AGENT` — required by SEC: `"Your Name your-email@domain.com"`
- IBKR Gateway running locally on port 7497 (paper) or 7496 (live) — Phase 4

### Trading preferences (Settings page)
- Account size, max risk per trade %, max daily loss %, max trades per day
- IBKR mode (paper / live), gateway host + port
- Default LLM provider

## Free data sources (Phase 1 + 2)

**Quotes / OHLCV / Fundamentals**: Yahoo Finance (yfinance) · Stooq · Alpha Vantage · Finnhub · IBKR live data (P4)

**News**: Yahoo · Finviz · Reuters/MarketWatch/Seeking Alpha/Benzinga RSS · Google News RSS · SEC EDGAR · NewsAPI

**Put/Call & Options Flow** (reconciled across multiple sources):
- CBOE — total + equity-only P/C ratio (official, daily CSV)
- Yahoo Finance — per-ticker P/C from raw OI & volume
- NASDAQ.com — per-ticker chains, IV, P/C
- Barchart — per-ticker P/C, IV rank, max pain
- OptionCharts.io — max pain, P/C, IV rank, GEX, skew
- MarketChameleon — unusual options & P/C
- OpenInsider — insider buys/sells
- OpenBB Platform — open-source aggregator
- CBOE VIX term structure & SKEW index

**Macro / Calendar**: FRED · US Treasury · Investing.com / Earnings Whispers / Forex Factory · CNN Fear & Greed

**Insider / Institutional**: SEC EDGAR Form 4 · OpenInsider · WhaleWisdom 13F

## TradingView

Essential plan exposes no API and no webhook alerts (webhooks need Pro+). The
ticker detail page uses the **free TradingView Advanced Chart embed widget** —
no subscription required. A `/api/webhooks/tradingview` endpoint is pre-wired
so a future Pro+ upgrade routes alerts into the signal engine without code
changes.

## Phase roadmap

| Phase | Focus |
| --- | --- |
| 1 — Foundation | Monorepo, docker, auth, watchlists, settings, ticker detail, LLM provider switcher, quant service skeleton |
| 2 — Analysis engine | Scrapers (CBOE / NASDAQ / Barchart / OptionCharts / SEC / OpenInsider), technicals, options analytics, news sentiment |
| 3 — Signal & risk | LLM signal engine (Zod-enforced), risk engine (sizing / caps / blackouts), three scheduled briefs, journal |
| 4 — Execution | IBKR TWS adapter, bracket order staging, one-click confirm, kill switch, server-side risk middleware |
| 5 — Forecast & backtest | Prophet + ARIMA + GARCH, vectorbt, replay/sandbox mode, edge analysis |

## Verification (Phase 1)

- `docker compose up` brings everything healthy
- `curl http://localhost:4000/healthz` → `{"ok":true,"service":"api"}`
- `curl http://localhost:8000/healthz` → `{"ok":true,"service":"quant"}`
- Open <http://localhost:3000>, register, log in
- Add a watchlist, add a ticker (e.g. AAPL); persists in Mongo
- Open `/ticker/AAPL` — see live price + TradingView chart
- Settings → paste an LLM key → click Validate → expect green
