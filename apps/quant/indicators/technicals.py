"""Technical indicator bundle computed from yfinance OHLCV data."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd
import yfinance as yf

try:  # pragma: no cover - optional dep
    import pandas_ta as ta  # type: ignore

    _HAS_PTA = True
except Exception:  # noqa: BLE001
    ta = None  # type: ignore
    _HAS_PTA = False


def fetch_ohlcv(symbol: str, period: str = "1y", interval: str = "1d") -> pd.DataFrame:
    """Fetch OHLCV history for a symbol via yfinance."""
    df = yf.Ticker(symbol).history(period=period, interval=interval)
    if df is None or df.empty:
        raise ValueError(f"No OHLCV data for symbol {symbol!r}")
    df = df.rename(
        columns={
            "open": "Open",
            "high": "High",
            "low": "Low",
            "close": "Close",
            "volume": "Volume",
        }
    )
    keep = [c for c in ("Open", "High", "Low", "Close", "Volume") if c in df.columns]
    df = df[keep].dropna(how="all")
    if df.empty:
        raise ValueError(f"OHLCV for {symbol!r} is all NaN")
    return df


def _ema(s: pd.Series, span: int) -> pd.Series:
    return s.ewm(span=span, adjust=False).mean()


def _rsi(close: pd.Series, length: int = 14) -> pd.Series:
    delta = close.diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)
    avg_gain = gain.ewm(alpha=1 / length, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / length, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - (100 / (1 + rs))
    return rsi


def _macd(close: pd.Series) -> tuple[pd.Series, pd.Series, pd.Series]:
    line = _ema(close, 12) - _ema(close, 26)
    signal = _ema(line, 9)
    hist = line - signal
    return line, signal, hist


def _bbands(close: pd.Series, length: int = 20, mult: float = 2.0):
    mid = close.rolling(length).mean()
    sd = close.rolling(length).std(ddof=0)
    upper = mid + mult * sd
    lower = mid - mult * sd
    width = (upper - lower) / mid
    return upper, mid, lower, width


def _atr(df: pd.DataFrame, length: int = 14) -> pd.Series:
    high, low, close = df["High"], df["Low"], df["Close"]
    prev_close = close.shift(1)
    tr = pd.concat(
        [(high - low), (high - prev_close).abs(), (low - prev_close).abs()], axis=1
    ).max(axis=1)
    return tr.ewm(alpha=1 / length, adjust=False).mean()


def _vwap_intraday(df: pd.DataFrame) -> float | None:
    if not isinstance(df.index, pd.DatetimeIndex) or len(df) < 2:
        return None
    diffs = df.index.to_series().diff().dropna()
    if diffs.empty or diffs.median() >= pd.Timedelta(days=1):
        return None
    tp = (df["High"] + df["Low"] + df["Close"]) / 3.0
    cum_tpv = (tp * df["Volume"]).cumsum()
    cum_vol = df["Volume"].cumsum().replace(0, np.nan)
    vwap = cum_tpv / cum_vol
    val = vwap.iloc[-1]
    return float(val) if pd.notna(val) else None


def _pivots(df: pd.DataFrame, window: int = 5) -> tuple[list[float], list[float]]:
    six_months = df.last("180D") if isinstance(df.index, pd.DatetimeIndex) else df.tail(126)
    highs, lows = six_months["High"].values, six_months["Low"].values
    n = len(highs)
    pivot_highs: list[float] = []
    pivot_lows: list[float] = []
    for i in range(window, n - window):
        seg_h = highs[i - window : i + window + 1]
        seg_l = lows[i - window : i + window + 1]
        if highs[i] == seg_h.max():
            pivot_highs.append(float(highs[i]))
        if lows[i] == seg_l.min():
            pivot_lows.append(float(lows[i]))
    return pivot_lows, pivot_highs


def _cluster(values: list[float], tol: float = 0.01, top: int = 3) -> list[float]:
    if not values:
        return []
    sorted_vals = sorted(values)
    clusters: list[list[float]] = [[sorted_vals[0]]]
    for v in sorted_vals[1:]:
        center = sum(clusters[-1]) / len(clusters[-1])
        if abs(v - center) / center <= tol:
            clusters[-1].append(v)
        else:
            clusters.append([v])
    ranked = sorted(clusters, key=len, reverse=True)[:top]
    return [round(sum(c) / len(c), 4) for c in ranked]


def _trend(last_close: float, e20: float, e50: float, e200: float) -> str:
    if last_close > e50 > e200 and e20 > e50:
        return "uptrend"
    if last_close < e50 < e200 and e20 < e50:
        return "downtrend"
    return "sideways"


def _signals(
    close: pd.Series,
    rsi: pd.Series,
    hist: pd.Series,
    bb_width: pd.Series,
    ema50: pd.Series,
    ema200: pd.Series,
) -> list[str]:
    out: list[str] = []
    last_rsi = rsi.iloc[-1] if len(rsi) else np.nan
    if pd.notna(last_rsi):
        if last_rsi < 30:
            out.append("rsi_oversold")
        elif last_rsi > 70:
            out.append("rsi_overbought")
    if len(hist) >= 2 and pd.notna(hist.iloc[-1]) and pd.notna(hist.iloc[-2]):
        if hist.iloc[-2] <= 0 < hist.iloc[-1]:
            out.append("macd_bull_cross")
        elif hist.iloc[-2] >= 0 > hist.iloc[-1]:
            out.append("macd_bear_cross")
    valid_w = bb_width.dropna()
    if len(valid_w) >= 20 and pd.notna(bb_width.iloc[-1]):
        threshold = valid_w.quantile(0.20)
        if bb_width.iloc[-1] <= threshold:
            out.append("bb_squeeze")
    last_close = close.iloc[-1]
    if pd.notna(ema200.iloc[-1]):
        out.append("above_ema200" if last_close > ema200.iloc[-1] else "below_ema200")
    lookback = min(6, len(ema50))
    if lookback >= 2:
        e50_recent = ema50.iloc[-lookback:]
        e200_recent = ema200.iloc[-lookback:]
        diff = (e50_recent - e200_recent).dropna()
        if len(diff) >= 2:
            signs = np.sign(diff.values)
            for i in range(1, len(signs)):
                if signs[i - 1] < 0 <= signs[i]:
                    out.append("golden_cross")
                    break
                if signs[i - 1] > 0 >= signs[i]:
                    out.append("death_cross")
                    break
    return out


def _last_float(s: pd.Series) -> float | None:
    if s is None or len(s) == 0:
        return None
    val = s.iloc[-1]
    return float(val) if pd.notna(val) else None


def compute_bundle(symbol: str, period: str = "1y") -> dict[str, Any]:
    """Compute the standard tech indicator bundle for a symbol."""
    df = fetch_ohlcv(symbol, period=period, interval="1d")
    close = df["Close"]

    if _HAS_PTA:
        rsi = ta.rsi(close, length=14)
        macd_df = ta.macd(close, fast=12, slow=26, signal=9)
        if macd_df is not None and not macd_df.empty:
            line = macd_df.iloc[:, 0]
            hist = macd_df.iloc[:, 1]
            signal = macd_df.iloc[:, 2]
        else:
            line, signal, hist = _macd(close)
        bb = ta.bbands(close, length=20, std=2)
        if bb is not None and not bb.empty:
            lower = bb.iloc[:, 0]
            mid = bb.iloc[:, 1]
            upper = bb.iloc[:, 2]
            width = (upper - lower) / mid
        else:
            upper, mid, lower, width = _bbands(close)
        atr = ta.atr(df["High"], df["Low"], close, length=14)
    else:
        rsi = _rsi(close, 14)
        line, signal, hist = _macd(close)
        upper, mid, lower, width = _bbands(close)
        atr = _atr(df, 14)

    ema20 = _ema(close, 20)
    ema50 = _ema(close, 50)
    ema200 = _ema(close, 200)

    last_close = float(close.iloc[-1])
    macd_last = None
    if _last_float(line) is not None:
        macd_last = {
            "line": _last_float(line),
            "signal": _last_float(signal),
            "hist": _last_float(hist),
        }
    bb_last = None
    if _last_float(upper) is not None:
        bb_last = {
            "upper": _last_float(upper),
            "mid": _last_float(mid),
            "lower": _last_float(lower),
            "width": _last_float(width),
        }

    e20_last = _last_float(ema20) or last_close
    e50_last = _last_float(ema50) or last_close
    e200_last = _last_float(ema200) or last_close

    supports, resistances = _pivots(df, window=5)
    sr = {
        "support": _cluster(supports, tol=0.01, top=3),
        "resistance": _cluster(resistances, tol=0.01, top=3),
    }
    trend = _trend(last_close, e20_last, e50_last, e200_last)
    signals = _signals(close, rsi, hist, width, ema50, ema200)

    return {
        "symbol": symbol,
        "asOf": datetime.now(timezone.utc).isoformat(),
        "lastClose": last_close,
        "rsi14": _last_float(rsi),
        "macd": macd_last,
        "bbands": bb_last,
        "ema": {"ema20": e20_last, "ema50": e50_last, "ema200": e200_last},
        "vwap": _vwap_intraday(df),
        "atr14": _last_float(atr),
        "supportResistance": sr,
        "trend": trend,
        "signals": signals,
    }
