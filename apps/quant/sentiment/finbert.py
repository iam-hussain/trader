"""Lazy FinBERT sentiment classifier with optional dependency loading."""

from __future__ import annotations

from typing import Any

_PIPELINE: Any = None
_AVAILABLE: bool | None = None


def is_available() -> bool:
    """Return True if torch and transformers can be imported."""
    global _AVAILABLE
    if _AVAILABLE is not None:
        return _AVAILABLE
    try:
        import torch  # noqa: F401
        from transformers import pipeline  # noqa: F401
    except Exception:  # noqa: BLE001
        _AVAILABLE = False
        return False
    _AVAILABLE = True
    return True


def _load() -> Any:
    global _PIPELINE
    if _PIPELINE is not None:
        return _PIPELINE
    from transformers import pipeline

    _PIPELINE = pipeline("sentiment-analysis", model="ProsusAI/finbert", top_k=None)
    return _PIPELINE


def _to_raw(label: str, score: float) -> float:
    label_lc = label.lower()
    if label_lc == "positive":
        return float(score)
    if label_lc == "negative":
        return -float(score)
    return 0.0


def score(texts: list[str]) -> list[dict[str, Any]]:
    """Score a batch of texts; returns dicts with label, score, raw."""
    if not is_available():
        raise RuntimeError("FinBERT unavailable: install torch and transformers")
    pipe = _load()
    results = pipe(texts)
    out: list[dict[str, Any]] = []
    for entry in results:
        if isinstance(entry, list):
            best = max(entry, key=lambda x: float(x.get("score", 0.0)))
        else:
            best = entry
        label = str(best.get("label", "neutral")).lower()
        sc = float(best.get("score", 0.0))
        out.append({"label": label, "score": sc, "raw": _to_raw(label, sc)})
    return out
