# Data Sources

Every external source we touch, what it provides, how we use it, free/paid,
and known limits.

## Quotes / OHLCV / Fundamentals

### Yahoo Finance (`yfinance`) — primary
- **Module**: `apps/quant/scrapers/yahoo.py`
- **Provides**: real-time quote (15-min delayed), historical OHLCV, news
  list, options chains, key fundamentals via `Ticker.info`
- **Cost**: free
- **Limits**: ~2,000 req/hour soft. Aggressive scraping triggers cooldowns.
- **Used for**: live quote on ticker page; option chain volume/OI for
  per-ticker P/C; historical bars for technicals; news fallback

### Stooq
- **Provides**: end-of-day OHLCV CSV downloads
- **Cost**: free
- **Used for**: backup EOD source if Yahoo is throttling (Phase 2 stretch)

### Alpha Vantage *(optional)*
- **Cost**: free tier (5 req/min, 500/day) with API key
- **Provides**: intraday + daily quotes, fundamentals
- **Used for**: optional supplemental fallback

### Finnhub *(optional)*
- **Cost**: free tier (60 req/min) with API key
- **Provides**: quotes, fundamentals, earnings call transcripts
- **Used for**: earnings transcript summarization (Phase 5)

### IBKR live data (Phase 4)
- **Cost**: per-exchange data subscription on the user's IB account
- **Used for**: real-time positions, fills, account P/L during execution

## News

### Yahoo Finance news
- **Module**: `apps/quant/scrapers/yahoo.py` (`fetch_news`)
- **Cost**: free
- **Used for**: per-ticker news on ticker page

### Finviz
- **Module**: `apps/quant/scrapers/finviz.py`
- **Cost**: free
- **Provides**: snapshot table (RSI, ATR, beta, short %, EPS, P/E, etc.)
  + news block per ticker
- **Used for**: fundamentals KPI grid; news supplement

### Benzinga RSS
- **Module**: `apps/quant/scrapers/benzinga.py`
- **Cost**: free
- **Provides**: site-wide news feed; we filter by ticker mentions
- **Limits**: standard RSS, fetch sparingly

### Google News RSS
- **Module**: `apps/quant/scrapers/googlenews.py`
- **Cost**: free
- **Provides**: search-style news for a ticker query
- **Limits**: be polite, cache

### Reuters / MarketWatch / Seeking Alpha (RSS, planned)
- **Cost**: free
- **Used for**: news diversification (Phase 2 stretch)

### NewsAPI.org *(optional)*
- **Cost**: free tier (100 req/day) with key
- **Provides**: aggregated news search

## Put/Call ratio & options flow

> All wrapped behind a `PutCallSource` interface and **reconciled** by the
> `put_call_ratio.reconcile()` function (median + disagreement flag).

### CBOE — gold standard for market-wide P/C
- **Module**: `apps/quant/scrapers/cboe.py`
- **Cost**: free, official
- **Provides**: total market P/C (index options) + equity-only P/C +
  VIX history, all as plain CSV at stable URLs
- **Used for**: market-wide regime detection, dashboard regime badge

### Yahoo Finance options chain — per-ticker
- **Module**: `apps/quant/scrapers/yahoo.py` (`fetch_options_snapshot`)
- **Provides**: full chain → we compute per-ticker P/C from raw OI & volume

### NASDAQ.com options
- **Module**: `apps/quant/scrapers/nasdaq.py`
- **Cost**: free (REST endpoint, requires browser-like UA)
- **Provides**: per-ticker chain across expiries

### Barchart
- **Module**: `apps/quant/scrapers/barchart.py`
- **Cost**: free (with login walls on some pages)
- **Provides**: per-ticker P/C, IV rank, IV percentile, max pain
- **Limits**: cookie-based CSRF; free tier rate-limited; some endpoints
  paywalled — scraper degrades gracefully

### OptionCharts.io
- **Module**: `apps/quant/scrapers/optioncharts.py`
- **Cost**: free
- **Provides**: max pain, P/C ratio, IV rank/percentile, GEX, skew
- **How we read it**: parse `__NEXT_DATA__` JSON from the HTML page

