"""Shared HTTP client + helpers for scrapers.

- Per-host token-bucket rate limiting (default 1 req/sec per host)
- Tenacity retry on 429/5xx
- Standard browser UA (some sites reject curl-style UAs)
- Single shared httpx client (HTTP/2, connection pooling)
"""
from __future__ import annotations

import os
import threading
import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import urlparse

import httpx
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)


class ScraperError(Exception):
    """Raised when a scraper cannot reasonably extract its target field."""


_UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/127.0 Safari/537.36"
)


def _sec_user_agent() -> str:
    """SEC requires a contact UA; fall back to a generic one for dev."""
    return os.environ.get("SEC_EDGAR_USER_AGENT") or "trader-daily contact@example.com"


_client: Optional[httpx.Client] = None
_client_lock = threading.Lock()


def client() -> httpx.Client:
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                _client = httpx.Client(
                    http2=True,
                    timeout=httpx.Timeout(15.0, connect=8.0),
                    headers={
                        "User-Agent": _UA,
                        "Accept-Language": "en-US,en;q=0.9",
                    },
                    follow_redirects=True,
                )
    return _client


# ── Per-host rate limiting ──────────────────────────────────────────────────
_last_hit: dict[str, float] = defaultdict(float)
_rate_lock = threading.Lock()
_DEFAULT_INTERVAL = 1.0  # 1 req/sec/host
_HOST_INTERVAL: dict[str, float] = {
    "data.sec.gov": 0.12,        # SEC allows 10/sec with proper UA
    "www.sec.gov": 0.12,
    "query1.finance.yahoo.com": 0.3,
    "api.stlouisfed.org": 0.5,
    "www.cboe.com": 1.0,
    "openinsider.com": 1.5,      # be polite
    "www.barchart.com": 2.0,
    "www.marketchameleon.com": 2.0,
    "optioncharts.io": 2.0,
}


def _host(url: str) -> str:
    return urlparse(url).hostname or ""


def _throttle(url: str) -> None:
    host = _host(url)
    interval = _HOST_INTERVAL.get(host, _DEFAULT_INTERVAL)
    with _rate_lock:
        wait = interval - (time.monotonic() - _last_hit[host])
        if wait > 0:
            time.sleep(wait)
        _last_hit[host] = time.monotonic()


@retry(
    reraise=True,
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=0.6, min=0.6, max=4),
    retry=retry_if_exception_type((httpx.TransportError, httpx.HTTPStatusError)),
)
def http_get(url: str, headers: Optional[dict[str, str]] = None, **kwargs: Any) -> httpx.Response:
    _throttle(url)
    h = dict(headers or {})
    if "sec.gov" in (_host(url) or ""):
        h["User-Agent"] = _sec_user_agent()
        h.setdefault("Accept-Encoding", "gzip, deflate")
    r = client().get(url, headers=h, **kwargs)
    if r.status_code == 429 or r.status_code >= 500:
        r.raise_for_status()
    return r


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_pct(s: str) -> Optional[float]:
    s = (s or "").strip().replace(",", "").rstrip("%")
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def parse_num(s: str) -> Optional[float]:
    s = (s or "").strip().replace(",", "")
    if not s or s in {"-", "N/A", "—"}:
        return None
    mult = 1.0
    if s[-1] in "KMB":
        mult = {"K": 1e3, "M": 1e6, "B": 1e9}[s[-1]]
        s = s[:-1]
    try:
        return float(s) * mult
    except ValueError:
        return None
