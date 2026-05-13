"""Trader Daily — quant + scraping service.

Phase 2 wires up the full analysis bundle endpoint that the API calls when
producing a brief. Per-source endpoints are also exposed for ad-hoc inspection.
"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from scrapers.yahoo import fetch_quote, fetch_news as yahoo_news, fetch_options_snapshot as yahoo_options
from scrapers.finviz import fetch_snapshot as finviz_snapshot, fetch_news as finviz_news
from scrapers.cboe import fetch_market_put_call, fetch_vix_latest
from scrapers.googlenews import fetch_news as gnews_news
from scrapers.benzinga import fetch_news as benzinga_news
from scrapers.sec_edgar import fetch_recent_filings, fetch_form4_insider_transactions
from scrapers.openinsider import fetch_insider_transactions
from scrapers.fred import fetch_risk_free_rate
from scrapers.common import ScraperError

from indicators.technicals import compute_bundle as compute_technicals_bundle
from options.put_call_ratio import reconcile as reconcile_put_call
from sentiment.aggregate import score_articles, aggregate as aggregate_sentiment


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(os.environ.get("PARQUET_DIR", "./data/parquet"), exist_ok=True)
    yield


app = FastAPI(title="trader-quant", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Phase 5 forecast + backtest endpoints live in their own routers
try:
    from forecast.router import router as forecast_router
    app.include_router(forecast_router)
except ImportError:
    pass
try:
    from backtest.router import router as backtest_router
    app.include_router(backtest_router)
except ImportError:
    pass


# ── Health ──────────────────────────────────────────────────────────────────
@app.get("/healthz")
def healthz() -> dict[str, Any]:
    return {"ok": True, "service": "quant"}


# ── Per-source endpoints (Phase 1 + 2) ──────────────────────────────────────
@app.get("/quote/{symbol}")
def quote(symbol: str) -> dict[str, Any]:
    try:
        return fetch_quote(symbol.upper())
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"quote_failed: {e}") from e


def _fetch_news_from_all_sources(sym: str) -> list[dict[str, Any]]:
    articles: list[dict[str, Any]] = []
    for src_name, fn in (("yahoo", yahoo_news), ("finviz", finviz_news), ("googlenews", gnews_news), ("benzinga", benzinga_news)):
        try:
            for a in fn(sym):
                a.setdefault("source", src_name)
                articles.append(a)
        except Exception:
            continue
    # Dedup by url + title
    seen: set[tuple[str, str]] = set()
    deduped: list[dict[str, Any]] = []
    for a in articles:
        key = (a.get("url", ""), a.get("title", ""))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(a)
    return deduped


@app.get("/news/{symbol}")
def news(symbol: str) -> dict[str, Any]:
    sym = symbol.upper()
    deduped = _fetch_news_from_all_sources(sym)
    scored = score_articles(deduped)
    return {"symbol": sym, "articles": scored, "summary": aggregate_sentiment(scored)}


def _price_impact_map(symbol: str, days: int) -> dict[str, dict[str, float]]:
    """Build {YYYY-MM-DD: {open, close, dailyReturnPct, fwd1dPct, fwd5dPct, fwd21dPct}}
    covering the last `days` calendar days plus enough buffer for forward windows.

    Forward returns are close-to-close: fwd5dPct = (close[t+5] - close[t]) / close[t].
    Returns are NOT attributed to individual articles — they're price markers
    showing what the stock did around the date.
    """
    try:
        from indicators.technicals import fetch_ohlcv

        # Need extra buffer at the end for forward 21d returns. yfinance
        # periods are coarse; pick the smallest that gives both warmup and
        # forward window. (5d is a small extra buffer past `days`.)
        if days <= 7:
            period = "1mo"
        elif days <= 30:
            period = "3mo"
        elif days <= 90:
            period = "6mo"
        elif days <= 365:
            period = "1y"
        elif days <= 730:
            period = "2y"
        elif days <= 1825:
            period = "5y"
        else:
            period = "max"

        df = fetch_ohlcv(symbol, period=period, interval="1d")
        if df is None or df.empty:
            return {}
        import math
        # Build an ordered list of (date_key, open, close)
        bars: list[tuple[str, float, float]] = []
        for ts, row in df.iterrows():
            try:
                op = float(row["Open"])
                cl = float(row["Close"])
            except (TypeError, ValueError):
                continue
            if math.isnan(op) or math.isnan(cl):
                continue
            date_key = (ts.strftime("%Y-%m-%d") if hasattr(ts, "strftime") else str(ts)[:10])
            bars.append((date_key, op, cl))

        out: dict[str, dict[str, float]] = {}
        for i, (date_key, op, cl) in enumerate(bars):
            entry: dict[str, float] = {"open": op, "close": cl}
            if i > 0:
                prev_close = bars[i - 1][2]
                if prev_close > 0:
                    entry["dailyReturnPct"] = (cl - prev_close) / prev_close * 100.0
            # Forward returns from THIS day's close
            for n_key, n in (("fwd1dPct", 1), ("fwd5dPct", 5), ("fwd21dPct", 21)):
                j = i + n
                if j < len(bars) and cl > 0:
                    entry[n_key] = (bars[j][2] - cl) / cl * 100.0
            out[date_key] = entry
        return out
    except Exception:
        return {}


@app.get("/news/history/{symbol}")
def news_history(symbol: str, days: int = 7) -> dict[str, Any]:
    """News timeline for a symbol, grouped by day.

    Source scrapers (Yahoo, Finviz, Google News RSS, Benzinga RSS) only
    surface the most recent ~30 articles each, so deep horizons (>~30 days)
    will show progressively sparse / empty days. That's a data-source
    limitation, not a bug — we report `coverageNote` in the response.

    Each article is annotated with `priceImpactPct` — the symbol's daily
    return on the article's publish date (close vs previous close). This is
    a coarse "what did the stock do that day" signal; it does NOT attribute
    causation to a specific article. For dates that are weekends, holidays,
    or future, priceImpactPct is null.
    """
    from datetime import datetime, timedelta, timezone

    sym = symbol.upper()
    horizon = max(1, int(days))
    deduped = _fetch_news_from_all_sources(sym)
    scored = score_articles(deduped)

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=horizon)

    # Pull OHLC once for the full horizon. This is the price-impact lookup map.
    price_map = _price_impact_map(sym, horizon)

    def _parse_iso(raw: Any) -> datetime | None:
        if not raw:
            return None
        try:
            if isinstance(raw, str):
                # Handle trailing Z and missing tz
                s = raw.replace("Z", "+00:00") if raw.endswith("Z") else raw
                dt = datetime.fromisoformat(s)
            else:
                dt = raw
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except (TypeError, ValueError):
            return None

    in_window: list[dict[str, Any]] = []
    for a in scored:
        dt = _parse_iso(a.get("publishedAt"))
        if dt is None:
            continue
        if dt < cutoff:
            continue
        a = {**a, "_dt": dt}
        in_window.append(a)

    in_window.sort(key=lambda a: a["_dt"], reverse=True)

    # Group by date — articles are NOT annotated with price moves anymore.
    # Same-day return is ambiguous across multiple articles per day and can't
    # be attributed to any single article without intraday tick data. Forward
    # returns are reported per-day at the group level so the user can see
    # "what did the stock do after this date".
    by_date: dict[str, list[dict[str, Any]]] = {}
    for a in in_window:
        key = a["_dt"].strftime("%Y-%m-%d")
        a_clean = {k: v for k, v in a.items() if k != "_dt"}
        by_date.setdefault(key, []).append(a_clean)

    days_out: list[dict[str, Any]] = []
    for date_key in sorted(by_date.keys(), reverse=True):
        arts = by_date[date_key]
        sentiments = [a.get("sentiment") for a in arts if a.get("sentiment")]
        pos = sum(1 for s in sentiments if s == "positive")
        neg = sum(1 for s in sentiments if s == "negative")
        bar = price_map.get(date_key) or {}
        days_out.append({
            "date": date_key,
            "count": len(arts),
            "positive": pos,
            "negative": neg,
            "neutral": len(arts) - pos - neg,
            # Day's own daily return (close vs prev close) — context, not attribution.
            "dailyReturnPct": bar.get("dailyReturnPct"),
            # Forward returns from this day's close. These are what actually
            # vary per date and let the reader judge "did the market move
            # AFTER this day of news".
            "fwd1dPct": bar.get("fwd1dPct"),
            "fwd5dPct": bar.get("fwd5dPct"),
            "fwd21dPct": bar.get("fwd21dPct"),
            "articles": arts,
        })

    coverage_note = None
    if horizon > 30:
        coverage_note = (
            "Source scrapers cap at ~30 days of recent articles. Days beyond "
            "that window will be sparse or empty until persistent news "
            "archival is enabled."
        )

    return {
        "symbol": sym,
        "horizonDays": horizon,
        "fromDate": cutoff.strftime("%Y-%m-%d"),
        "toDate": now.strftime("%Y-%m-%d"),
        "totalCount": len(in_window),
        "daysWithNews": len(days_out),
        "summary": aggregate_sentiment(scored),
        "coverageNote": coverage_note,
        "days": days_out,
    }


@app.get("/options/{symbol}")
def options(symbol: str) -> dict[str, Any]:
    """Phase 1 single-source snapshot. See /analysis/{symbol} for reconciled view."""
    try:
        return yahoo_options(symbol.upper())
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"options_failed: {e}") from e


@app.get("/technicals/{symbol}")
def technicals(symbol: str) -> dict[str, Any]:
    try:
        return compute_technicals_bundle(symbol.upper())
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"technicals_failed: {e}") from e


@app.get("/insider/{symbol}")
def insider(symbol: str) -> dict[str, Any]:
    sym = symbol.upper()
    try:
        rows = fetch_insider_transactions(sym, limit=50)
    except Exception:
        rows = []
    return {"symbol": sym, "rows": rows}


@app.get("/filings/{symbol}")
def filings(symbol: str) -> dict[str, Any]:
    sym = symbol.upper()
    try:
        rows = fetch_recent_filings(sym, limit=20)
    except Exception:
        rows = []
    return {"symbol": sym, "filings": rows}


@app.get("/form4/{symbol}")
def form4(symbol: str) -> dict[str, Any]:
    sym = symbol.upper()
    try:
        rows = fetch_form4_insider_transactions(sym, limit=20)
    except Exception:
        rows = []
    return {"symbol": sym, "form4": rows}


# ── Macro ───────────────────────────────────────────────────────────────────
@app.get("/macro/regime")
def macro_regime() -> dict[str, Any]:
    """Lightweight market-wide snapshot — VIX + market P/C from CBOE,
    risk-free rate from FRED. Regime classification is heuristic for now."""
    out: dict[str, Any] = {}
    try:
        out["vix"] = fetch_vix_latest()
    except ScraperError as e:
        out["vix"] = {"error": str(e)}
    try:
        out["putCall"] = fetch_market_put_call()
    except ScraperError as e:
        out["putCall"] = {"error": str(e)}
    try:
        out["riskFreeRate"] = fetch_risk_free_rate()
    except ScraperError as e:
        out["riskFreeRate"] = None

    vix = out.get("vix", {}).get("vix") if isinstance(out.get("vix"), dict) else None
    if isinstance(vix, (int, float)):
        if vix < 15:
            regime = "risk-on"
        elif vix > 22:
            regime = "risk-off"
        else:
            regime = "neutral"
    else:
        regime = "neutral"
    out["regime"] = regime
    return out


# ── Analysis bundle (the headliner) ─────────────────────────────────────────
@app.get("/analysis/{symbol}")
def analysis(symbol: str) -> dict[str, Any]:
    """Full per-ticker bundle the API consumes when generating a brief.

    Each sub-section is best-effort — any source that fails is omitted with an
    error attached, the rest of the bundle is still returned.
    """
    sym = symbol.upper()
    bundle: dict[str, Any] = {"symbol": sym}

    # Quote (required-ish — without it the rest is less useful, but don't 502)
    try:
        bundle["quote"] = fetch_quote(sym)
    except Exception as e:
        bundle["quote"] = {"error": str(e)}

    # Fundamentals snapshot from Finviz
    try:
        bundle["fundamentals"] = finviz_snapshot(sym)
    except Exception as e:
        bundle["fundamentals"] = {"error": str(e)}

    # Technicals bundle (RSI/MACD/BB/EMAs/ATR/trend/signals)
    try:
        bundle["technicals"] = compute_technicals_bundle(sym)
    except Exception as e:
        bundle["technicals"] = {"error": str(e)}

    # Options — collect snapshots from multiple sources, reconcile P/C
    snapshots: list[dict[str, Any]] = []
    try:
        ya = yahoo_options(sym)
        for s in ya.get("putCall", []):
            snapshots.append(s)
        bundle["optionsRaw"] = ya
    except Exception as e:
        bundle["optionsRaw"] = {"error": str(e)}

    # Lazy-import optional source scrapers so a missing one doesn't break import.
    for mod_name, fn_name in (
        ("scrapers.nasdaq", "fetch_options_snapshot"),
        ("scrapers.barchart", "fetch_options_snapshot"),
        ("scrapers.optioncharts", "fetch_options_snapshot"),
    ):
        try:
            mod = __import__(mod_name, fromlist=[fn_name])
            snap = getattr(mod, fn_name)(sym)
            # Each source returns a dict with at least {"source", "ratio"} keys
            if isinstance(snap.get("ratio"), (int, float)):
                snapshots.append({
                    "source": snap.get("source"),
                    "ratio": snap["ratio"],
                    "callVolume": snap.get("callVolume"),
                    "putVolume": snap.get("putVolume"),
                    "asOf": snap.get("asOf"),
                })
        except Exception:
            continue

    if snapshots:
        bundle["options"] = {
            "putCall": snapshots,
            "putCallReconciled": reconcile_put_call(snapshots),
        }
    else:
        bundle["options"] = {"putCall": [], "putCallReconciled": None}

    # News + sentiment
    try:
        articles: list[dict[str, Any]] = []
        for src_name, fn in (("yahoo", yahoo_news), ("finviz", finviz_news), ("googlenews", gnews_news), ("benzinga", benzinga_news)):
            try:
                for a in fn(sym):
                    a.setdefault("source", src_name)
                    articles.append(a)
            except Exception:
                continue
        seen: set[tuple[str, str]] = set()
        deduped: list[dict[str, Any]] = []
        for a in articles:
            key = (a.get("url", ""), a.get("title", ""))
            if key in seen:
                continue
            seen.add(key)
            deduped.append(a)
        scored = score_articles(deduped)
        bundle["news"] = {"articles": scored, "summary": aggregate_sentiment(scored)}
    except Exception as e:
        bundle["news"] = {"error": str(e)}

    # Insider + filings
    try:
        bundle["insider"] = fetch_insider_transactions(sym, limit=20)
    except Exception:
        bundle["insider"] = []
    try:
        bundle["filings"] = fetch_recent_filings(sym, limit=10)
    except Exception:
        bundle["filings"] = []

    return bundle


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=int(os.environ.get("QUANT_PORT", "8000")),
        reload=os.environ.get("NODE_ENV", "development") == "development",
    )
