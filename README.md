# Trader Daily

A personal **daily trading helper** for US equities & options. Runs locally
via Docker Compose. Pulls free market + news + options data, runs analysis,
asks an LLM (Claude / GPT / Gemini / local Ollama — switchable) to produce
structured trade ideas, stages bracket orders to **Interactive Brokers**, and
lets you fire them with one-click confirm.

> **Status: Phase 2 — Analysis engine.** Phase 1 (foundation) shipped. Phase 2
> wires scrapers, options analytics, technical indicators, and news sentiment.
> Phase 3 brings the LLM signal engine + risk engine. Phase 4 brings IBKR
> execution. See [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Documentation

The repo doubles as the living spec. Start here:

| Doc                                            | What                                                      |
| ---------------------------------------------- | --------------------------------------------------------- |
| [`docs/IDEOLOGY.md`](docs/IDEOLOGY.md)         | Why this exists. Principles. What we won't do.            |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System diagram, services, data flow.                      |
| [`docs/FEATURES.md`](docs/FEATURES.md)         | Full feature catalog — shipped / in-progress / planned.   |
| [`docs/ROADMAP.md`](docs/ROADMAP.md)           | Phases 1-5, deliverables, verification.                   |
| [`docs/PROCESS.md`](docs/PROCESS.md)           | How this is being built (plan mode, agents, conventions). |
| [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) | Every external source, free/paid, usage limits.           |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md)     | Run, troubleshoot, common chores.                         |
| [`docs/SECURITY.md`](docs/SECURITY.md)         | Threat model, key handling, broker safety.                |
| [`docs/PENDING.md`](docs/PENDING.md)           | Concrete TODOs by phase.                                  |
| [`docs/GLOSSARY.md`](docs/GLOSSARY.md)         | Trading + project jargon.                                 |
| [`docs/design/`](docs/design/)                 | Static HTML design canvas — UI source of truth.           |

## Stack

- **Monorepo** — pnpm workspaces + Turborepo
- **Web** — Next.js 15 + Tailwind + Geist + lucide-react
- **API** — Fastify 5 + Prisma (Mongo) + cookie-JWT auth
- **Quant** — Python 3.11 + FastAPI + yfinance + pandas + scipy
- **DB** — Mongo (state) + DuckDB/Parquet (OHLCV)
- **Cache / queue** — Redis + BullMQ
- **LLM** — Vercel AI SDK across Anthropic / OpenAI / Google / Ollama
- **Broker** — Interactive Brokers via `@stoqey/ib` (Phase 4)

## Repo layout

```
apps/
  web/    Next.js  (port 3000)
  api/    Fastify  (port 4000)
  quant/  FastAPI  (port 8000)
packages/
  db/         Prisma + Mongo schema
  schemas/    Zod (TradeSignal, Brief, RiskLimits, market)
  llm/        provider abstraction
  brokers/    BrokerAdapter + IbkrAdapter (P4)
  config/     tsconfig + eslint presets
  ui/         shared UI (extracted in P2+)
data/parquet/  OHLCV cache
docs/          ← read these
docs/design/   ← static HTML mocks
```

## Quick start

```bash
cp .env.example .env
# Set NEXTAUTH_SECRET to a random 32+ char string. Other keys can be added
# later via the Settings page (encrypted in Mongo).

docker compose down
docker compose build --no-cache web api quant
docker compose up -d
docker compose exec api pnpm --filter @trader/db prisma:generate
docker compose exec api pnpm --filter @trader/db prisma:push

# Open http://localhost:3000, register an account, add a watchlist,
# open /ticker/AAPL, see live quote + TradingView chart.
```

> The repo ships a `.dockerignore` that excludes `node_modules` and other
> build artifacts from the build context. This is required: pnpm uses
> symlinks inside the image, and a host-installed `node_modules/` will
> collide with them and fail the build with `cannot copy to non-directory`.
> See [`docs/OPERATIONS.md`](docs/OPERATIONS.md#cannot-copy-to-non-directory-appnode_modulespkg-during-build)
> if you hit it.

If anything in `docker-compose.yml`, a `Dockerfile`, `.dockerignore`, the
lockfiles, or `pyproject.toml` changes, use the clean rebuild sequence
instead — cached BuildKit layers can otherwise hide real errors:

```bash
docker compose down
docker compose build --no-cache web api quant
docker compose up -d
docker compose exec api pnpm --filter @trader/db prisma:generate
docker compose exec api pnpm --filter @trader/db prisma:push
```

For more, see [`docs/OPERATIONS.md`](docs/OPERATIONS.md).

## Free data sources (this is the whole point)

Reconciled across multiple free sources where possible:

- **Quotes / fundamentals** — Yahoo Finance, Finviz, IBKR (Phase 4)
- **News** — Yahoo, Finviz, Benzinga RSS, Google News, Reuters/MarketWatch RSS
- **Put/call & options flow** — CBOE (market-wide), Yahoo (per-ticker),
  NASDAQ.com, Barchart, OptionCharts.io, MarketChameleon — reconciled by
  median across sources, with a disagreement flag
- **Insider** — SEC EDGAR Form 4, OpenInsider
- **Filings** — SEC EDGAR
- **Macro** — FRED, US Treasury, CBOE VIX, Investing.com / Earnings
  Whispers / Forex Factory calendars

See [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) for usage limits + how each
is wired in.

## TradingView

Essential plan offers no programmatic value (no API, no webhooks below Pro+).
We use the **free Advanced Chart embed widget** on the stock detail page and
pre-wire `POST /api/webhooks/tradingview` for a future Pro+ upgrade.

## What you need from yourself

Everything optional except IBKR if you want execution. Set in Settings page:

- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_API_KEY` — LLMs
- `FRED_API_KEY` — yields, used by Greeks
- `NEWSAPI_KEY` — supplemental news
- `SEC_EDGAR_USER_AGENT` — `"Your Name your-email@domain.com"`
- IBKR Gateway running locally on 7497 (paper) / 7496 (live), Phase 4
- Telegram bot + SMTP for notifications, Phase 3
- Account size + risk limits — see Settings → Risk

## Verification (Phase 1 + 2)

```bash
curl localhost:4000/healthz
curl localhost:8000/healthz
# After login (cookie):
curl -b "trader_token=$TOKEN" localhost:4000/api/analysis/AAPL | jq .
```

The `/api/analysis/AAPL` response includes price, fundamentals, technicals
(RSI/MACD/BB/EMAs/ATR/trend/signals), options snapshot with reconciled P/C
across multiple sources, news with sentiment, insider trades, and filings.

## License

Personal use. No redistribution implied.
