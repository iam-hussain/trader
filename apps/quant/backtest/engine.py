"""Pure-pandas single-symbol backtest engine.

Future optimization: swap the day-by-day loop for a vectorbt-based vectorized
engine (signals -> portfolio.from_signals) once vectorbt is available at
runtime. For now we keep dependencies tight (pandas + numpy + scipy.stats).
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal

import numpy as np
import pandas as pd

from indicators.technicals import fetch_ohlcv

from .strategies.base import Position, Signal, Strategy


@dataclass
class Trade:
    entry_date: str
    exit_date: str
    side: Literal["long", "short"]
    entry_price: float
    exit_price: float
    qty: int
    pnl: float
    return_pct: float
    hold_days: int
    reason: str  # "target" | "stop" | "signal_exit" | "end_of_period"


@dataclass
class BacktestResult:
    symbol: str
    strategy: str
    start: str
    end: str
    trades: list[Trade]
    equity_curve: list[dict]
    kpis: dict


# ---------------------------------------------------------------------------
# Date / data helpers
# ---------------------------------------------------------------------------


def _parse_date(s: str) -> pd.Timestamp:
    return pd.Timestamp(s).tz_localize(None)


def _isodate(ts: Any) -> str:
    if isinstance(ts, (pd.Timestamp, datetime)):
        return pd.Timestamp(ts).strftime("%Y-%m-%d")
    return str(ts)


def _slice_window(df: pd.DataFrame, start: str, end: str) -> pd.DataFrame:
    idx = df.index
    if getattr(idx, "tz", None) is not None:
        idx = idx.tz_localize(None)
        df = df.copy()
        df.index = idx
    s = _parse_date(start)
    e = _parse_date(end)
    mask = (df.index >= s) & (df.index <= e)
    return df.loc[mask]


# ---------------------------------------------------------------------------
# KPI computation
# ---------------------------------------------------------------------------


def _max_drawdown(equity: pd.Series) -> tuple[float, int]:
    if equity.empty:
        return 0.0, 0
    running_max = equity.cummax()
    dd = (equity - running_max) / running_max
    max_dd = float(dd.min()) if not dd.empty else 0.0
    # max DD duration in days
    is_dd = equity < running_max
    longest = current = 0
    last_idx: pd.Timestamp | None = None
    for ts, flag in is_dd.items():
        if flag:
            if last_idx is None:
                current = 1
            else:
                current = (ts - last_idx).days if isinstance(ts, pd.Timestamp) else current + 1
            longest = max(longest, current)
        else:
            current = 0
        last_idx = ts if flag else None
    return max_dd * 100.0, int(longest)


def _kpis_from(trades: list[Trade], equity_curve: pd.DataFrame, account_size: float) -> dict:
    out: dict[str, float | int] = {
        "totalReturnPct": 0.0,
        "annualizedReturnPct": 0.0,
        "volatilityPct": 0.0,
        "sharpe": 0.0,
        "sortino": 0.0,
        "maxDrawdownPct": 0.0,
        "maxDrawdownDays": 0,
        "winRate": 0.0,
        "lossRate": 0.0,
        "profitFactor": 0.0,
        "expectancy": 0.0,
        "tradeCount": 0,
        "avgHoldDays": 0.0,
        "bestTradePct": 0.0,
        "worstTradePct": 0.0,
    }
    if equity_curve.empty:
        return out

    eq = equity_curve["equity"]
    total_return = float(eq.iloc[-1] / account_size - 1.0) * 100.0
    days = max((equity_curve.index[-1] - equity_curve.index[0]).days, 1)
    years = days / 365.25
    if years > 0 and eq.iloc[-1] > 0:
        ann = float((eq.iloc[-1] / account_size) ** (1 / years) - 1.0) * 100.0
    else:
        ann = 0.0
    rets = eq.pct_change().dropna()
    vol = float(rets.std() * math.sqrt(252)) * 100.0 if len(rets) > 1 else 0.0
    sharpe = float(rets.mean() / rets.std() * math.sqrt(252)) if rets.std() > 0 else 0.0
    downside = rets[rets < 0]
    sortino = (
        float(rets.mean() / downside.std() * math.sqrt(252))
        if len(downside) > 1 and downside.std() > 0
        else 0.0
    )
    max_dd_pct, max_dd_days = _max_drawdown(eq)

    out["totalReturnPct"] = round(total_return, 4)
    out["annualizedReturnPct"] = round(ann, 4)
    out["volatilityPct"] = round(vol, 4)
    out["sharpe"] = round(sharpe, 4)
    out["sortino"] = round(sortino, 4)
    out["maxDrawdownPct"] = round(max_dd_pct, 4)
    out["maxDrawdownDays"] = int(max_dd_days)

    if not trades:
        return out

    rets_pct = [t.return_pct for t in trades]
    wins = [r for r in rets_pct if r > 0]
    losses = [r for r in rets_pct if r <= 0]
    pnls = [t.pnl for t in trades]
    gross_profit = sum(p for p in pnls if p > 0)
    gross_loss = -sum(p for p in pnls if p < 0)
    win_rate = len(wins) / len(rets_pct) if rets_pct else 0.0
    loss_rate = len(losses) / len(rets_pct) if rets_pct else 0.0
    avg_win = float(np.mean(wins)) if wins else 0.0
    avg_loss = float(np.mean([abs(x) for x in losses])) if losses else 0.0
    profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else (gross_profit if gross_profit > 0 else 0.0)
    expectancy = avg_win * win_rate - avg_loss * loss_rate

    out["winRate"] = round(win_rate * 100.0, 4)
    out["lossRate"] = round(loss_rate * 100.0, 4)
    out["profitFactor"] = round(float(profit_factor), 4)
    out["expectancy"] = round(float(expectancy), 4)
    out["tradeCount"] = len(trades)
    out["avgHoldDays"] = round(float(np.mean([t.hold_days for t in trades])), 4)
    out["bestTradePct"] = round(float(max(rets_pct)), 4)
    out["worstTradePct"] = round(float(min(rets_pct)), 4)
    return out


# ---------------------------------------------------------------------------
# Core loop
# ---------------------------------------------------------------------------


def _size_position(account: float, risk_pct: float, entry: float, stop: float) -> int:
    risk_dollars = account * (risk_pct / 100.0)
    per_share_risk = abs(entry - stop)
    if per_share_risk <= 0 or risk_dollars <= 0:
        return 0
    return int(math.floor(risk_dollars / per_share_risk))


def _evaluate_intrabar_exit(
    bar: pd.Series, position: Position
) -> tuple[float | None, str | None]:
    """Return (exit_price, reason) if the day's H/L hits target or stop, else (None, None).

    Conservative rule: when both stop and target are inside [low, high] on the same
    bar, assume the stop hits first (worst-case fill).
    """
    high = float(bar["High"])
    low = float(bar["Low"])
    if position.side == "long":
        stop_hit = low <= position.stop
        target_hit = high >= position.target
        if stop_hit and target_hit:
            return position.stop, "stop"
        if stop_hit:
            return position.stop, "stop"
        if target_hit:
            return position.target, "target"
    else:  # short
        stop_hit = high >= position.stop
        target_hit = low <= position.target
        if stop_hit and target_hit:
            return position.stop, "stop"
        if stop_hit:
            return position.stop, "stop"
        if target_hit:
            return position.target, "target"
    return None, None


def _close_trade(
    position: Position,
    exit_date: str,
    exit_price: float,
    reason: str,
    bars_held: int,
) -> Trade:
    if position.side == "long":
        pnl = (exit_price - position.entry_price) * position.qty
        ret = (exit_price / position.entry_price - 1.0) * 100.0
    else:
        pnl = (position.entry_price - exit_price) * position.qty
        ret = (position.entry_price / exit_price - 1.0) * 100.0
    return Trade(
        entry_date=position.entry_date,
        exit_date=exit_date,
        side=position.side,
        entry_price=round(float(position.entry_price), 6),
        exit_price=round(float(exit_price), 6),
        qty=int(position.qty),
        pnl=round(float(pnl), 4),
        return_pct=round(float(ret), 4),
        hold_days=int(bars_held),
        reason=reason,
    )


def run_backtest(
    symbol: str,
    strategy: Strategy,
    start: str,
    end: str,
    account_size: float = 25000.0,
    risk_per_trade_pct: float = 1.0,
) -> BacktestResult:
    """Run a single-symbol backtest using daily OHLCV bars.

    The engine walks one bar at a time. On each bar:
      * If a position is open: first evaluate intra-bar stop/target hits using
        the bar's High/Low. If neither hits, ask the strategy whether it wants
        an early exit at the close.
      * If no position is open: ask the strategy for a Signal. If returned,
        size the position via fixed-fractional risk and open at the signal's
        entry price (treated as the next executable price; the engine assumes
        same-bar fill at the signal entry).
    """
    raw = fetch_ohlcv(symbol, period="max", interval="1d")
    df = _slice_window(raw, start, end)
    if df.empty:
        return BacktestResult(
            symbol=symbol,
            strategy=strategy.NAME,
            start=start,
            end=end,
            trades=[],
            equity_curve=[],
            kpis=_kpis_from([], pd.DataFrame(), account_size),
        )

    account = float(account_size)
    open_position: Position | None = None
    trades: list[Trade] = []
    equity_dates: list[pd.Timestamp] = []
    equity_values: list[float] = []

    closes = df["Close"].astype(float)

    for i, (ts, bar) in enumerate(df.iterrows()):
        history = df.iloc[: i + 1]
        bar_date = _isodate(ts)

        # 1) Manage open position
        if open_position is not None:
            open_position.bars_held += 1
            exit_price, reason = _evaluate_intrabar_exit(bar, open_position)
            if exit_price is not None:
                pnl = _trade_pnl(open_position, exit_price)
                trade = _close_trade(open_position, bar_date, exit_price, reason or "stop", open_position.bars_held)
                trades.append(trade)
                account += pnl
                open_position = None
            else:
                # Ask strategy for early exit at close
                if strategy.exit_signal(history, open_position):
                    close_px = float(bar["Close"])
                    pnl = _trade_pnl(open_position, close_px)
                    trade = _close_trade(
                        open_position, bar_date, close_px, "signal_exit", open_position.bars_held
                    )
                    trades.append(trade)
                    account += pnl
                    open_position = None

        # 2) Look for new entry if flat
        if open_position is None:
            sig = strategy.signal(history)
            if sig is not None:
                qty = _size_position(account, risk_per_trade_pct, sig.entry, sig.stop)
                if qty > 0:
                    open_position = Position(
                        side=sig.side,
                        entry_date=bar_date,
                        entry_price=float(sig.entry),
                        target=float(sig.target),
                        stop=float(sig.stop),
                        qty=qty,
                        bars_held=0,
                    )

        # 3) Mark equity (use unrealized P&L on close if a position is open)
        equity = account
        if open_position is not None:
            close_px = float(bar["Close"])
            equity += _trade_pnl(open_position, close_px)
        equity_dates.append(ts)
        equity_values.append(float(equity))

    # Force-close any open position at last bar's close
    if open_position is not None and not df.empty:
        last_ts = df.index[-1]
        last_close = float(df["Close"].iloc[-1])
        pnl = _trade_pnl(open_position, last_close)
        trade = _close_trade(
            open_position, _isodate(last_ts), last_close, "end_of_period", open_position.bars_held
        )
        trades.append(trade)
        account += pnl
        equity_values[-1] = float(account)
        open_position = None

    eq_series = pd.Series(equity_values, index=pd.DatetimeIndex(equity_dates))
    running_max = eq_series.cummax()
    dd = (eq_series - running_max) / running_max * 100.0
    eq_df = pd.DataFrame({"equity": eq_series, "drawdown": dd})

    equity_curve_out = [
        {
            "date": _isodate(idx),
            "equity": round(float(row["equity"]), 4),
            "drawdown": round(float(row["drawdown"]) if not math.isnan(row["drawdown"]) else 0.0, 4),
        }
        for idx, row in eq_df.iterrows()
    ]

    kpis = _kpis_from(trades, eq_df, account_size)

    return BacktestResult(
        symbol=symbol,
        strategy=strategy.NAME,
        start=start,
        end=end,
        trades=trades,
        equity_curve=equity_curve_out,
        kpis=kpis,
    )


def _trade_pnl(position: Position, exit_price: float) -> float:
    if position.side == "long":
        return float((exit_price - position.entry_price) * position.qty)
    return float((position.entry_price - exit_price) * position.qty)


def result_to_dict(result: BacktestResult) -> dict[str, Any]:
    """Convert a BacktestResult into a JSON-serializable dict."""
    return {
        "symbol": result.symbol,
        "strategy": result.strategy,
        "start": result.start,
        "end": result.end,
        "trades": [asdict(t) for t in result.trades],
        "equityCurve": result.equity_curve,
        "kpis": result.kpis,
    }
