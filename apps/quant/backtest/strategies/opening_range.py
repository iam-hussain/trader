"""Opening-range breakout approximated on daily bars (close vs prior high + ATR buffer)."""

from __future__ import annotations

import numpy as np
import pandas as pd

from .base import Position, Signal, Strategy


def _atr(history: pd.DataFrame, length: int = 14) -> float:
    if len(history) < length + 1:
        return float("nan")
    high = history["High"].astype(float)
    low = history["Low"].astype(float)
    close = history["Close"].astype(float)
    prev_close = close.shift(1)
    tr = pd.concat(
        [(high - low), (high - prev_close).abs(), (low - prev_close).abs()],
        axis=1,
    ).max(axis=1)
    atr = tr.ewm(alpha=1 / length, adjust=False).mean()
    return float(atr.iloc[-1])


class OpeningRangeStrategy(Strategy):
    NAME = "opening_range"
    DESCRIPTION = (
        "30-min opening-range breakout, daily approximation: long when today's close "
        "exceeds prior day's high + atr_buffer * ATR(14). Same-day exit by next bar."
    )
    PARAM_SCHEMA = {
        "range_min": {"type": "int", "default": 30},
        "atr_buffer": {"type": "float", "default": 0.5},
        "rr_target": {"type": "float", "default": 2.0},
    }

    def signal(self, history: pd.DataFrame) -> Signal | None:
        if len(history) < 16:
            return None
        prior_high = float(history["High"].iloc[-2])
        prior_low = float(history["Low"].iloc[-2])
        last_close = float(history["Close"].iloc[-1])
        atr = _atr(history, 14)
        if not np.isfinite(atr) or atr <= 0:
            return None
        threshold = prior_high + float(self.atr_buffer) * atr
        if last_close <= threshold:
            return None
        entry = last_close
        stop = prior_low
        risk = entry - stop
        if risk <= 0:
            return None
        target = entry + float(self.rr_target) * risk
        return Signal(side="long", entry=entry, target=target, stop=stop, reason="orb_break")

    def exit_signal(self, history: pd.DataFrame, position: Position) -> bool:
        # Same-day strategy proxy: exit on next bar regardless.
        return position.bars_held >= 1
