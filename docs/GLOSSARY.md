# Glossary

Trading and project jargon, explained.

## Trading

**ATR (Average True Range)** — A measure of recent price volatility. We use
it to size stop distances; a stop placed 1.5×ATR below entry adapts to
current volatility.

**Black-Scholes** — Closed-form pricing model for European options. We use
it for theoretical price + greeks. Single-stock American options behave
close enough that BS is a useful baseline.

**Blackout window** — A configurable period around scheduled macro events
(FOMC, CPI, NFP, PCE) during which the risk engine refuses new entries.
Default ±30 min.

**Bracket order** — A parent entry order plus two OCO ("one cancels other")
children: a take-profit limit and a stop-loss order. When one child fills,
the other is cancelled. The standard order shape we use.

**CBOE** — Chicago Board Options Exchange. The official source for US
market-wide put/call ratios and the VIX.

**Concentration cap** — Server-side limit on how much of the account can
be exposed to a single sector or beta basket simultaneously.

**Death cross** — EMA50 crosses below EMA200. Bearish trend signal.

**Delta** — How much an option price changes per $1 change in the
underlying. Calls have positive delta, puts negative.

**EMA (Exponential Moving Average)** — Smoothed price average that weights
recent data more heavily. We track EMA20 / EMA50 / EMA200 by convention.

**EOD** — End of day.

**Fixed-fractional sizing** — Risk a fixed % of account equity per trade.
Example: 1% × $25k account ÷ $1.20 stop distance = 208 share size.

**FOMC / CPI / NFP / PCE** — The four scheduled macro events that
historically move markets most. FOMC = Federal Open Market Committee
(rates), CPI = Consumer Price Index (inflation), NFP = Non-Farm Payrolls
(jobs), PCE = Personal Consumption Expenditures (Fed-preferred inflation).

**Form 4** — SEC filing required when a company insider buys or sells
their company's stock. Aggregated by OpenInsider.

**13F** — Quarterly SEC filing by institutional investors managing $100M+
disclosing their long positions. WhaleWisdom aggregates.

**GEX (Gamma Exposure)** — Aggregate dealer gamma position across the
options chain. Positive GEX → dealers long gamma → vol-suppressing flows.
Negative GEX → vol-amplifying.

**Golden cross** — EMA50 crosses above EMA200. Bullish trend signal.

**Greeks** — Sensitivity measures: delta (price), gamma (delta change),
theta (time decay), vega (vol).

**IBKR / TWS** — Interactive Brokers, the broker we integrate with.
TWS = Trader Workstation, the desktop client whose API we connect to.

**IV (Implied Volatility)** — The volatility implied by current option
prices. High IV = expensive options, market expects movement.

**IV Rank** — Where current IV sits in its 52-week range, 0-100. IV Rank
of 80 means current IV is higher than 80% of the past year.

**IV Percentile** — % of days in the past N where IV was below current.
Different from IV Rank — better for regime detection.

**Kelly criterion** — Optimal bet-sizing formula. We use a 1/4-Kelly cap
to avoid the high variance of full Kelly.

**Long / Short** — Long = bet on price rising. Short = bet on price falling.

**Max Pain** — The strike price where total option-holder loss at expiry
is minimized. Often acts as a magnet into expiry.

**OCO** — One Cancels Other. Order group where filling one cancels the
other. Used to implement take-profit + stop-loss together.

**OHLCV** — Open / High / Low / Close / Volume. The five fields of a price
bar.

**Options chain** — The grid of all listed strikes × expiries for a
ticker, with bid/ask/IV/volume/OI per option.

**P/C ratio (Put/Call ratio)** — Put volume divided by call volume.
Elevated > 1.0 = bearish positioning; depressed < 0.7 = bullish/complacent.

**PEAD (Post-Earnings Announcement Drift)** — Tendency of stocks that beat
or miss earnings to keep moving in that direction for weeks. A common
swing-trade scanner target.

**Position sizing** — How many shares/contracts to buy. Driven by stop
distance and risk-per-trade %.

**R:R (Risk-Reward)** — (target - entry) / (entry - stop) for a long.
"R:R 2.5" means you're risking $1 to make $2.50.

**RSI** — Relative Strength Index 0-100. < 30 oversold, > 70 overbought.

**Sweep** — An options trade routed across multiple exchanges
simultaneously to fill quickly, often a sign of institutional urgency.

**SEC EDGAR** — The Electronic Data Gathering, Analysis, and Retrieval
system. Free official source for US public company filings.

**SR (Support / Resistance)** — Price levels where a stock has historically
reversed. We compute via local pivots clustered within 1%.

**Unusual options activity** — Volume that's many multiples of open
interest, often a signal that institutions are positioning ahead of news.

**VIX** — CBOE Volatility Index. Implied 30-day vol of S&P 500 options.
"Fear gauge."

**VWAP (Volume-Weighted Average Price)** — Cumulative price × volume ÷
cumulative volume over a session. Intraday institutional anchor.

**Walk-forward** — Backtesting method where you optimize on a window, test
on the next out-of-sample window, slide forward, repeat. Reduces curve-fit.

## Project

**BullMQ** — Redis-backed job queue we use for scheduled briefs and
notification fan-out.

**DuckDB** — Embedded analytical database that reads Parquet files
directly. We use it for OHLCV cache + backtests.

**FinBERT** — BERT model fine-tuned on financial text for sentiment
classification (positive/neutral/negative). Lazy-loaded; falls back to a
finance lexicon if torch/transformers aren't installed.

**LLM** — Large Language Model. We support Anthropic Claude, OpenAI GPT,
Google Gemini, and local Ollama, switchable per request.

**Ollama** — Local LLM runtime, runs models on the user's GPU/CPU. Used
for offline mode and privacy-sensitive prompts.

**Plan mode** — Claude Code mode where the assistant produces a plan file
for user approval before any code is written.

**Prisma** — TypeScript ORM. Provides type-safe DB access against Mongo.

**Reconciler** — A function that takes the same datum (e.g. P/C ratio)
from multiple sources and returns one value with attribution + a
disagreement flag.

**ScraperError** — Sentinel exception raised when a scraper can't extract
its target. The reconciler drops that source for that snapshot.

**Signal engine** — The Phase 3 service that assembles a per-ticker bundle,
prompts the LLM, validates the structured output, and stores accepted
signals.

**Risk engine** — The Phase 3 service that enforces sizing and caps. Runs
server-side as middleware on every order Confirm.

**TradeSignal** — The Zod schema that defines what a valid trade idea
looks like. Includes entry/target/stop/qty/R:R/confidence/holding-period
and required directional consistency checks.

**vectorbt** — Vectorized backtesting library. Phase 5.

**Vercel AI SDK** — Provider-agnostic LLM library that gives us a single
`generateObject(schema)` call across Anthropic / OpenAI / Google / Ollama.
