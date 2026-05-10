"""FastAPI router for Phase 5 forecasting endpoints."""
from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutTimeout
from typing import Any, Callable

from fastapi import APIRouter, HTTPException

from .arima_garch import forecast_volatility
from .common import ForecastError
from .patterns import detect_patterns
from .prophet_model import forecast_prophet


router = APIRouter()

_SYMBOL_RE = re.compile(r"^[A-Z][A-Z0-9.\-]{0,9}$")


def _validate_symbol(symbol: str) -> str:
    sym = (symbol or "").upper()
    if not _SYMBOL_RE.match(sym):
        raise HTTPException(status_code=400, detail=f"invalid_symbol: {symbol!r}")
    return sym


def _run(fn: Callable[..., dict[str, Any]], *args: Any, **kwargs: Any) -> dict[str, Any]:
    """Run a forecast call, mapping ForecastError -> 501 and other -> 502."""
    try:
        return fn(*args, **kwargs)
    except ForecastError as e:
        raise HTTPException(status_code=501, detail=str(e)) from e
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"forecast_failed: {e}") from e


@router.get("/forecast/{symbol}/prophet")
def prophet_endpoint(symbol: str, days: int = 7) -> dict[str, Any]:
    sym = _validate_symbol(symbol)
    return _run(forecast_prophet, sym, periods=int(days))


@router.get("/forecast/{symbol}/garch")
def garch_endpoint(symbol: str, days: int = 5) -> dict[str, Any]:
    sym = _validate_symbol(symbol)
    return _run(forecast_volatility, sym, horizon_days=int(days))


@router.get("/forecast/{symbol}/patterns")
def patterns_endpoint(symbol: str, lookback: int = 60) -> dict[str, Any]:
    sym = _validate_symbol(symbol)
    return _run(detect_patterns, sym, lookback_days=int(lookback))


def _bundle_call(fn: Callable[..., dict[str, Any]], *args: Any, **kwargs: Any) -> dict[str, Any]:
    """For the bundle endpoint — never raise; surface errors as `{error: ...}`."""
    try:
        return fn(*args, **kwargs)
    except ForecastError as e:
        return {"error": f"missing_dependency: {e}"}
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)}


@router.get("/forecast/{symbol}")
def bundle_endpoint(symbol: str) -> dict[str, Any]:
    """Run prophet + garch + patterns concurrently with a per-task timeout."""
    sym = _validate_symbol(symbol)

    out: dict[str, Any] = {"symbol": sym}
    tasks: dict[str, Callable[[], dict[str, Any]]] = {
        "prophet": lambda: _bundle_call(forecast_prophet, sym, periods=7),
        "garch": lambda: _bundle_call(forecast_volatility, sym, horizon_days=5),
        "patterns": lambda: _bundle_call(detect_patterns, sym, lookback_days=60),
    }

    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {key: pool.submit(fn) for key, fn in tasks.items()}
        for key, fut in futures.items():
            try:
                out[key] = fut.result(timeout=60)
            except FutTimeout:
                out[key] = {"error": "timeout"}
            except Exception as e:  # noqa: BLE001
                out[key] = {"error": str(e)}

    return out
