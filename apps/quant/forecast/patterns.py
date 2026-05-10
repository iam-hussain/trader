"""Pure-Python candlestick pattern detection + simple historical edge stats.

No TA-Lib dependency. Each detector takes numpy arrays of OHLC and a bar index
and returns a bool. The public `detect_patterns` runs every detector across
the lookback window and pairs each detection with a 5-day forward edge
computed over the past ~5 years on the same symbol.
"""
from __future__ import annotations

from typing import Any, Callable

import numpy as np
import pandas as pd

from indicators.technicals import fetch_ohlcv
from scrapers.common import now_iso

from .common import safe_float


# ── Single-bar helpers ──────────────────────────────────────────────────────
def _body(o: float, c: float) -> float:
    return abs(c - o)


def _range(h: float, l: float) -> float:
    return max(h - l, 1e-12)


def _upper_wick(o: float, h: float, c: float) -> float:
    return h - max(o, c)


def _lower_wick(o: float, l: float, c: float) -> float:
    return min(o, c) - l


def _is_bull(o: float, c: float) -> bool:
    return c > o


def _is_bear(o: float, c: float) -> bool:
    return c < o


# ── Pattern detectors (all take O,H,L,C arrays + index i) ───────────────────
def doji(O: np.ndarray, H: np.ndarray, L: np.ndarray, C: np.ndarray, i: int) -> bool:
    if i < 0 or i >= len(C):
        return False
    return _body(O[i], C[i]) <= 0.1 * _range(H[i], L[i])


def hammer(O: np.ndarray, H: np.ndarray, L: np.ndarray, C: np.ndarray, i: int) -> bool:
    if i < 1:
        return False
    body = _body(O[i], C[i])
    rng = _range(H[i], L[i])
    if body > 0.35 * rng:
        return False
    lower = _lower_wick(O[i], L[i], C[i])
    upper = _upper_wick(O[i], H[i], C[i])
    if lower < 2 * body or upper > body:
        return False
    # Only count as a hammer in a downtrend (prior close lower than ~5 bars ago).
    if i >= 5 and C[i - 1] >= C[i - 5]:
        return False
    return True


def shooting_star(O: np.ndarray, H: np.ndarray, L: np.ndarray, C: np.ndarray, i: int) -> bool:
    if i < 1:
        return False
    body = _body(O[i], C[i])
    rng = _range(H[i], L[i])
    if body > 0.35 * rng:
        return False
    upper = _upper_wick(O[i], H[i], C[i])
    lower = _lower_wick(O[i], L[i], C[i])
    if upper < 2 * body or lower > body:
        return False
    if i >= 5 and C[i - 1] <= C[i - 5]:
        return False
    return True


def bullish_engulfing(O: np.ndarray, H: np.ndarray, L: np.ndarray, C: np.ndarray, i: int) -> bool:
    if i < 1:
        return False
    return (
        _is_bear(O[i - 1], C[i - 1])
        and _is_bull(O[i], C[i])
        and O[i] <= C[i - 1]
        and C[i] >= O[i - 1]
        and _body(O[i], C[i]) > _body(O[i - 1], C[i - 1])
    )


def bearish_engulfing(O: np.ndarray, H: np.ndarray, L: np.ndarray, C: np.ndarray, i: int) -> bool:
    if i < 1:
        return False
    return (
        _is_bull(O[i - 1], C[i - 1])
        and _is_bear(O[i], C[i])
        and O[i] >= C[i - 1]
        and C[i] <= O[i - 1]
        and _body(O[i], C[i]) > _body(O[i - 1], C[i - 1])
    )


def morning_star(O: np.ndarray, H: np.ndarray, L: np.ndarray, C: np.ndarray, i: int) -> bool:
    if i < 2:
        return False
    b1 = _body(O[i - 2], C[i - 2])
    b2 = _body(O[i - 1], C[i - 1])
    b3 = _body(O[i], C[i])
    if not _is_bear(O[i - 2], C[i - 2]):
        return False
    if b2 > 0.5 * b1:  # middle bar should be small
        return False
    if not _is_bull(O[i], C[i]):
        return False
    if b3 < 0.5 * b1:
        return False
    midpoint = (O[i - 2] + C[i - 2]) / 2.0
    return C[i] > midpoint


def evening_star(O: np.ndarray, H: np.ndarray, L: np.ndarray, C: np.ndarray, i: int) -> bool:
    if i < 2:
        return False
    b1 = _body(O[i - 2], C[i - 2])
    b2 = _body(O[i - 1], C[i - 1])
    b3 = _body(O[i], C[i])
    if not _is_bull(O[i - 2], C[i - 2]):
        return False
    if b2 > 0.5 * b1:
        return False
    if not _is_bear(O[i], C[i]):
        return False
    if b3 < 0.5 * b1:
        return False
    midpoint = (O[i - 2] + C[i - 2]) / 2.0
    return C[i] < midpoint


def three_white_soldiers(O: np.ndarray, H: np.ndarray, L: np.ndarray, C: np.ndarray, i: int) -> bool:
    if i < 2:
        return False
    for k in (i - 2, i - 1, i):
        if not _is_bull(O[k], C[k]):
            return False
        if _body(O[k], C[k]) < 0.5 * _range(H[k], L[k]):
            return False
    return C[i] > C[i - 1] > C[i - 2] and O[i] > O[i - 1] > O[i - 2]


