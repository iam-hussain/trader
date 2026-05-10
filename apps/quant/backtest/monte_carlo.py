"""Monte-Carlo bootstrap resampling of a trade list."""

from __future__ import annotations

from dataclasses import asdict, is_dataclass
from typing import Any, Iterable

import numpy as np


def _coerce_trade(trade: Any) -> dict[str, Any]:
    if is_dataclass(trade):
        return asdict(trade)
    if isinstance(trade, dict):
        return trade
    raise TypeError("Trade must be a dataclass or dict")


def _trade_returns(trades: Iterable[Any]) -> list[float]:
    out: list[float] = []
    for t in trades:
        d = _coerce_trade(t)
        # return_pct is the per-trade return on entry value, expressed in percent.
        out.append(float(d.get("return_pct", 0.0)) / 100.0)
    return out


def _equity_path(returns: np.ndarray) -> np.ndarray:
    # Compound: equity_t = prod(1 + r) over the resampled sequence.
    return np.cumprod(1.0 + returns)


def _max_drawdown_pct(curve: np.ndarray) -> float:
    if curve.size == 0:
        return 0.0
    running_max = np.maximum.accumulate(curve)
    dd = (curve - running_max) / running_max
    return float(dd.min()) * 100.0


def _percentiles(values: np.ndarray) -> dict[str, float]:
    if values.size == 0:
        return {"p5": 0.0, "p25": 0.0, "p50": 0.0, "p75": 0.0, "p95": 0.0}
    ps = np.percentile(values, [5, 25, 50, 75, 95])
    return {
        "p5": round(float(ps[0]), 4),
        "p25": round(float(ps[1]), 4),
        "p50": round(float(ps[2]), 4),
        "p75": round(float(ps[3]), 4),
        "p95": round(float(ps[4]), 4),
    }


def monte_carlo_resample(
    trades: list[Any],
    n_runs: int = 1000,
    seed: int = 42,
) -> dict[str, Any]:
    """Bootstrap-resample trades with replacement n_runs times.

    Short trade lists: when fewer than 2 trades are supplied we still emit a
    well-formed response with empty distribution and zeroed bands so callers
    don't have to special-case it.
    """
    rets = np.asarray(_trade_returns(trades), dtype=float)
    if rets.size < 2:
        return {
            "nRuns": int(n_runs),
            "tradeCount": int(rets.size),
            "finalReturnPct": _percentiles(np.array([])),
            "maxDrawdownPct": _percentiles(np.array([])),
            "distribution": [],
            "note": "insufficient_trades_for_bootstrap",
        }

    rng = np.random.default_rng(int(seed))
    n_trades = rets.size
    final_returns = np.empty(n_runs, dtype=float)
    max_dds = np.empty(n_runs, dtype=float)
    distribution: list[dict[str, float]] = []

    for i in range(int(n_runs)):
        sample_idx = rng.integers(0, n_trades, size=n_trades)
        sample = rets[sample_idx]
        curve = _equity_path(sample)
        final_returns[i] = (curve[-1] - 1.0) * 100.0 if curve.size else 0.0
        max_dds[i] = _max_drawdown_pct(curve)
        distribution.append(
            {
                "finalReturnPct": round(float(final_returns[i]), 4),
                "maxDrawdownPct": round(float(max_dds[i]), 4),
            }
        )

    return {
        "nRuns": int(n_runs),
        "tradeCount": int(n_trades),
        "finalReturnPct": _percentiles(final_returns),
        "maxDrawdownPct": _percentiles(max_dds),
        "distribution": distribution,
    }
