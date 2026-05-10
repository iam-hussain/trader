"""Barchart per-ticker put/call ratio + IV rank.

Tries the public XHR (with XSRF token from cookie) first, then falls back to
the HTML page's embedded JSON.
"""
from __future__ import annotations

import json
import re
from typing import Any, Optional
from urllib.parse import unquote

from .common import ScraperError, client, http_get, now_iso

_PAGE_URL = "https://www.barchart.com/stocks/quotes/{symbol}/put-call-ratios"
_XHR_URL = (
    "https://www.barchart.com/proxies/core-api/v1/quotes/get"
    "?symbols={symbol}&fields=ivRank,ivPercentile,putCallVolRatio,putCallOpenInterestRatio"
)


def _to_float(v: Any) -> Optional[float]:
    if v in (None, "", "--", "N/A"):
        return None
    try:
        return float(str(v).replace(",", "").rstrip("%"))
    except (TypeError, ValueError):
        return None


def _xsrf_token() -> Optional[str]:
    jar = client().cookies.jar
    for cookie in jar:
        if cookie.name == "XSRF-TOKEN":
            return unquote(cookie.value or "")
    return None


def _try_xhr(symbol: str) -> Optional[dict[str, Any]]:
    # Prime the cookie jar with a page hit.
    try:
        http_get(_PAGE_URL.format(symbol=symbol))
    except Exception:  # noqa: BLE001
        return None
    token = _xsrf_token()
    if not token:
        return None
    headers = {
        "Accept": "application/json",
        "x-xsrf-token": token,
        "Referer": _PAGE_URL.format(symbol=symbol),
        "X-Requested-With": "XMLHttpRequest",
    }
    try:
        resp = http_get(_XHR_URL.format(symbol=symbol), headers=headers)
        if resp.status_code != 200:
            return None
        payload = resp.json()
    except Exception:  # noqa: BLE001
        return None
    data = payload.get("data") if isinstance(payload, dict) else None
    if isinstance(data, list) and data:
        return data[0] if isinstance(data[0], dict) else None
    if isinstance(data, dict):
        return data
    return None


_INIT_RE = re.compile(r"data-ng-init\s*=\s*\"init\((\{.+?\})\)\"", re.DOTALL)
_STATE_RE = re.compile(
    r"window\.__INITIAL_STATE__\s*=\s*(\{.+?\});\s*</script>", re.DOTALL
)


def _parse_html(symbol: str) -> dict[str, Any]:
    try:
        resp = http_get(_PAGE_URL.format(symbol=symbol))
    except Exception as exc:  # noqa: BLE001
        raise ScraperError(f"barchart: page fetch failed: {exc}") from exc
    if resp.status_code in (401, 403):
        raise ScraperError("barchart: page requires login (auth wall)")
    text = resp.text
    if "log in" in text.lower() and "subscribe" in text.lower() and len(text) < 4000:
        raise ScraperError("barchart: page requires login (auth wall)")

    for pat in (_INIT_RE, _STATE_RE):
        m = pat.search(text)
        if not m:
            continue
        try:
            blob = json.loads(m.group(1).replace("&quot;", '"'))
        except json.JSONDecodeError:
            continue
        return blob
    raise ScraperError("barchart: could not locate embedded data")


def _pluck(blob: dict[str, Any], *keys: str) -> Optional[float]:
    """Walk a possibly nested dict and return the first numeric match."""
    stack: list[Any] = [blob]
    while stack:
        cur = stack.pop()
        if isinstance(cur, dict):
            for k, v in cur.items():
                if k in keys:
                    f = _to_float(v)
                    if f is not None:
                        return f
                if isinstance(v, (dict, list)):
                    stack.append(v)
        elif isinstance(cur, list):
            stack.extend(cur)
    return None


def fetch_options_snapshot(symbol: str) -> dict:
    sym = (symbol or "").strip().upper()
    if not sym:
        raise ScraperError("barchart: empty symbol")

    data = _try_xhr(sym)
    if not data:
        data = _parse_html(sym)

    return {
        "symbol": sym,
        "source": "barchart",
        "asOf": now_iso(),
        "ratio": _pluck(data, "putCallVolRatio", "putCallVolumeRatio"),
        "oiRatio": _pluck(data, "putCallOpenInterestRatio", "putCallOiRatio"),
        "ivRank": _pluck(data, "ivRank", "impliedVolatilityRank"),
        "ivPercentile": _pluck(data, "ivPercentile", "impliedVolatilityPercentile"),
    }
