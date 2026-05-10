"""St. Louis Fed FRED API client.

Requires FRED_API_KEY in the environment.
Docs: https://fred.stlouisfed.org/docs/api/fred/
"""
from __future__ import annotations

import os
from typing import Optional

from .common import ScraperError, http_get

_BASE = "https://api.stlouisfed.org/fred/series/observations"


def _api_key() -> str:
    key = os.environ.get("FRED_API_KEY")
    if not key:
        raise ScraperError("fred: FRED_API_KEY not set")
    return key


def fetch_series(series_id: str, limit: int = 1) -> list[dict]:
    """Return latest ``limit`` observations for ``series_id`` as
    ``[{"date": "YYYY-MM-DD", "value": float | None}, ...]``."""
    sid = (series_id or "").strip()
    if not sid:
        raise ScraperError("fred: empty series_id")

    url = (
        f"{_BASE}?series_id={sid}&api_key={_api_key()}"
        f"&file_type=json&sort_order=desc&limit={int(limit)}"
    )
    try:
        resp = http_get(url, headers={"Accept": "application/json"})
        data = resp.json()
    except Exception as exc:  # noqa: BLE001
        raise ScraperError(f"fred: request failed: {exc}") from exc

    obs = data.get("observations")
    if not isinstance(obs, list):
        raise ScraperError("fred: missing observations in response")

    out: list[dict] = []
    for row in obs:
        raw = row.get("value")
        try:
            value: Optional[float] = float(raw) if raw not in (None, ".", "") else None
        except (TypeError, ValueError):
            value = None
        out.append({"date": row.get("date"), "value": value})
    return out


def fetch_risk_free_rate() -> Optional[float]:
    """Latest 3-month T-bill (DGS3MO) as a decimal (e.g. 0.0525)."""
    rows = fetch_series("DGS3MO", limit=1)
    if not rows:
        return None
    val = rows[0].get("value")
    if val is None:
        return None
    return float(val) / 100.0
