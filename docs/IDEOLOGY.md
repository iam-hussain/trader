# Ideology

> A trading helper, not a trading bot. The user is always in the loop.

## Why this exists

Active trading on US equities and options requires gathering signals from
many disconnected sources every morning — fundamentals, technicals, options
flow, news, insider activity, macro context — and turning that pile into a
small set of high-quality decisions: *what to buy, where to enter, where to
take profit, where to stop, how much.*

Doing that well by hand takes hours and burns out the trader before the open.
Doing it sloppily produces low-edge, oversized, undisciplined trades. Most
"AI trading apps" sell black-box buy/sell signals; that's the wrong abstraction
because the trader is responsible for every dollar of P/L. The right
abstraction is a **structured assistant** that does the gathering and
synthesis, presents the reasoning, enforces risk discipline, and stages —
but does not auto-execute — orders.

That is what Trader Daily is.

## Principles

### 1. Human in the loop, every time
No auto-execution. Every order is staged, displayed with its full risk
profile (max loss in dollars, R:R, % of account at risk), and only fires when
the user clicks Confirm. A kill switch cancels everything in two seconds.

### 2. Structured reasoning beats freeform "advice"
The LLM does not produce a paragraph that says "consider buying AAPL." It
produces a `TradeSignal` object — typed, validated by Zod, with required
fields for entry/target1/target2/stop/qty/R:R/confidence/holding-period/thesis/
catalysts/invalidation. If the model can't fill those fields with internally
consistent numbers (stop on the right side of entry, target on the right side
of entry, R:R math checks out), the signal is rejected. The structure forces
discipline.

### 3. Risk lives server-side, not in the UI
The risk engine is a server-side middleware that rejects orders violating
caps regardless of what the UI says. Max risk per trade. Max daily loss. Max
trades per day. Blackout windows around FOMC/CPI/NFP. Concentration limits.
The UI can't bypass them.

### 4. Free data first
Yahoo Finance, CBOE, Finviz, NASDAQ.com, Barchart, OptionCharts.io,
MarketChameleon, OpenInsider, SEC EDGAR, FRED, Google News, Reuters/MarketWatch
RSS — all free. No assumption that the user pays for Polygon, Alpaca data, or
Bloomberg. The only paid integration is the user's own broker (IBKR) and
optional LLM API keys.

### 5. Multiple sources, reconciled
Per-ticker put/call ratio is computed from Yahoo + NASDAQ + Barchart +
OptionCharts and reconciled via median + disagreement flag. Same for IV rank,
news sentiment (FinBERT + lexicon fallback), max pain. One source can be
wrong; three sources agreeing is signal.

### 6. Local-only by default
The whole stack runs in Docker Compose on the user's laptop. No SaaS, no
cloud account, no telemetry. API keys live encrypted in local Mongo.
Historical OHLCV lives in local Parquet/DuckDB. The user owns their data and
their compute.

### 7. Multiple LLMs, switchable
Claude, GPT, Gemini, and local Ollama are all first-class. The provider is
chosen at runtime, per-feature if desired. If a provider fails or rate-limits,
the user can swap. Local Ollama means trading can continue offline (with a
weaker model, but it works).

### 8. Replay before live
Before any signal pipeline change is trusted, it must be runnable in replay
mode against a historical date. The exact same engine sees the data available
on that date and produces what it would have produced. This is how we measure
edge before risking capital.

### 9. Journal everything
Every signal, every staged order, every fill, every kill — recorded with the
thesis snapshot. Quarterly edge analysis: which setup tags actually made
money? Which catalysts were noise? Without this, "AI trading help" is just
expensive vibes.

### 10. Deny destructive shortcuts
- No `--no-verify` on commits.
- No "skip risk check just this once" toggle.
- No silent retries that hide a broken scraper — surface the error.
- No live-trading mode without a confirmation modal that requires typing
  "LIVE" to enable.

## What we won't do

- **Auto-execute trades.** Not even on "high-confidence" signals.
- **Crypto, FX, futures.** US equities and US-listed options only.
- **Mobile app or SaaS.** Local web app, responsive enough for tablet, that's
  it.
- **Sell signals to others.** Single-user app. No multi-tenancy.
- **Paper-trade only.** Eventually supports IBKR live, with red banners and
  type-to-confirm modals — but the goal is real money, real discipline.
- **TradingView Pine indicator porting.** We re-implement the few signals we
  use server-side. Pine isn't portable and we don't need 5,000 indicators.
- **Black-box claims.** Every signal lists its triggers, its confidence, the
  LLM provider that produced it, and the data sources behind each fact.

## Failure modes to design around

| Failure | Mitigation |
| --- | --- |
| LLM hallucinates a price level | Zod validates direction/stop/target consistency; orders re-verify against live quote |
| Scraper structure changes | `ScraperError` surfaces immediately; tests pin selectors; reconciliation across sources reduces single-source dependence |
| Broker disconnect during live order | Kill switch cancels via REST fallback; UI shows banner; trades on the books are read fresh on reconnect |
| User over-trades | Max-trades-per-day cap; max-daily-loss cap; no override |
| Macro event surprise | Blackout windows around FOMC/CPI/NFP/PCE/NFP block new entries by default |
| Correlation blow-up (5 NVDA-sympathy trades simultaneously) | Concentration cap per sector and per beta basket |

## What good looks like

- Run the morning brief in 30 seconds.
- Review 3-7 well-formed trade ideas with full risk profile.
- Stage 1-3 of them with one click.
- Watch them through the day in the orders panel.
- Postmarket: review what happened, tag, journal, move on.
- Quarterly: see which setups worked, double-down on the edge, kill the rest.

That's the whole product.
