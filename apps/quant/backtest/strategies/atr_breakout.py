"""20-day Donchian breakout long with ATR stops/targets."""

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


class AtrBreakoutStrategy(Strategy):
    NAME = "atr_breakout"
    DESCRIPTION = "Long when close breaks N-day Donchian high. Stops/targets in ATR multiples."
    PARAM_SCHEMA = {
        "lookback": {"type": "int", "default": 20},
        "atr_stop_mult": {"type": "float", "default": 2.0},
        "target_atr_mult": {"type": "float", "default": 4.0},
    }

    def signal(self, history: pd.DataFrame) -> Signal | None:
        lookback = int(self.lookback)
        if len(history) < lookback + 15:
            return None
        close = history["Close"].astype(float)
        prior = history["High"].astype(float).iloc[-(lookback + 1): -1]
        if prior.empty:
            return None
        donchian_high = float(prior.max())
        last_close = float(close.iloc[-1])
        if last_close <= donchian_high:
            return None
        atr = _atr(history, 14)
        if not np.isfinite(atr) or atr <= 0:
            return None
        entry = last_close
        stop = entry - float(self.atr_stop_mult) * atr
        target = entry + float(self.target_atr_mult) * atr
        return Signal(side="long", entry=entry, target=target, stop=stop, reason="donchian_break")

    def exit_signal(self, history: pd.DataFrame, position: Position) -> bool:
        # Trail handled by stop; allow strategy to exit on a Donchian-low break.
        lookback = int(self.lookback)
        if len(history) < lookback + 1:
            return False
        prior_low = float(history["Low"].astype(float).iloc[-(lookback + 1): -1].min())
        return float(history["Close"].iloc[-1]) < prior_low
