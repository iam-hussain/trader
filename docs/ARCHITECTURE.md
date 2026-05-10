# Architecture

## High-level diagram

```
                            ┌──────────────────┐
                            │  Browser (Next)  │
                            │   localhost:3000 │
                            └────────┬─────────┘
                                     │  cookie-JWT
                                     ▼
              ┌──────────────────────────────────────┐
              │  apps/api  (Fastify, TypeScript)     │
              │  localhost:4000                      │
              │  - auth, watchlist, settings         │
              │  - signal & risk engine (Phase 3)    │
              │  - broker adapter (Phase 4)          │
              └──────┬──────────┬──────────┬─────────┘
                     │          │          │
                     ▼          ▼          ▼
              ┌──────────┐ ┌─────────┐ ┌──────────────┐
              │  Mongo   │ │  Redis  │ │  apps/quant  │
              │  state   │ │ queue / │ │  (FastAPI,   │
              │ (Prisma) │ │ pubsub  │ │   Python)    │
              └──────────┘ └─────────┘ │  scrapers,   │
                                       │  options,    │
                                       │  technicals, │
                                       │  sentiment   │
                                       │  :8000       │
                                       └──────┬───────┘
                                              │
                                              ▼
                                     ┌─────────────────┐
                                     │ DuckDB+Parquet  │
                                     │  ./data/parquet │
                                     │  (OHLCV cache)  │
                                     └─────────────────┘

                                     ┌─────────────────┐
                                     │  IB Gateway     │
                                     │  TWS desktop    │
                                     │  :7497 (paper)  │  ← Phase 4
                                     │  :7496 (live)   │
                                     └─────────────────┘

                                     ┌─────────────────┐
                                     │  Ollama (opt)   │
                                     │  :11434         │
                                     └─────────────────┘
```

## Services

### apps/web — Next.js 15 (port 3000)
App Router. Tailwind. Dark, dense, mono numerics. SWR for data fetching with
30 s refresh on quotes. Pages live under `app/(app)/` (authenticated layout)
and `app/login/` (public). Shared components in `components/`. The browser
talks to `apps/api` directly (CORS allowed from same-host); cookies carry the
JWT.

### apps/api — Fastify 5 (port 4000)
TypeScript with `tsx watch` in dev. Endpoints under `/auth/*`, `/api/*`. Uses
`@fastify/jwt` with `httpOnly` cookies; auth lives in `plugins/auth.ts`.
Routes in `src/routes/`. Services (broker, quant client, crypto) in
`src/services/`. The API is thin — heavy compute is delegated to the quant
service; persistence goes through `@trader/db` (Prisma).

### apps/quant — FastAPI / Python 3.11 (port 8000)
The compute layer. Three sub-areas:
- `scrapers/` — one file per data source. All return JSON-serializable dicts.
  All use `common.py`'s shared httpx client with per-host rate limiting and
  Tenacity retry.
- `options/` — pure analytics: greeks, IV rank, P/C reconciler, max pain,
  unusual activity. No I/O.
- `indicators/` — `technicals.py` builds a bundle (RSI, MACD, BB, EMAs, ATR,
  VWAP, S/R, trend, signals).
- `sentiment/` — FinBERT (lazy load) + lexicon fallback + article aggregator.
- `forecast/`, `backtest/` — stubs for Phase 5.

### Mongo (port 27017)
Single-node replica set (Prisma requires a replica set for transactions).
Stores app state — User, Watchlist, Signal, Trade, JournalEntry, Setting,
ApiKey, Brief, Alert. Encrypted secrets sit in ApiKey rows; envelope
encryption uses `NEXTAUTH_SECRET`-derived AES-256-GCM in
`apps/api/src/services/crypto.ts`.

### Redis (port 6379)
BullMQ job queue + ephemeral pub/sub. Briefs are scheduled jobs. SSE updates
flow over Redis pub/sub channels.

### DuckDB + Parquet (./data/parquet)
Time-series OHLCV cache. Parquet files partitioned by ticker/year. DuckDB
reads them with zero-copy columnar scans for backtests and replay mode. We
do NOT put OHLCV in Mongo — it's the wrong shape and expensive there.

### Ollama (port 11434, opt-in)
Brought up via `--profile ollama`. Pull models with
`docker compose exec ollama ollama pull llama3.1:8b`. Used as a fallback or
offline-mode LLM provider.

### IB Gateway / TWS (Phase 4)
Runs on the user's desktop, not in a container (Interactive Brokers requires
the GUI). The API connects to it on port 7497 (paper) or 7496 (live).

## Data flow — morning brief (Phase 3 target)

