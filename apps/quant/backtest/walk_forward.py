"""Walk-forward analysis harness for the backtest engine.

The harness slides a (train, test) window across the date range and runs
`run_backtest` on each out-of-sample test window. A `strategy_factory` callable
receives the train window so future versions can run parameter optimization
in-sample; the Phase-5 default just constructs the strategy with default
parameters (no optimization yet) — that hook is intentionally left for a
later phase.
"""

from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any, Callable

import numpy as np
import pandas as pd

from .engine import BacktestResult, run_backtest, result_to_dict
from .strategies.base import Strategy


def _add_months(ts: pd.Timestamp, months: int) -> pd.Timestamp:
    return (ts + pd.DateOffset(months=int(months))).normalize()


def _iso(ts: pd.Timestamp) -> str:
    return pd.Timestamp(ts).strftime("%Y-%m-%d")


def _aggregate_kpis(results: list[BacktestResult]) -> dict[str, Any]:
    if not results:
        return {
            "windows": 0,
            "tradeCount": 0,
            "avgTotalReturnPct": 0.0,
            "avgAnnualizedReturnPct": 0.0,
            "avgSharpe": 0.0,
            "avgMaxDrawdownPct": 0.0,
            "winRateAcrossTrades": 0.0,
            "profitableWindowPct": 0.0,
        }
    total_returns = [r.kpis.get("totalReturnPct", 0.0) for r in results]
    annualized = [r.kpis.get("annualizedReturnPct", 0.0) for r in results]
    sharpes = [r.kpis.get("sharpe", 0.0) for r in results]
    max_dds = [r.kpis.get("maxDrawdownPct", 0.0) for r in results]
    all_trades = [t for r in results for t in r.trades]
    wins = sum(1 for t in all_trades if t.return_pct > 0)
    win_rate = (wins / len(all_trades) * 100.0) if all_trades else 0.0
    profitable_windows = sum(1 for r in total_returns if r > 0)
    profitable_pct = profitable_windows / len(results) * 100.0
    return {
        "windows": len(results),
        "tradeCount": len(all_trades),
        "avgTotalReturnPct": round(float(np.mean(total_returns)), 4),
        "avgAnnualizedReturnPct": round(float(np.mean(annualized)), 4),
        "avgSharpe": round(float(np.mean(sharpes)), 4),
        "avgMaxDrawdownPct": round(float(np.mean(max_dds)), 4),
        "winRateAcrossTrades": round(float(win_rate), 4),
        "profitableWindowPct": round(float(profitable_pct), 4),
    }


def walk_forward(
    symbol: str,
    strategy_factory: Callable[[pd.DataFrame | None], Strategy],
    start: str,
    end: str,
    train_months: int = 12,
    test_months: int = 3,
    step_months: int = 3,
    account_size: float = 25000.0,
    risk_per_trade_pct: float = 1.0,
) -> dict[str, Any]:
    """Slide (train, test) windows across [start, end].

    Parameters
    ----------
    strategy_factory:
        Callable invoked once per window with `None` (no in-sample optimization
        in Phase 5). A future phase can pass the in-sample DataFrame so the
        factory can fit / search parameters before returning a Strategy.
    """
    start_ts = pd.Timestamp(start).tz_localize(None).normalize()
    end_ts = pd.Timestamp(end).tz_localize(None).normalize()
    if end_ts <= start_ts:
        return {
            "symbol": symbol,
            "start": start,
            "end": end,
            "windows": [],
            "aggregate": _aggregate_kpis([]),
        }

    windows: list[dict[str, Any]] = []
    results: list[BacktestResult] = []

    train_start = start_ts
    while True:
        train_end = _add_months(train_start, train_months)
        test_start = train_end
        test_end = _add_months(test_start, test_months)
        if test_start >= end_ts:
            break
        if test_end > end_ts:
            test_end = end_ts
        if test_end <= test_start:
            break

        # In-sample data hook (currently unused — Phase-5 leaves optimization for later).
        try:
            strategy = strategy_factory(None)
        except TypeError:
            # Allow zero-arg factories.
            strategy = strategy_factory()  # type: ignore[call-arg]

        result = run_backtest(
            symbol=symbol,
            strategy=strategy,
            start=_iso(test_start),
            end=_iso(test_end),
            account_size=account_size,
            risk_per_trade_pct=risk_per_trade_pct,
        )
        results.append(result)
        windows.append(
            {
                "trainStart": _iso(train_start),
                "trainEnd": _iso(train_end),
                "testStart": _iso(test_start),
                "testEnd": _iso(test_end),
                "result": result_to_dict(result),
            }
        )

        train_start = _add_months(train_start, step_months)
        if _add_months(train_start, train_months) >= end_ts:
            break

    return {
        "symbol": symbol,
        "start": start,
        "end": end,
        "trainMonths": int(train_months),
        "testMonths": int(test_months),
        "stepMonths": int(step_months),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "windows": windows,
        "aggregate": _aggregate_kpis(results),
    }