### MarketChameleon
- **Module**: `apps/quant/scrapers/marketchameleon.py`
- **Cost**: free overview pages
- **Provides**: unusual options activity flag, P/C, IV rank
- **Limits**: full data behind paywall — scraper gets only the public bits

### OpenBB Platform (Python lib)
- **Cost**: open source (free)
- **Used for**: optional aggregator — a single import that wraps several
  free sources. We don't depend on it but it's available for ad-hoc use.

### CBOE VIX term structure & SKEW index
- **Source**: CBOE CSVs
- **Used for**: regime detection, vol-of-vol awareness

### SqueezeMetrics free GEX/DEX
- **Cost**: free daily snapshot pages
- **Used for**: dealer-positioning awareness (Phase 3 stretch)

## Macro & calendar

### FRED (St. Louis Fed)
- **Module**: `apps/quant/scrapers/fred.py`
- **Cost**: free with API key
- **Provides**: yields (DGS3MO, DGS10), CPI, PCE, unemployment
- **Used for**: risk-free rate for Greeks; macro context for prompts

### US Treasury
- **Cost**: free
- **Provides**: yield curve points
- **Used for**: yield-curve overlay in macro view (Phase 3)

### Investing.com / Earnings Whispers / Forex Factory
- **Cost**: free pages
- **Used for**: earnings dates + econ event calendar (Phase 3)

### CNN Fear & Greed
- **Cost**: free page
- **Used for**: market sentiment index in dashboard (Phase 3)

## Insider & institutional

### SEC EDGAR
- **Module**: `apps/quant/scrapers/sec_edgar.py`
- **Cost**: free, official
- **Provides**: filings (10-K/10-Q/8-K/Form 4/13F), CIK lookup
- **Limits**: requires `SEC_EDGAR_USER_AGENT` header (`Name email@domain`);
  10 req/sec hard cap

### OpenInsider
- **Module**: `apps/quant/scrapers/openinsider.py`
- **Cost**: free
- **Provides**: aggregated Form 4 buy/sell with insider name, role,
  $ amount, post-trade ownership
- **Limits**: be polite — 1.5s between hits

### WhaleWisdom (planned)
- **Cost**: free public summaries
- **Provides**: 13F holder summaries
- **Used for**: institutional-flow context (Phase 3+)

## LLM providers

### Anthropic (Claude)
- **Models**: claude-opus-4-7 (default), claude-sonnet-4-6, claude-haiku-4-5
- **Cost**: per-token, varies by model
- **Used for**: signal generation, news summarization, brief synthesis

### OpenAI (GPT)
- **Models**: gpt-4o (default), gpt-4o-mini
- **Cost**: per-token

### Google (Gemini)
- **Models**: gemini-2.0-flash (default)
- **Cost**: free tier available

### Ollama (local)
- **Models**: llama3.1:8b, qwen2.5:7b (user choice)
- **Cost**: free (your GPU/CPU)
- **Used for**: offline mode, privacy-sensitive prompts

## Broker

### Interactive Brokers (TWS / IB Gateway)
- **Module**: `packages/brokers/src/ibkr.ts`
- **Cost**: brokerage fees + optional data subscriptions
- **Provides**: order placement, positions, daily P/L, market data
- **How**: TCP socket to TWS desktop on port 7497 (paper) / 7496 (live)
- **Library**: `@stoqey/ib`

## TradingView

### Free Advanced Chart embed widget
- **Used for**: chart on stock detail page
- **Cost**: free

### TradingView Essential subscription
- **Cost**: $14.95/mo (user already has)
- **Useful for this app**: nothing programmatic
  - No data API (any tier)
  - No webhook alerts (need Pro+)

### TradingView webhook receiver
- **Endpoint**: `POST /api/webhooks/tradingview`
- **Status**: pre-wired, dormant. Activates if user upgrades to Pro+.

## Notification channels

### Telegram bot
- **Cost**: free
- **Used for**: signal/fill/alert push notifications (Phase 3)

### SMTP email
- **Cost**: depends on user's SMTP provider
- **Used for**: digest emails (Phase 3)
