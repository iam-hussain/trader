"""Benzinga news via the public RSS feed.

Source: https://www.benzinga.com/feed
Filtered client-side by ticker symbol matches in the title or summary.
"""
from __future__ import annotations

import re
from email.utils import parsedate_to_datetime
from typing import Any

import feedparser

from .common import ScraperError, http_get, now_iso

_FEED_URL = "https://www.benzinga.com/feed"
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
    """Return Benzinga RSS items mentioning ``symbol`` (title or summary)."""
    sym = (symbol or "").strip().upper()
    if not sym:
        raise ScraperError("benzinga: empty symbol")

    try:
        resp = http_get(_FEED_URL, headers={"Accept": "application/rss+xml, application/xml"})
    except Exception as exc:  # noqa: BLE001
        raise ScraperError(f"benzinga: feed fetch failed: {exc}") from exc

    parsed = feedparser.parse(resp.content)
    if parsed.bozo and not parsed.entries:
        raise ScraperError(f"benzinga: feed parse error: {parsed.bozo_exception}")

    needle_re = re.compile(rf"(^|[^A-Z]){re.escape(sym)}([^A-Z]|$)")
    items: list[dict] = []
    for entry in parsed.entries:
        title = (entry.get("title") or "").strip()
        summary = (entry.get("summary") or entry.get("description") or "").strip()
        haystack = f"{title} {summary}"
        tickers = _extract_tickers(haystack)
        if sym not in tickers and not needle_re.search(haystack.upper()):
            continue
        items.append(
            {
                "source": "benzinga",
                "url": entry.get("link") or "",
                "title": title,
                "publishedAt": _published_iso(entry),
                "summary": summary,
                "tickers": tickers,
            }
        )
        if len(items) >= limit:
            break
    return items
