"""Yahoo Finance via yfinance — primary free quote/news/options source.

Phase 2 will add: CBOE total P/C, NASDAQ.com chains, Barchart per-ticker P/C,
OptionCharts max-pain & GEX, MarketChameleon unusual flow, OpenInsider, SEC.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import yfinance as yf


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def fetch_quote(symbol: str) -> dict[str, Any]:
    t = yf.Ticker(symbol)
    fast = getattr(t, "fast_info", {}) or {}
    info: dict[str, Any] = {}
    try:
        info = t.info or {}
    except Exception:
        info = {}

    price = (
        fast.get("last_price")
        or info.get("regularMarketPrice")
        or info.get("currentPrice")
    )
    prev = fast.get("previous_close") or info.get("previousClose")
    if price is None or prev is None:
        hist = t.history(period="2d", interval="1d")
        if hist.empty:
            raise RuntimeError(f"no data for {symbol}")
        price = float(hist["Close"].iloc[-1])
        prev = float(hist["Close"].iloc[-2]) if len(hist) > 1 else price

    change = float(price) - float(prev)
    change_pct = (change / float(prev)) * 100 if prev else 0.0

    return {
        "symbol": symbol,
        "price": float(price),
        "change": change,
        "changePct": change_pct,
        "volume": int(fast.get("last_volume") or info.get("regularMarketVolume") or 0),
        "open": float(fast.get("open") or info.get("regularMarketOpen") or 0) or None,
        "high": float(fast.get("day_high") or info.get("regularMarketDayHigh") or 0) or None,
        "low": float(fast.get("day_low") or info.get("regularMarketDayLow") or 0) or None,
        "prevClose": float(prev),
        "marketCap": info.get("marketCap"),
        "asOf": _now_iso(),
    }


def fetch_news(symbol: str, limit: int = 20) -> list[dict[str, Any]]:
    t = yf.Ticker(symbol)
    try:
        items = t.news or []
    except Exception:
        items = []
    out: list[dict[str, Any]] = []
    for n in items[:limit]:
        # yfinance shape changed across versions; handle both.
        content = n.get("content") if isinstance(n, dict) else None
        if content:
            url = content.get("canonicalUrl", {}).get("url") or content.get("clickThroughUrl", {}).get("url")
            out.append({
                "source": content.get("provider", {}).get("displayName") or "Yahoo",
                "url": url or "",
                "title": content.get("title") or "",
                "publishedAt": content.get("pubDate") or _now_iso(),
                "summary": content.get("summary"),
                "tickers": [symbol],
            })
        else:
            out.append({
                "source": n.get("publisher") or "Yahoo",
                "url": n.get("link") or "",
                "title": n.get("title") or "",
                "publishedAt": datetime.fromtimestamp(
                    n.get("providerPublishTime", 0), tz=timezone.utc
                ).isoformat() if n.get("providerPublishTime") else _now_iso(),
                "summary": None,
                "tickers": [symbol],
            })
    return out


def fetch_options_snapshot(symbol: str) -> dict[str, Any]:
    """Per-ticker put/call ratio computed from the nearest expiry options chain.
    Phase 2 will reconcile against CBOE, NASDAQ, Barchart."""
    t = yf.Ticker(symbol)
    expiries = t.options
    if not expiries:
        return {
            "symbol": symbol,
            "putCall": [],
            "unusualActivity": [],
        }
    nearest = expiries[0]
    chain = t.option_chain(nearest)
    call_vol = int(chain.calls["volume"].fillna(0).sum())
    put_vol = int(chain.puts["volume"].fillna(0).sum())
    call_oi = int(chain.calls["openInterest"].fillna(0).sum())
    put_oi = int(chain.puts["openInterest"].fillna(0).sum())
    pc_vol_ratio = (put_vol / call_vol) if call_vol > 0 else 0.0

    return {
        "symbol": symbol,
        "putCall": [
            {
                "symbol": symbol,
                "ratio": pc_vol_ratio,
                "callVolume": call_vol,
                "putVolume": put_vol,
                "callOI": call_oi,
                "putOI": put_oi,
                "source": "yahoo",
                "asOf": _now_iso(),
            }
        ],
        "expiries": list(expiries[:8]),
        "unusualActivity": [],
    }
