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


@app.get("/news/{symbol}")
def news(symbol: str) -> dict[str, Any]:
    sym = symbol.upper()
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
    scored = score_articles(deduped)
    return {"symbol": sym, "articles": scored, "summary": aggregate_sentiment(scored)}


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
