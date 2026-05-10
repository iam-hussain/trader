"""EMA fast/slow crossover strategy."""

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
    # Wilder smoothing == EMA with alpha = 1/length
    atr = tr.ewm(alpha=1 / length, adjust=False).mean()
    return float(atr.iloc[-1])


class EmaCrossoverStrategy(Strategy):
    NAME = "ema_crossover"
    DESCRIPTION = "Long when fast EMA crosses above slow EMA; ATR-based stops/targets."
    PARAM_SCHEMA = {
        "fast": {"type": "int", "default": 20},
        "slow": {"type": "int", "default": 50},
        "atr_stop_mult": {"type": "float", "default": 2.0},
        "target_atr_mult": {"type": "float", "default": 4.0},
    }

    def signal(self, history: pd.DataFrame) -> Signal | None:
        if len(history) < max(self.slow, 15) + 2:
            return None
        close = history["Close"].astype(float)
        fast = close.ewm(span=int(self.fast), adjust=False).mean()
        slow = close.ewm(span=int(self.slow), adjust=False).mean()
        if len(fast) < 2:
            return None
        crossed_up = fast.iloc[-2] <= slow.iloc[-2] and fast.iloc[-1] > slow.iloc[-1]
        if not crossed_up:
            return None
        atr = _atr(history, 14)
        if not np.isfinite(atr) or atr <= 0:
            return None
        entry = float(close.iloc[-1])
        stop = entry - float(self.atr_stop_mult) * atr
        target = entry + float(self.target_atr_mult) * atr
        return Signal(side="long", entry=entry, target=target, stop=stop, reason="ema_cross_up")

    def exit_signal(self, history: pd.DataFrame, position: Position) -> bool:
        if len(history) < max(self.slow, 2):
            return False
        close = history["Close"].astype(float)
        fast = close.ewm(span=int(self.fast), adjust=False).mean()
        slow = close.ewm(span=int(self.slow), adjust=False).mean()
        if len(fast) < 2:
            return False
        # Exit on opposite cross
        if position.side == "long":
            return fast.iloc[-2] >= slow.iloc[-2] and fast.iloc[-1] < slow.iloc[-1]
        return fast.iloc[-2] <= slow.iloc[-2] and fast.iloc[-1] > slow.iloc[-1]
