"""CBOE — official source for total market & equity-only put/call ratios.

Data is published as plain CSVs at fixed URLs. We fetch the latest row.
"""
from __future__ import annotations

import csv
import io
from typing import Any

from .common import ScraperError, http_get, now_iso

# CBOE publishes two key CSVs daily; the URLs are stable.
_TOTAL_URL = "https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv"
_PC_TOTAL_URL = "https://cdn.cboe.com/data/us/options/market_statistics/historical_data/index_options_volume_daily.csv"
_PC_EQUITY_URL = "https://cdn.cboe.com/data/us/options/market_statistics/historical_data/equity_options_volume_daily.csv"


def _last_row(url: str) -> dict[str, str]:
    r = http_get(url)
    if r.status_code != 200:
        raise ScraperError(f"cboe {r.status_code}: {url}")
    rows = list(csv.DictReader(io.StringIO(r.text)))
    if not rows:
        raise ScraperError(f"cboe: empty CSV {url}")
    return rows[-1]


def fetch_market_put_call() -> list[dict[str, Any]]:
    """Returns reconciled rows for index P/C and equity P/C from CBOE."""
    out: list[dict[str, Any]] = []
    for kind, url in (("index", _PC_TOTAL_URL), ("equity", _PC_EQUITY_URL)):
        try:
            row = _last_row(url)
        except ScraperError:
            continue
        # Column names vary; pick by keyword match.
        keys = {k.lower(): k for k in row.keys()}
        call_col = next((row[keys[k]] for k in keys if "call" in k and "vol" in k), None)
        put_col = next((row[keys[k]] for k in keys if "put" in k and "vol" in k), None)
        ratio_col = next((row[keys[k]] for k in keys if "p/c" in k or "putcall" in k.replace(" ", "")), None)
        try:
            cv = float((call_col or "").replace(",", ""))
            pv = float((put_col or "").replace(",", ""))
            ratio = float((ratio_col or "").replace(",", "")) if ratio_col else (pv / cv if cv else 0.0)
        except (TypeError, ValueError):
            continue
        out.append({
            "kind": kind,
            "ratio": ratio,
            "callVolume": cv,
            "putVolume": pv,
            "source": "cboe",
            "asOf": now_iso(),
        })
    return out


def fetch_vix_latest() -> dict[str, Any]:
    """Latest VIX close from CBOE history CSV."""
    row = _last_row(_TOTAL_URL)
    keys = {k.lower(): k for k in row.keys()}
    close_key = next((keys[k] for k in keys if "close" in k), None)
    date_key = next((keys[k] for k in keys if "date" in k), None)
    if not close_key:
        raise ScraperError("cboe vix: no close column")
    return {
        "vix": float(row[close_key]),
        "date": row.get(date_key, ""),
        "source": "cboe",
        "asOf": now_iso(),
    }
