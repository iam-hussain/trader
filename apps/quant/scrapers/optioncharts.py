"""optioncharts.io overview scraper (Next.js __NEXT_DATA__)."""
from __future__ import annotations

import json
import re
from typing import Any, Optional

from .common import ScraperError, http_get, now_iso

_URL_TMPL = "https://optioncharts.io/options/{symbol}/overview"
_NEXT_RE = re.compile(
    r'<script id="__NEXT_DATA__" type="application/json">(\{.+?\})</script>',
    re.DOTALL,
)


def _to_float(v: Any) -> Optional[float]:
    if v in (None, "", "--", "N/A"):
        return None
    try:
        return float(str(v).replace(",", "").rstrip("%"))
    except (TypeError, ValueError):
        return None


_TARGET_KEYS = {
    "ratio": ("putCallRatio", "pcRatio", "put_call_ratio", "putCallVolumeRatio"),
    "ivRank": ("ivRank", "iv_rank", "impliedVolatilityRank"),
    "ivPercentile": ("ivPercentile", "iv_percentile", "impliedVolatilityPercentile"),
    "maxPain": ("maxPain", "max_pain", "maxPainPrice"),
    "gex": ("gex", "gammaExposure", "gamma_exposure", "totalGamma"),
}


def _walk(blob: Any, keys: tuple[str, ...]) -> Optional[float]:
    stack: list[Any] = [blob]
    while stack:
        cur = stack.pop()
        if isinstance(cur, dict):
            for k, v in cur.items():
                if k in keys:
                    f = _to_float(v) if not isinstance(v, (dict, list)) else None
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
        raise ScraperError("optioncharts: empty symbol")

    try:
        resp = http_get(_URL_TMPL.format(symbol=sym))
    except Exception as exc:  # noqa: BLE001
        raise ScraperError(f"optioncharts: page fetch failed: {exc}") from exc

    m = _NEXT_RE.search(resp.text)
    if not m:
        raise ScraperError("optioncharts: __NEXT_DATA__ not found")
    try:
        blob = json.loads(m.group(1))
    except json.JSONDecodeError as exc:
        raise ScraperError(f"optioncharts: __NEXT_DATA__ parse failed: {exc}") from exc

    out: dict[str, Any] = {
        "symbol": sym,
        "source": "optioncharts",
        "asOf": now_iso(),
    }
    for label, keys in _TARGET_KEYS.items():
        out[label] = _walk(blob, keys)
    return out
