"""Post-earnings drift proxy: gap up + close above open after a flat consolidation."""

from __future__ import annotations

import numpy as np
import pandas as pd

from .base import Position, Signal, Strategy


class EarningsPeadStrategy(Strategy):
    NAME = "earnings_pead"
    DESCRIPTION = (
        "Detect 3% gap up bar that closes above its open after a 3-day flat range — "
        "a structural proxy for post-earnings-announcement drift."
    )
    PARAM_SCHEMA = {
        "gap_pct": {"type": "float", "default": 3.0},
        "hold_days": {"type": "int", "default": 10},
        "stop_pct": {"type": "float", "default": 4.0},
        "flat_lookback": {"type": "int", "default": 3},
        "flat_band_pct": {"type": "float", "default": 2.0},
    }

    def signal(self, history: pd.DataFrame) -> Signal | None:
        n = len(history)
        flat_n = int(self.flat_lookback)
        if n < flat_n + 3:
            return None
        today = history.iloc[-1]
        prior_close = float(history["Close"].iloc[-2])
        today_open = float(today["Open"])
        today_close = float(today["Close"])
        if prior_close <= 0:
            return None
        gap = (today_open / prior_close - 1.0) * 100.0
        if gap < float(self.gap_pct):
            return None
        if today_close <= today_open:
            return None
        # Verify prior `flat_n` days were within band
        prior_window = history["Close"].iloc[-(flat_n + 2): -2].astype(float)
        if prior_window.empty:
            return None
        flat_range = (prior_window.max() - prior_window.min()) / prior_window.mean() * 100.0
        if flat_range > float(self.flat_band_pct):
            return None
        entry = today_close
        stop = entry * (1.0 - float(self.stop_pct) / 100.0)
        target = entry * (1.0 + 2.0 * float(self.stop_pct) / 100.0)
        return Signal(side="long", entry=entry, target=target, stop=stop, reason="pead_gap_up")

    def exit_signal(self, history: pd.DataFrame, position: Position) -> bool:
        # Time-based exit
        return position.bars_held >= int(self.hold_days)
