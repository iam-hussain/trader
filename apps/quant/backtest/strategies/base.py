"""Strategy base class and Signal dataclass for the backtest engine."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Literal

import pandas as pd


@dataclass
class Signal:
    """A trade entry signal emitted by a Strategy."""

    side: Literal["long", "short"]
    entry: float
    target: float
    stop: float
    reason: str


@dataclass
class Position:
    """Open position state shared with strategies for early-exit checks."""

    side: Literal["long", "short"]
    entry_date: str
    entry_price: float
    target: float
    stop: float
    qty: int
    bars_held: int = 0


class Strategy(ABC):
    """Base class. Subclasses define NAME, DESCRIPTION, PARAM_SCHEMA and signal()."""

    NAME: str = "base"
    DESCRIPTION: str = ""
    PARAM_SCHEMA: dict[str, Any] = {}

    def __init__(self, **params: Any) -> None:
        # Merge defaults from PARAM_SCHEMA with provided params.
        merged: dict[str, Any] = {}
        for key, spec in self.PARAM_SCHEMA.items():
            if isinstance(spec, dict) and "default" in spec:
                merged[key] = spec["default"]
        merged.update({k: v for k, v in params.items() if v is not None})
        self.params = merged
        for k, v in merged.items():
            setattr(self, k, v)

    @abstractmethod
    def signal(self, history: pd.DataFrame) -> Signal | None:
        """Return an entry Signal based on history up-to-and-including current bar, else None."""

    def exit_signal(self, history: pd.DataFrame, position: Position) -> bool:
        """Default: do not request early exit. Stops/targets handle it intra-bar."""
        return False
