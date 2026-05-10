"""openinsider.com per-ticker insider transactions screener.

Parses the table.tinytable on the screener page. Note: the source uses
plain HTTP, not HTTPS.
"""
from __future__ import annotations

from typing import Optional
from urllib.parse import quote_plus

from bs4 import BeautifulSoup

from .common import ScraperError, http_get, now_iso, parse_num, parse_pct  # noqa: F401

_URL_TMPL = (
    "http://openinsider.com/screener?s={symbol}&o=&pl=&ph=&ll=&lh=&fd=730&fdr="
    "&td=0&tdr=&fdlyl=&fdlyh=&daysago=&xp=1&xs=1&vl=&vh=&ocl=&och=&sic1=-1"
    "&sicl=100&sich=9999&grp=0&nfl=&nfh=&nil=&nih=&nol=&noh=&v2l=&v2h=&oc2l="
    "&oc2h=&sortcol=0&cnt=100&page=1"
)

# Column order on the screener table (as rendered today). The first column is
# an "X" filing-detail link, so data starts at index 1.
_COLS = [
    "_x",
    "filingDate",
    "tradeDate",
    "ticker",
    "insiderName",
    "title",
    "tradeType",
    "price",
    "qty",
    "ownership",
    "deltaOwn",
    "value",
]


def _cell(row, idx: int) -> Optional[str]:
    cells = row.find_all("td")
    if idx >= len(cells):
        return None
    return cells[idx].get_text(strip=True) or None


def _money(s: Optional[str]) -> Optional[float]:
    if not s:
        return None
    cleaned = s.replace("$", "").replace("+", "").replace(",", "").strip()
    if not cleaned or cleaned in {"-", "N/A"}:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return parse_num(cleaned)


def fetch_insider_transactions(symbol: str, limit: int = 50) -> list[dict]:
    sym = (symbol or "").strip().upper()
    if not sym:
        raise ScraperError("openinsider: empty symbol")

    try:
        resp = http_get(_URL_TMPL.format(symbol=quote_plus(sym)))
    except Exception as exc:  # noqa: BLE001
        raise ScraperError(f"openinsider: fetch failed: {exc}") from exc

    soup = BeautifulSoup(resp.text, "html.parser")
    table = soup.find("table", class_="tinytable")
    if table is None:
        raise ScraperError("openinsider: tinytable not found")

    body = table.find("tbody") or table
    rows = body.find_all("tr")

    out: list[dict] = []
    for row in rows:
        tds = row.find_all("td")
        if len(tds) < len(_COLS):
            continue  # header/spacer rows
        item = {
            "filingDate": _cell(row, _COLS.index("filingDate")),
            "tradeDate": _cell(row, _COLS.index("tradeDate")),
            "ticker": _cell(row, _COLS.index("ticker")),
            "insiderName": _cell(row, _COLS.index("insiderName")),
            "title": _cell(row, _COLS.index("title")),
            "tradeType": _cell(row, _COLS.index("tradeType")),
            "price": _money(_cell(row, _COLS.index("price"))),
            "qty": _money(_cell(row, _COLS.index("qty"))),
            "ownership": _money(_cell(row, _COLS.index("ownership"))),
            "deltaOwn": parse_pct(_cell(row, _COLS.index("deltaOwn")) or ""),
            "value": _money(_cell(row, _COLS.index("value"))),
        }
        out.append(item)
        if len(out) >= limit:
            break
    return out