def three_black_crows(O: np.ndarray, H: np.ndarray, L: np.ndarray, C: np.ndarray, i: int) -> bool:
    if i < 2:
        return False
    for k in (i - 2, i - 1, i):
        if not _is_bear(O[k], C[k]):
            return False
        if _body(O[k], C[k]) < 0.5 * _range(H[k], L[k]):
            return False
    return C[i] < C[i - 1] < C[i - 2] and O[i] < O[i - 1] < O[i - 2]


def inside_bar(O: np.ndarray, H: np.ndarray, L: np.ndarray, C: np.ndarray, i: int) -> bool:
    if i < 1:
        return False
    return H[i] < H[i - 1] and L[i] > L[i - 1]


def outside_bar(O: np.ndarray, H: np.ndarray, L: np.ndarray, C: np.ndarray, i: int) -> bool:
    if i < 1:
        return False
    return H[i] > H[i - 1] and L[i] < L[i - 1]


def pin_bar(O: np.ndarray, H: np.ndarray, L: np.ndarray, C: np.ndarray, i: int) -> bool:
    if i < 0 or i >= len(C):
        return False
    body = _body(O[i], C[i])
    rng = _range(H[i], L[i])
    if body > 0.33 * rng:
        return False
    upper = _upper_wick(O[i], H[i], C[i])
    lower = _lower_wick(O[i], L[i], C[i])
    return upper > 2 * body or lower > 2 * body


PatternFn = Callable[[np.ndarray, np.ndarray, np.ndarray, np.ndarray, int], bool]

PATTERNS: dict[str, PatternFn] = {
    "bullish_engulfing": bullish_engulfing,
    "bearish_engulfing": bearish_engulfing,
    "hammer": hammer,
    "shooting_star": shooting_star,
    "morning_star": morning_star,
    "evening_star": evening_star,
    "doji": doji,
    "three_white_soldiers": three_white_soldiers,
    "three_black_crows": three_black_crows,
    "inside_bar": inside_bar,
    "outside_bar": outside_bar,
    "pin_bar": pin_bar,
}


def _compute_edge(
    fn: PatternFn,
    O: np.ndarray,
    H: np.ndarray,
    L: np.ndarray,
    C: np.ndarray,
    horizon: int = 5,
) -> dict[str, Any]:
    """Historical 5-day-forward edge for a pattern over the supplied bars."""
    n = len(C)
    hits = 0
    wins = 0
    rets: list[float] = []
    for i in range(n - horizon):
        try:
            if fn(O, H, L, C, i):
                fwd = (C[i + horizon] - C[i]) / C[i]
                rets.append(float(fwd))
                hits += 1
                if fwd > 0:
                    wins += 1
        except Exception:  # noqa: BLE001
            continue
    if hits == 0:
        return {"winRate": 0.0, "meanReturnPct": 0.0, "n": 0}
    return {
        "winRate": safe_float(wins / hits),
        "meanReturnPct": safe_float(float(np.mean(rets)) * 100.0),
        "n": int(hits),
    }


def detect_patterns(symbol: str, lookback_days: int = 60) -> dict[str, Any]:
    """Detect candlestick patterns over the last `lookback_days` bars.

    For each detection in the recent window, we attach an `edge5d` block —
    the historical win-rate and mean 5-day forward return for the same
    pattern over the past ~5 years on the same symbol.
    """
    df = fetch_ohlcv(symbol, period="5y", interval="1d")
    if df.empty or any(c not in df.columns for c in ("Open", "High", "Low", "Close")):
        return {
            "symbol": symbol,
            "asOf": now_iso(),
            "lookbackDays": int(lookback_days),
            "detections": [],
        }

    O = df["Open"].astype(float).to_numpy()
    H = df["High"].astype(float).to_numpy()
    L = df["Low"].astype(float).to_numpy()
    C = df["Close"].astype(float).to_numpy()
    dates = [pd.Timestamp(ts).strftime("%Y-%m-%d") for ts in df.index]

    n = len(C)
    start = max(0, n - int(lookback_days))

    # Pre-compute historical edge for each pattern over the full 5-year window.
    edge_cache: dict[str, dict[str, Any]] = {
        name: _compute_edge(fn, O, H, L, C) for name, fn in PATTERNS.items()
    }

    detections: list[dict[str, Any]] = []
    for i in range(start, n):
        for name, fn in PATTERNS.items():
            try:
                if fn(O, H, L, C, i):
                    detections.append({
                        "pattern": name,
                        "date": dates[i],
                        "barClose": safe_float(C[i]),
                        "edge5d": edge_cache[name],
                    })
            except Exception:  # noqa: BLE001
                continue

    # Most-recent-first ordering is friendlier in UIs.
    detections.sort(key=lambda d: d["date"], reverse=True)

    return {
        "symbol": symbol,
        "asOf": now_iso(),
        "lookbackDays": int(lookback_days),
        "detections": detections,
    }
