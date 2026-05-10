"""Black-Scholes pricing and Greeks for European options.

American single-stock options are approximated using BS for our purposes.
Vega is returned per 1.0 vol unit (divide by 100 for per-1%-vol convention).
Theta is returned per calendar day (annualized / 365).
"""
from __future__ import annotations

import math
from datetime import date, datetime
from typing import Any

import numpy as np
from scipy.optimize import brentq
from scipy.stats import norm


def _intrinsic(S: float, K: float, option_type: str) -> float:
    if option_type == "call":
        return max(S - K, 0.0)
    if option_type == "put":
        return max(K - S, 0.0)
    raise ValueError(f"option_type must be 'call' or 'put', got {option_type!r}")


def _d1_d2(S: float, K: float, T: float, r: float, sigma: float) -> tuple[float, float]:
    if S <= 0 or K <= 0 or T <= 0 or sigma <= 0:
        raise ValueError("S, K, T, sigma must be positive for d1/d2")
    vol_sqrt_t = sigma * math.sqrt(T)
    d1 = (math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / vol_sqrt_t
    d2 = d1 - vol_sqrt_t
    return d1, d2


def bs_price(S: float, K: float, T: float, r: float, sigma: float, option_type: str) -> float:
    """Black-Scholes price for a European call or put. Returns intrinsic if T<=0."""
    S, K, T, r, sigma = float(S), float(K), float(T), float(r), float(sigma)
    if T <= 0 or sigma <= 0:
        return _intrinsic(S, K, option_type)
    d1, d2 = _d1_d2(S, K, T, r, sigma)
    if option_type == "call":
        return S * norm.cdf(d1) - K * math.exp(-r * T) * norm.cdf(d2)
    if option_type == "put":
        return K * math.exp(-r * T) * norm.cdf(-d2) - S * norm.cdf(-d1)
    raise ValueError(f"option_type must be 'call' or 'put', got {option_type!r}")


def delta(S: float, K: float, T: float, r: float, sigma: float, option_type: str) -> float:
    """Option delta. Returns 0/+/-1 limits at expiry."""
    S, K, T, r, sigma = float(S), float(K), float(T), float(r), float(sigma)
    if T <= 0 or sigma <= 0:
        intrinsic = _intrinsic(S, K, option_type)
        if option_type == "call":
            return 1.0 if intrinsic > 0 else 0.0
        return -1.0 if intrinsic > 0 else 0.0
    d1, _ = _d1_d2(S, K, T, r, sigma)
    if option_type == "call":
        return float(norm.cdf(d1))
    if option_type == "put":
        return float(norm.cdf(d1) - 1.0)
    raise ValueError(f"option_type must be 'call' or 'put', got {option_type!r}")


def gamma(S: float, K: float, T: float, r: float, sigma: float) -> float:
    """Option gamma (same for call/put)."""
    S, K, T, r, sigma = float(S), float(K), float(T), float(r), float(sigma)
    if T <= 0 or sigma <= 0:
        return 0.0
    d1, _ = _d1_d2(S, K, T, r, sigma)
    return float(norm.pdf(d1) / (S * sigma * math.sqrt(T)))


def theta(S: float, K: float, T: float, r: float, sigma: float, option_type: str) -> float:
    """Option theta per calendar day (annualized BS theta / 365)."""
    S, K, T, r, sigma = float(S), float(K), float(T), float(r), float(sigma)
    if T <= 0 or sigma <= 0:
        return 0.0
    d1, d2 = _d1_d2(S, K, T, r, sigma)
    sqrt_t = math.sqrt(T)
    first = -(S * norm.pdf(d1) * sigma) / (2.0 * sqrt_t)
    if option_type == "call":
        annual = first - r * K * math.exp(-r * T) * norm.cdf(d2)
    elif option_type == "put":
        annual = first + r * K * math.exp(-r * T) * norm.cdf(-d2)
    else:
        raise ValueError(f"option_type must be 'call' or 'put', got {option_type!r}")
    return float(annual / 365.0)


def vega(S: float, K: float, T: float, r: float, sigma: float) -> float:
    """Option vega per 1.0 vol unit (divide by 100 for per-1%-vol)."""
    S, K, T, r, sigma = float(S), float(K), float(T), float(r), float(sigma)
    if T <= 0 or sigma <= 0:
        return 0.0
    d1, _ = _d1_d2(S, K, T, r, sigma)
    return float(S * norm.pdf(d1) * math.sqrt(T))


def implied_vol(
    price: float, S: float, K: float, T: float, r: float, option_type: str
) -> float | None:
    """Solve implied volatility via Brent's method on (1e-4, 5.0). None if no solution."""
    price, S, K, T, r = float(price), float(S), float(K), float(T), float(r)
    if price <= 0 or S <= 0 or K <= 0 or T <= 0:
        return None
    intrinsic = _intrinsic(S, K, option_type)
    if price < intrinsic - 1e-8:
        return None

    def objective(sigma: float) -> float:
        return bs_price(S, K, T, r, sigma, option_type) - price

    lo, hi = 1e-4, 5.0
    try:
        f_lo = objective(lo)
        f_hi = objective(hi)
        if f_lo * f_hi > 0:
            return None
        return float(brentq(objective, lo, hi, xtol=1e-6, maxiter=100))
    except (ValueError, RuntimeError):
        return None


def _years_to_expiry(expiry_iso: str, today: date | None = None) -> float:
    today = today or datetime.utcnow().date()
    exp = datetime.fromisoformat(expiry_iso).date() if "T" not in expiry_iso else datetime.fromisoformat(expiry_iso).date()
    days = (exp - today).days
    return max(days, 0) / 365.0


def _mid_price(row: dict[str, Any]) -> float | None:
    bid = row.get("bid")
    ask = row.get("ask")
    if bid is not None and ask is not None and bid > 0 and ask > 0:
        return (float(bid) + float(ask)) / 2.0
    last = row.get("last")
    if last is not None and last > 0:
        return float(last)
    return None


def compute_greeks_for_chain(
    chain: list[dict], spot: float, r: float, today: date | None = None
) -> list[dict]:
    """Annotate each chain row with delta/gamma/theta/vega/iv. Solves IV from mid if missing."""
    out: list[dict] = []
    spot = float(spot)
    r = float(r)
    for row in chain:
        new_row = dict(row)
        try:
            K = float(row["strike"])
            opt_type = str(row["type"]).lower()
            T = _years_to_expiry(str(row["expiry"]), today=today)
        except (KeyError, ValueError, TypeError):
            new_row.update({"delta": None, "gamma": None, "theta": None, "vega": None, "iv": None})
            out.append(new_row)
            continue

        iv = row.get("iv")
        if iv is None or float(iv) <= 0:
            mid = _mid_price(row)
            iv = implied_vol(mid, spot, K, T, r, opt_type) if mid is not None else None
        else:
            iv = float(iv)

        if iv is None or iv <= 0 or T <= 0:
            new_row.update({"delta": None, "gamma": None, "theta": None, "vega": None, "iv": iv})
        else:
            new_row["iv"] = iv
            new_row["delta"] = delta(spot, K, T, r, iv, opt_type)
            new_row["gamma"] = gamma(spot, K, T, r, iv)
            new_row["theta"] = theta(spot, K, T, r, iv, opt_type)
            new_row["vega"] = vega(spot, K, T, r, iv)
        out.append(new_row)
    return out
