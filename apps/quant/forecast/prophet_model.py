"""Prophet-based price-trend forecast.

Prophet is an optional heavy dep — imported lazily so this module loads cleanly
even when the package isn't installed; the error surfaces only when the
endpoint is hit.
"""
from __future__ import annotations

from typing import Any

import pandas as pd

from indicators.technicals import fetch_ohlcv
from scrapers.common import now_iso

from .common import ForecastError, lazy_import, safe_float


def _direction(last_close: float, last_yhat: float, threshold_pct: float = 0.5) -> str:
    """Classify expected move as up / down / sideways using a small dead-zone."""
    if last_close <= 0:
        return "sideways"
    diff_pct = (last_yhat - last_close) / last_close * 100.0
    if diff_pct > threshold_pct:
        return "up"
    if diff_pct < -threshold_pct:
        return "down"
    return "sideways"


def forecast_prophet(
    symbol: str,
    periods: int = 7,
    history_period: str = "2y",
) -> dict[str, Any]:
    """Fit Prophet on daily Close, forecast `periods` business days ahead.

    Returns a JSON-serializable bundle with last 90 history bars + forecast +
    a coarse direction label.
    """
    prophet_mod = lazy_import("prophet")
    Prophet = getattr(prophet_mod, "Prophet", None)
    if Prophet is None:
        raise ForecastError("prophet.Prophet not found; pip install prophet")

    df = fetch_ohlcv(symbol, period=history_period, interval="1d")
    if df.empty or "Close" not in df.columns:
        raise ForecastError(f"No usable OHLCV for {symbol!r}")

    closes = df["Close"].astype(float).dropna()
    if len(closes) < 30:
        raise ForecastError(f"Insufficient history for {symbol!r} (n={len(closes)})")

    # Prophet expects tz-naive datetimes in `ds`.
    idx = closes.index
    if getattr(idx, "tz", None) is not None:
        idx = idx.tz_convert(None) if hasattr(idx, "tz_convert") else idx.tz_localize(None)
    train = pd.DataFrame({"ds": pd.to_datetime(idx).tz_localize(None) if getattr(idx, "tz", None) else pd.to_datetime(idx),
                          "y": closes.values})

    try:
        model = Prophet(
            daily_seasonality=False,
            weekly_seasonality=True,
            yearly_seasonality=True,
        )
        model.fit(train)
    except Exception as e:  # noqa: BLE001
        raise ForecastError(f"Prophet fit failed: {e}") from e

    try:
        future = model.make_future_dataframe(periods=int(periods), freq="B")
        fcst = model.predict(future)
    except Exception as e:  # noqa: BLE001
        raise ForecastError(f"Prophet predict failed: {e}") from e

    last_train_ds = train["ds"].iloc[-1]
    fwd = fcst[fcst["ds"] > last_train_ds].tail(int(periods))

    forecast_rows: list[dict[str, Any]] = []
    for _, row in fwd.iterrows():
        forecast_rows.append({
            "date": pd.Timestamp(row["ds"]).strftime("%Y-%m-%d"),
            "yhat": safe_float(row["yhat"]),
            "yhatLower": safe_float(row.get("yhat_lower")),
            "yhatUpper": safe_float(row.get("yhat_upper")),
        })

    history_tail = train.tail(90)
    history_rows: list[dict[str, Any]] = [
        {
            "date": pd.Timestamp(r["ds"]).strftime("%Y-%m-%d"),
            "close": safe_float(r["y"]),
        }
        for _, r in history_tail.iterrows()
    ]

    last_close = safe_float(closes.iloc[-1])
    last_yhat = forecast_rows[-1]["yhat"] if forecast_rows else last_close
    expected_return_pct = (
        (last_yhat - last_close) / last_close * 100.0 if last_close > 0 else 0.0
    )

    return {
        "symbol": symbol,
        "asOf": now_iso(),
        "horizonDays": int(periods),
        "history": history_rows,
        "forecast": forecast_rows,
        "direction": _direction(last_close, last_yhat),
        "expectedReturnPct": safe_float(expected_return_pct),
        "model": "prophet",
    }