1. BullMQ job at 08:00 ET enqueues `generate_brief(session=premarket)`.
2. API worker fetches the user's watchlist + risk limits + LLM choice.
3. For each ticker, it calls quant `/analysis/{symbol}` which returns a bundle:
   - quote + fundamentals (yahoo / finviz)
   - technicals bundle
   - options snapshot with reconciled P/C, IV rank, max pain, unusual
     activity (yahoo + cboe + nasdaq + barchart + optioncharts)
   - news with FinBERT/lexicon sentiment
   - insider transactions (openinsider) + filings (sec_edgar)
4. Worker also fetches macro context (VIX, regime, Fear & Greed,
   FOMC/CPI/NFP calendar).
5. Worker assembles the prompt with all bundles + risk limits + house style
   guidance. Calls `completeStructured` with `TradeSignalArray` schema.
6. Each returned signal is re-validated; failures rejected with explanation.
7. Risk engine applies sizing (ATR-based stop, fixed-fractional, capped
   Kelly), checks blackout windows, enforces max-trades and max-loss caps.
8. Brief is saved to Mongo. UI receives an SSE push and renders the cards.

## Data flow — order staging (Phase 4 target)

1. User clicks "Stage Order" on a Brief signal card.
2. API creates a `Trade` row with status `staged`, copies signal fields.
3. UI fetches `/api/orders` and shows the staged row with confirm button.
4. User clicks Confirm.
5. API risk middleware re-checks (account size hasn't changed; daily loss not
   exceeded; max-trades-per-day not exceeded; symbol not in blackout).
6. If green, IbkrAdapter places a bracket order: parent limit, OCO take-profit
   + stop-loss children. Returns `brokerOrderId`.
7. UI updates with broker status; SSE push when filled/cancelled/rejected.
8. Trade row updated with fill price, fees, P&L on close.

## Repository layout

```
trader/
├── apps/
│   ├── web/                 Next.js
│   ├── api/                 Fastify
│   └── quant/               FastAPI
│       ├── main.py
│       ├── scrapers/        yahoo, finviz, cboe, nasdaq, barchart,
│       │                    optioncharts, marketchameleon, sec_edgar,
│       │                    openinsider, fred, benzinga, googlenews
│       ├── indicators/      technicals (RSI/MACD/BB/EMA/VWAP/ATR/S+R)
│       ├── options/         greeks, iv_rank, put_call_ratio,
│       │                    unusual_activity, max_pain
│       ├── sentiment/       finbert, lexicon, aggregate
│       ├── forecast/        (Phase 5)
│       └── backtest/        (Phase 5)
├── packages/
│   ├── db/                  Prisma + Mongo schema
│   ├── schemas/             Zod (TradeSignal, Brief, RiskLimits, market)
│   ├── llm/                 Provider abstraction + structured output
│   ├── brokers/             BrokerAdapter, IbkrAdapter (P4)
│   ├── ui/                  Shared components (extracted in P2+)
│   └── config/              tsconfig + eslint presets
├── data/parquet/            OHLCV cache (created at runtime)
├── docs/                    This documentation
├── docker-compose.yml
├── .env.example
└── README.md
```

## Why these choices

- **Mongo over Postgres** — flexible JSON for `Signal.signals[]`, `Brief.context`,
  `Alert.rule` without migrations. We aren't doing complex relational queries.
- **DuckDB+Parquet over TimescaleDB** — local, embedded, zero-ops, columnar,
  perfect for vectorbt backtests. No second database server to run.
- **Fastify over Express** — Faster, schema-first, better ergonomics. Good
  ecosystem (`@fastify/jwt`, `@fastify/sensible`).
- **Python for quant** — the data-science library ecosystem is unmatched
  (yfinance, pandas-ta, vectorbt, prophet, transformers). Trying to do this
  in pure Node would burn weeks reinventing wheels.
- **TypeScript for everything else** — shared types between web and api.
  Zod validates LLM outputs, request bodies, and env vars.
- **Vercel AI SDK** — provider-agnostic interface with first-class structured
  output across Anthropic / OpenAI / Google / Ollama. Switching providers is
  one-line.
- **BullMQ over a custom scheduler** — Redis-backed, durable, retries,
  observable in Bull Board (added in P3).
- **No cloud SaaS** — see [IDEOLOGY.md](./IDEOLOGY.md). Local-first.

## Coupling rules

- `apps/api` may depend on `packages/{db,schemas,llm,brokers}`
- `apps/web` may depend on `packages/{schemas,ui}` only
- `apps/quant` (Python) depends on nothing in the JS workspace
- `packages/*` may depend on each other only as listed in their package.json
- No circular deps. No reaching across `apps/*` boundaries.
