"""RSI(14) mean-reversion long-only strategy with 200 EMA trend filter."""

from __future__ import annotations

import numpy as np
import pandas as pd

from .base import Position, Signal, Strategy


def _rsi(close: pd.Series, length: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)
    avg_gain = gain.ewm(alpha=1 / length, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / length, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi.fillna(50.0)


class RsiMeanReversionStrategy(Strategy):
    NAME = "rsi_mean_reversion"
    DESCRIPTION = "Long when RSI(14) < oversold AND price > 200 EMA; exit on RSI > 60 or stop."
    PARAM_SCHEMA = {
        "oversold": {"type": "float", "default": 30.0},
        "rsi_exit": {"type": "float", "default": 60.0},
        "target_pct": {"type": "float", "default": 3.0},
        "stop_pct": {"type": "float", "default": 2.0},
    }

    def signal(self, history: pd.DataFrame) -> Signal | None:
        if len(history) < 210:
            return None
        close = history["Close"].astype(float)
        rsi = _rsi(close, 14)
        ema200 = close.ewm(span=200, adjust=False).mean()
        last_close = float(close.iloc[-1])
        last_rsi = float(rsi.iloc[-1])
        if not np.isfinite(last_rsi):
            return None
        if last_rsi >= float(self.oversold):
            return None
        if last_close <= float(ema200.iloc[-1]):
            return None
        entry = last_close
        stop = entry * (1.0 - float(self.stop_pct) / 100.0)
        target = entry * (1.0 + float(self.target_pct) / 100.0)
        return Signal(side="long", entry=entry, target=target, stop=stop, reason="rsi_oversold")

    def exit_signal(self, history: pd.DataFrame, position: Position) -> bool:
        if len(history) < 15:
            return False
        rsi = _rsi(history["Close"].astype(float), 14)
        if not np.isfinite(rsi.iloc[-1]):
            return False
        return float(rsi.iloc[-1]) > float(self.rsi_exit)
