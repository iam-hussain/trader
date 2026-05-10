"""FastAPI router exposing the Phase-5 backtest endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .engine import result_to_dict, run_backtest
from .monte_carlo import monte_carlo_resample
from .strategies import get_strategy, list_strategies
from .walk_forward import walk_forward

router = APIRouter()


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------


class BacktestRunRequest(BaseModel):
    strategy: str
    params: dict[str, Any] = Field(default_factory=dict)
    symbol: str
    start: str
    end: str
    account_size: float | None = 25000.0
    risk_per_trade_pct: float | None = 1.0


class WalkForwardRequest(BaseModel):
    strategy: str
    params: dict[str, Any] = Field(default_factory=dict)
    symbol: str
    start: str
    end: str
    train_months: int = 12
    test_months: int = 3
    step_months: int = 3
    account_size: float | None = 25000.0
    risk_per_trade_pct: float | None = 1.0


class MonteCarloRequest(BaseModel):
    trades: list[dict[str, Any]]
    n_runs: int | None = 1000
    seed: int | None = 42


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/backtest/strategies")
def get_strategies() -> dict[str, Any]:
    try:
        return {"strategies": list_strategies()}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"strategies_failed: {exc}") from exc


@router.post("/backtest/run")
def post_run(req: BacktestRunRequest) -> dict[str, Any]:
    try:
        strategy = get_strategy(req.strategy, req.params)
        result = run_backtest(
            symbol=req.symbol,
            strategy=strategy,
            start=req.start,
            end=req.end,
            account_size=float(req.account_size or 25000.0),
            risk_per_trade_pct=float(req.risk_per_trade_pct or 1.0),
        )
        return result_to_dict(result)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"backtest_failed: {exc}") from exc


@router.post("/backtest/walk-forward")
def post_walk_forward(req: WalkForwardRequest) -> dict[str, Any]:
    try:
        def factory(_train_window: Any = None) -> Any:
            return get_strategy(req.strategy, req.params)

        return walk_forward(
            symbol=req.symbol,
            strategy_factory=factory,
            start=req.start,
            end=req.end,
            train_months=int(req.train_months),
            test_months=int(req.test_months),
            step_months=int(req.step_months),
            account_size=float(req.account_size or 25000.0),
            risk_per_trade_pct=float(req.risk_per_trade_pct or 1.0),
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"walk_forward_failed: {exc}") from exc


@router.post("/backtest/monte-carlo")
def post_monte_carlo(req: MonteCarloRequest) -> dict[str, Any]:
    try:
        return monte_carlo_resample(
            trades=req.trades,
            n_runs=int(req.n_runs or 1000),
            seed=int(req.seed or 42),
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"monte_carlo_failed: {exc}") from exc


__all__ = ["router"]
