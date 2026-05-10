# Security

This is a single-user, local-only app. The threat model and guardrails reflect
that — but trading apps still demand discipline because mistakes cost real
money.

## Threat model

### In scope
- **Local credentials**: API keys (LLMs, FRED, NewsAPI, Telegram), broker
  config. These must not be readable in plain text on disk if the laptop is
  lost.
- **Order safety**: an attacker (or a confused script) must not be able to
  fire arbitrary orders to IBKR.
- **LLM hallucinations**: the model must not be able to silently dispatch a
  bad order.
- **Data scraping ethics**: respect rate limits, identify the bot, don't
  hammer free sources.

### Out of scope
- Multi-user attack surface (no other users)
- Network-level attacks against the user's laptop (host OS responsibility)
- Compromise of the user's broker password (lives in IB Gateway, not in app)

## Key handling

- `.env` is git-ignored. Only `.env.example` is committed.
- `NEXTAUTH_SECRET` is the master secret. It signs session JWTs and derives
  the AES-256-GCM KEK that encrypts API keys in Mongo.
- API keys submitted via the Settings page are encrypted before write
  (`apps/api/src/services/crypto.ts`). The IV is stored alongside the
  ciphertext; the auth tag is appended.
- Passwords are hashed with **argon2id** (default parameters).
- Cookies: `httpOnly`, `sameSite=lax`, 30-day max age. Set `Secure` in
  production (when behind HTTPS).
- Broker password: **never stored in app**. IB Gateway desktop handles broker
  auth; the app only knows the gateway port.

## Order safety

### Hard guardrails (server-side, cannot be bypassed by UI)
- **Risk-engine middleware** runs on every order Confirm before the broker
  call. If the order would exceed:
  - max risk per trade
  - max daily loss
  - max trades per day
  - sector concentration
  - blackout window
  …it is rejected with a structured error, no broker call made.
- **Live mode requires type-to-confirm**. Switching the IBKR mode toggle
  from `paper` to `live` opens a modal that requires the user to type the
  word `LIVE`.
- **Live red banner** persists across the entire app while in live mode.
- **Kill switch** uses 2 s hold-to-confirm to prevent accidental triggers.
  When held it calls `BrokerAdapter.cancelAll()` and (optionally)
  `flattenAll()`.

### LLM output validation
- Every `TradeSignal` returned by the LLM is parsed by the Zod schema in
  `packages/schemas/src/trade.ts`. Schema enforces:
  - directional consistency (long → stop < entry < target1)
  - positive numbers
  - holding period enum
  - confidence in [0, 1]
  - option leg required when `instrument === "option"`
- Signals failing validation are dropped and logged; never staged.
- A second sanity check compares signal entry against the live quote — if
  the entry is more than 5 % away from current price, the signal is flagged.

### Concurrency
- Mongo runs as a single-node replica set so Prisma can use transactions for
  multi-document operations (creating a Trade + JournalEntry, etc).
- BullMQ jobs use unique-key locks per `userId+date+session` so only one
  brief generation can run at a time.

## Network egress

The app talks to:
- IB Gateway (localhost:7497 / 7496) — the only outbound channel that can
  cause real trades
- LLM provider APIs (with user's keys)
- Yahoo / Finviz / CBOE / NASDAQ / Barchart / OptionCharts / OpenInsider /
  SEC EDGAR / FRED / Google News / Benzinga (read-only public sources)
- Telegram Bot API + SMTP server (notifications, opt-in)

No telemetry. No analytics. No phone-home.

## Scraping etiquette

`apps/quant/scrapers/common.py` enforces:
- Per-host token-bucket rate limiting (1 req/sec default, slower for
  Barchart / MarketChameleon / OpenInsider, faster for SEC which allows 10
  req/sec with a proper `User-Agent`).
- A standard browser User-Agent for sites that reject curl-style UAs.
- The SEC-required `Name email@domain` UA from `SEC_EDGAR_USER_AGENT` env.
- Tenacity exponential-backoff retry on 429 and 5xx (3 attempts).
- `ScraperError` raised loudly on selector / response-shape failure — the
  reconciler then drops that source for that snapshot rather than returning
  zeros.

## Secrets in logs

- Pino logger (Fastify) does not log request bodies by default.
- API key submissions go through `req.body` only on `PUT /api/providers/key`;
  this route is excluded from body-logging.
- Quant service does not receive any secret material.

## What we explicitly don't do

- No sending API keys to any third party.
- No allowing the LLM to choose arbitrary tools (`completeStructured`
  constrains output to `TradeSignalArray` — no tool-use, no shell, no
  filesystem).
- No auto-approving orders. Period.
- No `--no-verify` on git commits — pre-commit hooks must pass.
- No bypass routes in the risk engine (no "skip just this one" flag).
- No service exposed on `0.0.0.0` outside the Docker network — Compose maps
  to `127.0.0.1` only when `bind` is omitted; we explicitly map to host
  ports for local access.

## Reporting

This is a personal app. There is no security disclosure inbox. If you fork
it and find a class of bug worth fixing in the upstream design, open an
issue.
