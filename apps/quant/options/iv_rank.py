"""IV rank and percentile from a series of historical implied volatilities."""
from __future__ import annotations

from typing import Sequence


def iv_rank(current: float, history: Sequence[float]) -> float | None:
    """Return (current - low) / (high - low) * 100 over history. None if undefined."""
    if current is None or not history:
        return None
    vals = [float(v) for v in history if v is not None]
    if not vals:
        return None
    lo = min(vals)
    hi = max(vals)
    if hi - lo <= 0:
        return None
    return (float(current) - lo) / (hi - lo) * 100.0


def iv_percentile(current: float, history: Sequence[float]) -> float | None:
    """Return percent of historical days where IV was strictly below current."""
    if current is None or not history:
        return None
    vals = [float(v) for v in history if v is not None]
    if not vals:
        return None
    below = sum(1 for v in vals if v < float(current))
    return below / len(vals) * 100.0


def compute_from_history(iv_history: list[dict]) -> dict:
    """Compute ivRank, ivPercentile and 52w stats from a list of {date, iv} rows."""
    if not iv_history:
        return {
            "ivRank": None,
            "ivPercentile": None,
            "currentIv": None,
            "low52w": None,
            "high52w": None,
            "daysObserved": 0,
        }

    rows = [r for r in iv_history if r.get("iv") is not None]
    if not rows:
        return {
            "ivRank": None,
            "ivPercentile": None,
            "currentIv": None,
            "low52w": None,
            "high52w": None,
            "daysObserved": 0,
        }

    rows_sorted = sorted(rows, key=lambda r: str(r.get("date", "")))
    current = float(rows_sorted[-1]["iv"])
    values = [float(r["iv"]) for r in rows_sorted]

    if len(values) == 1:
        return {
            "ivRank": None,
            "ivPercentile": None,
            "currentIv": current,
            "low52w": current,
            "high52w": current,
            "daysObserved": 1,
        }

    return {
        "ivRank": iv_rank(current, values),
        "ivPercentile": iv_percentile(current, values),
        "currentIv": current,
        "low52w": min(values),
        "high52w": max(values),
        "daysObserved": len(values),
    }
