"""Finviz — free fundamentals snapshot + headline news per ticker."""
from __future__ import annotations

from typing import Any
from bs4 import BeautifulSoup

from .common import ScraperError, http_get, now_iso, parse_num, parse_pct


def fetch_snapshot(symbol: str) -> dict[str, Any]:
    """Return the Finviz 'snapshot' table — RSI, ATR, IV-rank, short %, beta etc."""
    url = f"https://finviz.com/quote.ashx?t={symbol}&p=d"
    r = http_get(url)
    if r.status_code != 200:
        raise ScraperError(f"finviz {r.status_code} for {symbol}")
    soup = BeautifulSoup(r.text, "lxml")
    tbl = soup.select_one("table.snapshot-table2")
    if not tbl:
        raise ScraperError(f"finviz: no snapshot table for {symbol}")

    cells = [td.get_text(strip=True) for td in tbl.find_all("td")]
    pairs = dict(zip(cells[::2], cells[1::2]))

    def num(k: str) -> Any:
        return parse_num(pairs.get(k, ""))

    def pct(k: str) -> Any:
        return parse_pct(pairs.get(k, ""))

    return {
        "symbol": symbol,
        "marketCap": num("Market Cap"),
        "pe": num("P/E"),
        "forwardPe": num("Forward P/E"),
        "eps": num("EPS (ttm)"),
        "rsi14": num("RSI (14)"),
        "atr": num("ATR (14)"),
        "beta": num("Beta"),
        "shortPct": pct("Short Float"),
        "instOwn": pct("Inst Own"),
        "insiderOwn": pct("Insider Own"),
        "perfWeek": pct("Perf Week"),
        "perfMonth": pct("Perf Month"),
        "perfYtd": pct("Perf YTD"),
        "high52w": num("52W High"),
        "low52w": num("52W Low"),
        "avgVolume": num("Avg Volume"),
        "earnings": pairs.get("Earnings"),
        "asOf": now_iso(),
        "source": "finviz",
    }


def fetch_news(symbol: str, limit: int = 25) -> list[dict[str, Any]]:
    url = f"https://finviz.com/quote.ashx?t={symbol}&p=d"
    r = http_get(url)
    if r.status_code != 200:
        return []
    soup = BeautifulSoup(r.text, "lxml")
    rows = soup.select("table.fullview-news-outer tr") or []
    out: list[dict[str, Any]] = []
    for tr in rows[:limit]:
        tds = tr.find_all("td")
        if len(tds) < 2:
            continue
        when = tds[0].get_text(strip=True)
        a = tds[1].find("a")
        span = tds[1].find("span")
        if not a:
            continue
        out.append({
            "source": (span.get_text(strip=True) if span else "").strip("()") or "Finviz",
            "url": a.get("href"),
            "title": a.get_text(strip=True),
            "publishedAt": when,
            "tickers": [symbol],
        })
    return out
