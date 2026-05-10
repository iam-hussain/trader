"""Max-pain calculation: strike at which option holders' aggregate loss is minimized."""
from __future__ import annotations

from typing import Any


def _safe_float(v: Any) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def compute_max_pain(chain: list[dict], expiry: str) -> dict:
    """Compute max-pain strike for one expiry. Loss is summed call+put intrinsic at each candidate K."""
    rows = [r for r in chain if str(r.get("expiry")) == str(expiry)]
    if not rows:
        return {
            "expiry": expiry,
            "maxPain": None,
            "totalCallOI": 0,
            "totalPutOI": 0,
            "byStrike": [],
        }

    calls: list[tuple[float, float]] = []
    puts: list[tuple[float, float]] = []
    strikes_set: set[float] = set()

    for r in rows:
        K = _safe_float(r.get("strike"))
        oi = _safe_float(r.get("openInterest"))
        if K is None or oi is None or oi < 0:
            continue
        opt_type = str(r.get("type", "")).lower()
        strikes_set.add(K)
        if opt_type == "call":
            calls.append((K, oi))
        elif opt_type == "put":
            puts.append((K, oi))

    if not strikes_set:
        return {
            "expiry": expiry,
            "maxPain": None,
            "totalCallOI": 0,
            "totalPutOI": 0,
            "byStrike": [],
        }

    candidates = sorted(strikes_set)
    by_strike: list[dict] = []
    for K in candidates:
        loss = 0.0
        for k_call, oi_call in calls:
            if K > k_call:
                loss += (K - k_call) * oi_call
        for k_put, oi_put in puts:
            if k_put > K:
                loss += (k_put - K) * oi_put
        by_strike.append({"strike": K, "totalLoss": loss})

    min_row = min(by_strike, key=lambda x: x["totalLoss"])
    total_call_oi = sum(oi for _, oi in calls)
    total_put_oi = sum(oi for _, oi in puts)

    return {
        "expiry": expiry,
        "maxPain": float(min_row["strike"]),
        "totalCallOI": total_call_oi,
        "totalPutOI": total_put_oi,
        "byStrike": by_strike,
    }


def compute_for_expiries(chain: list[dict], expiries: list[str]) -> list[dict]:
    """Compute max-pain for each given expiry."""
    return [compute_max_pain(chain, e) for e in expiries]
