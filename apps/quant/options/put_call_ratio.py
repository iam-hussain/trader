"""Reconcile put/call ratio snapshots from multiple sources into one value."""
from __future__ import annotations

import statistics


def reconcile(snapshots: list[dict]) -> dict:
    """Consolidate multiple P/C ratio snapshots; report median, spread, and disagreement flag."""
    if not snapshots:
        return {
            "ratio": None,
            "count": 0,
            "sources": [],
            "spread": 0.0,
            "method": "single",
        }

    valid: list[dict] = []
    for s in snapshots:
        r = s.get("ratio")
        if r is None:
            continue
        try:
            r = float(r)
        except (TypeError, ValueError):
            continue
        if r <= 0:
            continue
        valid.append({"source": str(s.get("source", "unknown")), "ratio": r})

    if not valid:
        return {
            "ratio": None,
            "count": 0,
            "sources": [],
            "spread": 0.0,
            "method": "single",
        }

    ratios = [v["ratio"] for v in valid]

    if len(valid) == 1:
        return {
            "ratio": ratios[0],
            "count": 1,
            "sources": valid,
            "spread": 0.0,
            "method": "single",
        }

    median = float(statistics.median(ratios))
    lo = min(ratios)
    hi = max(ratios)
    spread = hi - lo
    method = "median"

    result: dict = {
        "ratio": median,
        "count": len(valid),
        "sources": valid,
        "spread": spread,
        "method": method,
    }

    # Relative disagreement: spread / min ratio
    if lo > 0 and (spread / lo) > 0.5:
        result["flag"] = "high_disagreement"

    return result
