"""SEC EDGAR official endpoints.

- CIK lookup via the EDGAR atom feed (cgi-bin/browse-edgar)
- Recent filings via data.sec.gov/submissions/CIK{cik}.json
- Form 4 (insider transactions) is filtered from the recent filings list.

Requires SEC_EDGAR_USER_AGENT for proper compliance; common.http_get wires
this header for sec.gov hosts automatically.
"""
from __future__ import annotations

import re
from typing import Optional
from xml.etree import ElementTree as ET

from .common import ScraperError, http_get, now_iso  # noqa: F401

_BROWSE_URL = (
    "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={symbol}"
    "&type=&dateb=&owner=include&count=40&output=atom"
)
_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"
_DOC_URL = "https://www.sec.gov/Archives/edgar/data/{cik_int}/{acc_nodash}/{doc}"

_cik_cache: dict[str, str] = {}


def _resolve_cik(symbol: str) -> str:
    sym = symbol.strip().upper()
    if sym in _cik_cache:
        return _cik_cache[sym]

    try:
        resp = http_get(_BROWSE_URL.format(symbol=sym))
    except Exception as exc:  # noqa: BLE001
        raise ScraperError(f"sec_edgar: CIK lookup failed: {exc}") from exc

    text = resp.text
    m = re.search(r"CIK=(\d{6,10})", text)
    if not m:
        # Atom feed sometimes nests CIK inside an <id>
        try:
            root = ET.fromstring(text)
        except ET.ParseError:
            root = None
        if root is not None:
            for el in root.iter():
                if el.text and (m2 := re.search(r"(\d{10})", el.text)):
                    m = m2
                    break
    if not m:
        raise ScraperError(f"sec_edgar: could not resolve CIK for {sym}")

    cik = m.group(1).zfill(10)
    _cik_cache[sym] = cik
    return cik


def fetch_recent_filings(symbol: str, limit: int = 20) -> list[dict]:
    cik = _resolve_cik(symbol)
    try:
        resp = http_get(_SUBMISSIONS_URL.format(cik=cik))
        payload = resp.json()
    except Exception as exc:  # noqa: BLE001
        raise ScraperError(f"sec_edgar: submissions fetch failed: {exc}") from exc

    recent = (payload.get("filings") or {}).get("recent") or {}
    forms = recent.get("form") or []
    dates = recent.get("filingDate") or []
    accs = recent.get("accessionNumber") or []
    docs = recent.get("primaryDocument") or []
    descs = recent.get("primaryDocDescription") or []

    cik_int = str(int(cik))
    out: list[dict] = []
    for i in range(min(len(forms), limit)):
        acc = accs[i] if i < len(accs) else ""
        doc = docs[i] if i < len(docs) else ""
        url = ""
        if acc and doc:
            url = _DOC_URL.format(
                cik_int=cik_int, acc_nodash=acc.replace("-", ""), doc=doc
            )
        out.append(
            {
                "form": forms[i],
                "filedAt": dates[i] if i < len(dates) else None,
                "accessionNumber": acc,
                "primaryDocument": doc,
                "primaryDocDescription": descs[i] if i < len(descs) else None,
                "url": url,
            }
        )
    return out


def fetch_form4_insider_transactions(symbol: str, limit: int = 20) -> list[dict]:
    """Return Form 4 filing metadata. Body XML parsing is left to a later phase."""
    # Pull a generous slice so we get enough Form 4 hits after filtering.
    raw = fetch_recent_filings(symbol, limit=max(limit * 5, 40))
    out: list[dict] = []
    for f in raw:
        if (f.get("form") or "").strip() != "4":
            continue
        item = dict(f)
        # primaryDocDescription often contains the filer name for Form 4.
        item["filerName"] = f.get("primaryDocDescription")
        out.append(item)
        if len(out) >= limit:
            break
    return out


def _clear_cache() -> None:
    """Test/maintenance helper."""
    _cik_cache.clear()
