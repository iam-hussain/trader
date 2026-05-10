# Operations

Day-to-day commands. If something doesn't work, check this first.

## First-time setup

```bash
cp .env.example .env
# minimum required: NEXTAUTH_SECRET (any 32+ char random string)
# everything else can be entered later via the Settings page
docker compose up -d
docker compose exec api pnpm --filter @trader/db prisma:generate
docker compose exec api pnpm --filter @trader/db prisma:push
```

Open <http://localhost:3000>, register an email + password, you're in.

## Daily use

- `docker compose up -d` — start the stack
- `docker compose down` — stop, keeps volumes
- `docker compose down -v` — stop and wipe Mongo + Redis (destructive)
- `docker compose logs -f api` — tail API logs
- `docker compose logs -f quant` — tail Python service logs
- `docker compose ps` — what's running

## Adding API keys

1. Open <http://localhost:3000/settings>
2. Paste keys into the API Keys section, click Save
3. For LLM providers, click Validate to confirm the key works
4. Keys are encrypted at rest in Mongo (`ApiKey` collection,
   AES-256-GCM with `NEXTAUTH_SECRET`-derived KEK)
5. Env vars are used as fallback if no DB key is set for a provider

## Local LLM via Ollama

```bash
docker compose --profile ollama up -d
docker compose exec ollama ollama pull llama3.1:8b
# then set Default LLM provider = ollama in Settings
```

## Running outside Docker (dev mode)

```bash
pnpm install
# api
pnpm --filter @trader/db prisma:generate
pnpm --filter @trader/db prisma:push
pnpm --filter @trader/api dev    # :4000
# web
pnpm --filter @trader/web dev    # :3000
# quant (separate terminal, Python)
cd apps/quant && python -m venv .venv && source .venv/bin/activate
pip install -r <(grep -A 30 'dependencies = \[' pyproject.toml | grep -E '^\s+"' | tr -d '",')
python main.py                   # :8000
```

You'll need Mongo + Redis running locally too; easiest is to keep the
`docker compose up -d mongo redis` services up while running api/web/quant
on the host.

## Common chores

### Reset the database
```bash
docker compose down -v          # ⚠️ destroys all data
docker compose up -d
docker compose exec api pnpm --filter @trader/db prisma:push
```

### Update dependencies
```bash
pnpm update -r
```

### Clear the OHLCV cache
```bash
rm -rf data/parquet/* data/duckdb/*
```

### Pull the latest Ollama model
```bash
docker compose exec ollama ollama pull llama3.1:8b
docker compose exec ollama ollama list
```

### Run migrations after schema change
```bash
# Edit packages/db/prisma/schema.prisma
docker compose exec api pnpm --filter @trader/db prisma:generate
docker compose exec api pnpm --filter @trader/db prisma:push
```

### Test a scraper interactively
```bash
docker compose exec quant python -c "from scrapers.cboe import fetch_market_put_call; print(fetch_market_put_call())"
```

## Health checks

```bash
curl localhost:4000/healthz     # → {"ok":true,"service":"api"}
curl localhost:8000/healthz     # → {"ok":true,"service":"quant"}
curl -b "trader_token=$TOKEN" localhost:4000/api/analysis/AAPL | jq .
```

## Troubleshooting

### "ECONNREFUSED 127.0.0.1:27017" from api
Mongo replica set isn't initialized yet. Wait ~20 s after `up -d` for the
healthcheck to initiate `rs0`, then restart api:
```bash
docker compose restart api
```

### "MongoDB Replica Set" error from Prisma
Same root cause as above. The compose file initializes a single-node RS in
its mongo healthcheck. Give it 20 s.

### Web shows "Could not load quote"
Quant service is unreachable. Check `docker compose ps quant` and
`docker compose logs quant`. yfinance throttling shows up here too —
back off and retry in a minute.

### TradingView chart embed is blank
Browser blocked the iframe (uBlock list, brave shields). Whitelist
`s.tradingview.com`.

### LLM provider validation fails
- Anthropic: confirm the key starts with `sk-ant-`
- OpenAI: confirm `sk-` and that your account has at least $5 credit
- Google: free tier sometimes throttles to 0 — try again in 60 s
- Ollama: model must be pulled (`ollama list`)

### Port already in use
Override in `.env`:
```
WEB_PORT=3001
API_PORT=4001
QUANT_PORT=8001
```

### "argon2 not found" on ARM Mac
```bash
docker compose build --no-cache api
```

### Prisma can't connect after restart
Replica set state can desync. Nuke and re-init:
```bash
docker compose down -v && docker compose up -d
docker compose exec api pnpm --filter @trader/db prisma:push
```

## Backups

State worth backing up:
- `data/` — OHLCV cache + DuckDB (re-derivable, low priority)
- Mongo `trader` database — your watchlists, trades, journal, settings,
  encrypted keys

Mongo dump:
```bash
docker compose exec mongo mongodump --uri "mongodb://trader:trader@localhost:27017/trader?authSource=admin" --out /data/db/backup-$(date +%F)
docker cp $(docker compose ps -q mongo):/data/db/backup-$(date +%F) ./backups/
```

## Updating to a new release

```bash
git pull
docker compose down
docker compose up -d --build
docker compose exec api pnpm --filter @trader/db prisma:push
```
