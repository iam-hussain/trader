"""ARIMA(1,0,1) + GARCH(1,1) volatility forecast.

ARIMA(1,0,1) is chosen as a parsimonious baseline for daily log returns: the
AR(1)+MA(1) combo captures a small amount of mean reversion / momentum without
overfitting, and pairs cleanly with a GARCH(1,1) volatility model that is the
de-facto standard for daily equity vol.
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd

from indicators.technicals import fetch_ohlcv
from scrapers.common import now_iso

from .common import ForecastError, annualize_vol, lazy_import, safe_float, to_returns


def _next_business_days(start: pd.Timestamp, n: int) -> list[pd.Timestamp]:
    return list(pd.bdate_range(start=start + pd.Timedelta(days=1), periods=int(n)))


def forecast_volatility(
    symbol: str,
    horizon_days: int = 5,
    history_period: str = "2y",
) -> dict[str, Any]:
    """ARIMA(1,0,1) mean + GARCH(1,1) vol forecast over `horizon_days`."""
    sm = lazy_import("statsmodels.tsa.arima.model")
    ARIMA = getattr(sm, "ARIMA", None)
    if ARIMA is None:
        raise ForecastError("statsmodels ARIMA missing; pip install statsmodels")
    arch_mod = lazy_import("arch")
    arch_model = getattr(arch_mod, "arch_model", None)
    if arch_model is None:
        raise ForecastError("arch.arch_model missing; pip install arch")

    df = fetch_ohlcv(symbol, period=history_period, interval="1d")
    if df.empty or "Close" not in df.columns:
        raise ForecastError(f"No usable OHLCV for {symbol!r}")

    closes = df["Close"].astype(float).dropna()
    rets = to_returns(closes)
    if len(rets) < 60:
        raise ForecastError(f"Insufficient returns for {symbol!r} (n={len(rets)})")

    # Index hygiene — arch / statsmodels prefer plain DatetimeIndex.
    idx = rets.index
    if getattr(idx, "tz", None) is not None:
        try:
            idx = idx.tz_convert(None)
        except Exception:  # noqa: BLE001
            idx = idx.tz_localize(None)
    rets = pd.Series(rets.values, index=pd.DatetimeIndex(idx))

    # ── ARIMA(1,0,1) on returns for mean forecast ──────────────────────────
    try:
        arima_res = ARIMA(rets, order=(1, 0, 1)).fit()
        mean_fc = arima_res.forecast(steps=int(horizon_days))
        mean_arr = np.asarray(mean_fc, dtype=float)
    except Exception as e:  # noqa: BLE001
        # Fall back to historical mean if ARIMA fails to converge.
        mean_arr = np.full(int(horizon_days), float(rets.mean()))
        del e

    # ── GARCH(1,1) on returns (rescaled to %) for vol forecast ────────────
    pct_rets = rets * 100.0  # arch recommends rescaling to avoid convergence issues
    try:
        garch = arch_model(pct_rets, mean="Zero", vol="GARCH", p=1, q=1, dist="normal")
        garch_res = garch.fit(disp="off")
        vol_fc = garch_res.forecast(horizon=int(horizon_days), reindex=False)
        # variance of the last available row in pct^2 units.
        var_row = vol_fc.variance.iloc[-1].values.astype(float)
        # Convert pct-scale stdev back to decimal (divide by 100).
        daily_vol = np.sqrt(var_row) / 100.0
    except Exception as e:  # noqa: BLE001
        # Fall back to a flat realized-vol forecast.
        realized = float(rets.tail(20).std()) if len(rets) >= 20 else float(rets.std())
        daily_vol = np.full(int(horizon_days), realized if math.isfinite(realized) else 0.0)
        del e

    # ── History rows: returns + 20-day rolling vol (annualized) ───────────
    rolling_vol = rets.rolling(20).std()
    history_tail_idx = rets.index[-90:]
    history_rows: list[dict[str, Any]] = []
    for ts in history_tail_idx:
        rv = rolling_vol.get(ts, np.nan)
        history_rows.append({
            "date": pd.Timestamp(ts).strftime("%Y-%m-%d"),
            "return": safe_float(rets.loc[ts]),
            "vol": safe_float(annualize_vol(rv) if pd.notna(rv) else 0.0),
        })

    # ── Forecast rows ─────────────────────────────────────────────────────
    last_ts = rets.index[-1]
    fwd_dates = _next_business_days(pd.Timestamp(last_ts), int(horizon_days))
    forecast_rows: list[dict[str, Any]] = []
    for i, d in enumerate(fwd_dates):
        m = float(mean_arr[i]) if i < len(mean_arr) else 0.0
        v = float(daily_vol[i]) if i < len(daily_vol) else 0.0
        forecast_rows.append({
            "date": pd.Timestamp(d).strftime("%Y-%m-%d"),
            "meanReturn": safe_float(m),
            "vol": safe_float(v),
            "volAnnualized": safe_float(annualize_vol(v)),
        })

    # ── Headline figures ──────────────────────────────────────────────────
    realized_recent = float(rets.tail(20).std()) if len(rets) >= 20 else float(rets.std())
    current_vol = annualize_vol(realized_recent if math.isfinite(realized_recent) else 0.0)
    forecast_vol = (
        float(np.mean([annualize_vol(v) for v in daily_vol])) if len(daily_vol) else 0.0
    )

    return {
        "symbol": symbol,
        "asOf": now_iso(),
        "horizonDays": int(horizon_days),
        "history": history_rows,
        "forecast": forecast_rows,
        "currentVol": safe_float(current_vol),
        "forecastVol": safe_float(forecast_vol),
        "model": "arima_garch",
    }
