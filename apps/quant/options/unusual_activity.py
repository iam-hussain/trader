"""Detect unusual options activity and sweep-like prints from a chain snapshot."""
from __future__ import annotations

from typing import Any


def _classify_bid_ask(last: float | None, bid: float | None, ask: float | None) -> str:
    if last is None or bid is None or ask is None:
        return "unknown"
    try:
        last_f = float(last)
        bid_f = float(bid)
        ask_f = float(ask)
    except (TypeError, ValueError):
        return "unknown"
    if bid_f <= 0 and ask_f <= 0:
        return "unknown"
    if last_f > ask_f:
        return "above_ask"
    if last_f < bid_f:
        return "below_bid"
    if abs(last_f - ask_f) < 1e-9:
        return "at_ask"
    if abs(last_f - bid_f) < 1e-9:
        return "at_bid"
    spread = ask_f - bid_f
    if spread > 0:
        midpoint = (bid_f + ask_f) / 2.0
        if abs(last_f - midpoint) <= spread * 0.15:
            return "midpoint"
    return "midpoint"


def _safe_float(v: Any) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _build_row(row: dict, ratio: float, kind: str | None = None) -> dict:
    last = _safe_float(row.get("last"))
    bid = _safe_float(row.get("bid"))
    ask = _safe_float(row.get("ask"))
    volume = _safe_float(row.get("volume")) or 0.0
    premium = (volume * last * 100.0) if last is not None else None
    out = {
        "strike": row.get("strike"),
        "expiry": row.get("expiry"),
        "type": row.get("type"),
        "volume": int(volume),
        "openInterest": int(_safe_float(row.get("openInterest")) or 0),
        "ratio": ratio,
        "premium": premium,
        "bidAsk": _classify_bid_ask(last, bid, ask),
    }
    if kind is not None:
        out["type"] = kind
    return out


def detect_unusual(chain: list[dict], threshold_vol_oi: float = 3.0) -> list[dict]:
    """Flag chain rows where volume/OI exceeds threshold and volume > 100. Sorted desc by ratio."""
    flagged: list[dict] = []
    for row in chain:
        volume = _safe_float(row.get("volume"))
        oi = _safe_float(row.get("openInterest"))
        if volume is None or oi is None or oi <= 0 or volume <= 100:
            continue
        ratio = volume / oi
        if ratio > threshold_vol_oi:
            flagged.append(_build_row(row, ratio))
    flagged.sort(key=lambda r: r["ratio"], reverse=True)
    return flagged


def detect_sweeps(chain: list[dict]) -> list[dict]:
    """Heuristic sweep detector: volume > 5x OI plus aggressive print (above_ask call / below_bid put)."""
    sweeps: list[dict] = []
    for row in chain:
        volume = _safe_float(row.get("volume"))
        oi = _safe_float(row.get("openInterest"))
        if volume is None or oi is None or oi <= 0 or volume <= 100:
            continue
        ratio = volume / oi
        if ratio <= 5.0:
            continue
        last = _safe_float(row.get("last"))
        bid = _safe_float(row.get("bid"))
        ask = _safe_float(row.get("ask"))
        bidask = _classify_bid_ask(last, bid, ask)
        opt_type = str(row.get("type", "")).lower()
        aggressive = (opt_type == "call" and bidask == "above_ask") or (
            opt_type == "put" and bidask == "below_bid"
        )
        if not aggressive:
            continue
        sweeps.append(_build_row(row, ratio, kind="sweep"))
    sweeps.sort(key=lambda r: r["ratio"], reverse=True)
    return sweeps
