"""Shared helpers for forecast modules — lazy imports + math utilities."""
from __future__ import annotations

import importlib
import math
from typing import Any

import numpy as np
import pandas as pd


class ForecastError(Exception):
    """Raised when a forecast cannot be produced (typically missing optional dep)."""


# Map of importable module name -> pip package name (for the error hint).
_PKG_HINTS: dict[str, str] = {
    "prophet": "prophet",
    "statsmodels": "statsmodels",
    "statsmodels.tsa.arima.model": "statsmodels",
    "arch": "arch",
    "scipy": "scipy",
}


def lazy_import(module_name: str) -> Any:
    """Import a module on demand. Raise ForecastError with install hint if missing."""
    try:
        return importlib.import_module(module_name)
    except Exception as e:  # noqa: BLE001
        pkg = _PKG_HINTS.get(module_name, module_name.split(".")[0])
        raise ForecastError(
            f"{module_name} not installed; pip install {pkg}"
        ) from e


def to_returns(close: pd.Series) -> pd.Series:
    """Daily log returns from a Close price series."""
    s = pd.Series(close).astype(float).dropna()
    if len(s) < 2:
        return pd.Series(dtype=float)
    return np.log(s / s.shift(1)).dropna()


def annualize_vol(daily_vol: float) -> float:
    """Scale a daily standard deviation to annualized (252 trading days)."""
    if daily_vol is None or not math.isfinite(float(daily_vol)):
        return 0.0
    return float(daily_vol) * math.sqrt(252.0)


def safe_float(x: Any) -> float:
    """Cast numpy/pandas scalars to plain float; map non-finite to 0.0."""
    try:
        v = float(x)
    except (TypeError, ValueError):
        return 0.0
    if not math.isfinite(v):
        return 0.0
    return v
