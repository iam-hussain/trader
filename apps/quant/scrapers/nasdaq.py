"""Nasdaq.com unofficial REST endpoint for option chains.

Endpoint: https://api.nasdaq.com/api/quote/{symbol}/option-chain
Requires browser-like headers; common.client() supplies a Chrome UA.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Optional

from .common import ScraperError, http_get, now_iso

_URL_TMPL = (
    "https://api.nasdaq.com/api/quote/{symbol}/option-chain"
    "?assetclass=stocks&fromdate={fromdate}&todate={todate}&limit=2000"
)


def _to_float(v: Any) -> Optional[float]:
    if v in (None, "", "--", "N/A"):
        return None
    try:
        return float(str(v).replace(",", ""))
    except (TypeError, ValueError):
        return None


def fetch_options_snapshot(symbol: str) -> dict:
    """Aggregate call/put volume and open interest across all listed expiries."""
    sym = (symbol or "").strip().upper()
    if not sym:
        raise ScraperError("nasdaq: empty symbol")

    today = date.today()
    url = _URL_TMPL.format(
        symbol=sym.lower(),
        fromdate=today.isoformat(),
        todate=(today + timedelta(days=90)).isoformat(),
    )
    headers = {
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://www.nasdaq.com",
        "Referer": "https://www.nasdaq.com/",
    }
    try:
        resp = http_get(url, headers=headers)
        payload = resp.json()
    except Exception as exc:  # noqa: BLE001
        raise ScraperError(f"nasdaq: request failed: {exc}") from exc

    try:
        data = payload.get("data") or {}
        table = data.get("optionChainList") or data.get("table") or {}
        rows = table.get("rows") if isinstance(table, dict) else None
        if rows is None:
            rows = data.get("rows") or []
    except AttributeError as exc:
        raise ScraperError(f"nasdaq: unexpected payload shape: {exc}") from exc

    if not isinstance(rows, list):
        raise ScraperError("nasdaq: option rows missing")

    call_vol = 0.0
    put_vol = 0.0
    call_oi = 0.0
    put_oi = 0.0
    expiries: list[str] = []

    for row in rows:
        if not isinstance(row, dict):
            continue
        exp = row.get("expirygroup") or row.get("expiryDate") or row.get("expiry")
        if isinstance(exp, str) and exp and exp not in expiries:
            # Heading rows share an expiry label; keep unique strings.
            if any(ch.isdigit() for ch in exp):
                expiries.append(exp)
        cv = _to_float(row.get("c_Volume") or row.get("callVolume"))
        pv = _to_float(row.get("p_Volume") or row.get("putVolume"))
        co = _to_float(row.get("c_Openinterest") or row.get("callOpenInterest"))
        po = _to_float(row.get("p_Openinterest") or row.get("putOpenInterest"))
        if cv:
            call_vol += cv
        if pv:
            put_vol += pv
        if co:
            call_oi += co
        if po:
            put_oi += po

    ratio = (put_vol / call_vol) if call_vol else 0.0
    return {
        "symbol": sym,
        "source": "nasdaq",
        "asOf": now_iso(),
        "callVolume": call_vol,
        "putVolume": put_vol,
        "callOI": call_oi,
        "putOI": put_oi,
        "ratio": ratio,
        "expiries": expiries,
    }
