"""Gap-and-go intraday momentum approximation on daily bars."""

from __future__ import annotations

import numpy as np
import pandas as pd

from .base import Position, Signal, Strategy


class GapAndGoStrategy(Strategy):
    NAME = "gap_and_go"
    DESCRIPTION = (
        "Premarket gap up > min_gap_pct vs prior close with above-average volume. "
        "Daily approximation: same-bar fill at the day's High break of open with "
        "stop at day Low and 2R target."
    )
    PARAM_SCHEMA = {
        "min_gap_pct": {"type": "float", "default": 2.0},
        "min_relvol": {"type": "float", "default": 1.5},
        "rr_target": {"type": "float", "default": 2.0},
    }

    def signal(self, history: pd.DataFrame) -> Signal | None:
        if len(history) < 21:
            return None
        today = history.iloc[-1]
        prior_close = float(history["Close"].iloc[-2])
        today_open = float(today["Open"])
        today_high = float(today["High"])
        today_low = float(today["Low"])
        today_vol = float(today["Volume"]) if "Volume" in today else 0.0
        if prior_close <= 0:
            return None
        gap = (today_open / prior_close - 1.0) * 100.0
        if gap < float(self.min_gap_pct):
            return None
        avg_vol = float(history["Volume"].iloc[-21:-1].mean()) if "Volume" in history else 0.0
        relvol = (today_vol / avg_vol) if avg_vol > 0 else 0.0
        if relvol < float(self.min_relvol):
            return None
        # Need a real intraday range
        if today_high <= today_open:
            return None
        # Approximate: entry on high break of open (use today_open + small buffer)
        entry = today_open
        stop = today_low
        risk = entry - stop
        if risk <= 0:
            return None
        target = entry + float(self.rr_target) * risk
        return Signal(side="long", entry=entry, target=target, stop=stop, reason="gap_and_go")

    def exit_signal(self, history: pd.DataFrame, position: Position) -> bool:
        # Intraday strategy: force exit by next bar if neither stop nor target hit.
        return position.bars_held >= 1
