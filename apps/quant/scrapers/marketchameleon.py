"""marketchameleon.com overview page scraper.

Best-effort: returns None for any field that cannot be located rather than
raising, unless the whole page fails to load.
"""
from __future__ import annotations

import re
from typing import Optional

from bs4 import BeautifulSoup

from .common import ScraperError, http_get, now_iso, parse_num, parse_pct

_URL_TMPL = "https://marketchameleon.com/Overview/{symbol}/"


def _find_value(soup: BeautifulSoup, label_re: re.Pattern[str]) -> Optional[str]:
    """Locate a label cell and return the text of the adjacent value cell."""
    for tag in soup.find_all(string=label_re):
        parent = tag.parent
        if parent is None:
            continue
        # Look at next siblings within the same row or container.
        sib = parent.find_next(["td", "span", "div"])
        if sib and sib is not parent:
            txt = sib.get_text(strip=True)
            if txt:
                return txt
    return None


def fetch_overview(symbol: str) -> dict:
    sym = (symbol or "").strip().upper()
    if not sym:
        raise ScraperError("marketchameleon: empty symbol")

    try:
        resp = http_get(_URL_TMPL.format(symbol=sym))
    except Exception as exc:  # noqa: BLE001
        raise ScraperError(f"marketchameleon: page fetch failed: {exc}") from exc

    if resp.status_code >= 400 or not resp.text:
        raise ScraperError(f"marketchameleon: bad response {resp.status_code}")

    soup = BeautifulSoup(resp.text, "html.parser")

    pc_txt = _find_value(soup, re.compile(r"P/?C\s*Ratio", re.I))
    iv_rank_txt = _find_value(soup, re.compile(r"IV\s*Rank", re.I))

    ratio = parse_num(pc_txt) if pc_txt else None
    iv_rank = parse_pct(iv_rank_txt) if iv_rank_txt else None

    page_lower = resp.text.lower()
    unusual = bool(
        re.search(r"unusual\s+option(?:s)?\s+activity", page_lower)
        and re.search(r"unusual.*(yes|detected|flagged|true)", page_lower)
    )

    return {
        "symbol": sym,
        "source": "marketchameleon",
        "asOf": now_iso(),
        "ratio": ratio,
        "ivRank": iv_rank,
        "unusual": unusual,
    }
