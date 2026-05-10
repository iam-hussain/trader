"""Google News RSS search for a ticker.

Source: https://news.google.com/rss/search
"""
from __future__ import annotations

import re
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import quote_plus

import feedparser

from .common import ScraperError, http_get, now_iso

_URL_TMPL = (
    "https://news.google.com/rss/search?q={q}+stock&hl=en-US&gl=US&ceid=US:en"
)
_TICKER_RE = re.compile(r"\$?\b([A-Z]{1,5})\b")


def _published_iso(entry: Any) -> str:
    raw = entry.get("published") or entry.get("updated") or ""
    if raw:
        try:
            dt = parsedate_to_datetime(raw)
            if dt is not None:
                return dt.isoformat()
        except (TypeError, ValueError):
            pass
    return now_iso()


def _extract_tickers(text: str) -> list[str]:
    if not text:
        return []
    seen: list[str] = []
    for m in _TICKER_RE.finditer(text):
        sym = m.group(1)
        if sym not in seen:
            seen.append(sym)
    return seen


def fetch_news(symbol: str, limit: int = 25) -> list[dict]:
    """Return Google News RSS items for ``symbol``."""
    sym = (symbol or "").strip().upper()
    if not sym:
        raise ScraperError("googlenews: empty symbol")

    url = _URL_TMPL.format(q=quote_plus(sym))
    try:
        resp = http_get(url, headers={"Accept": "application/rss+xml, application/xml"})
    except Exception as exc:  # noqa: BLE001
        raise ScraperError(f"googlenews: feed fetch failed: {exc}") from exc

    parsed = feedparser.parse(resp.content)
    if parsed.bozo and not parsed.entries:
        raise ScraperError(f"googlenews: feed parse error: {parsed.bozo_exception}")

    items: list[dict] = []
    for entry in parsed.entries[:limit]:
        title = (entry.get("title") or "").strip()
        summary = (entry.get("summary") or entry.get("description") or "").strip()
        items.append(
            {
                "source": "googlenews",
                "url": entry.get("link") or "",
                "title": title,
                "publishedAt": _published_iso(entry),
                "summary": summary,
                "tickers": _extract_tickers(f"{title} {summary}") or [sym],
            }
        )
    return items
