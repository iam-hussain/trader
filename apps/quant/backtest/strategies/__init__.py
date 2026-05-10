"""Strategy registry for the backtest engine."""

from __future__ import annotations

from typing import Any

from .atr_breakout import AtrBreakoutStrategy
from .base import Position, Signal, Strategy
from .earnings_pead import EarningsPeadStrategy
from .ema_crossover import EmaCrossoverStrategy
from .gap_and_go import GapAndGoStrategy
from .opening_range import OpeningRangeStrategy
from .rsi_mean_reversion import RsiMeanReversionStrategy

STRATEGIES: dict[str, type[Strategy]] = {
    "ema_crossover": EmaCrossoverStrategy,
    "rsi_mean_reversion": RsiMeanReversionStrategy,
    "earnings_pead": EarningsPeadStrategy,
    "gap_and_go": GapAndGoStrategy,
    "atr_breakout": AtrBreakoutStrategy,
    "opening_range": OpeningRangeStrategy,
}


def list_strategies() -> list[dict[str, Any]]:
    return [
        {
            "id": key,
            "name": cls.NAME,
            "description": cls.DESCRIPTION,
            "params": cls.PARAM_SCHEMA,
        }
        for key, cls in STRATEGIES.items()
    ]


def get_strategy(strategy_id: str, params: dict[str, Any] | None = None) -> Strategy:
    cls = STRATEGIES.get(strategy_id)
    if cls is None:
        raise ValueError(f"unknown strategy: {strategy_id}")
    return cls(**(params or {}))


__all__ = [
    "STRATEGIES",
    "Position",
    "Signal",
    "Strategy",
    "AtrBreakoutStrategy",
    "EarningsPeadStrategy",
    "EmaCrossoverStrategy",
    "GapAndGoStrategy",
    "OpeningRangeStrategy",
    "RsiMeanReversionStrategy",
    "list_strategies",
    "get_strategy",
]
