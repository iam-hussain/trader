"""Finance-news lexicon sentiment scorer used as a FinBERT fallback."""

from __future__ import annotations

import re
from typing import Any

_POSITIVE = {
    "beat", "beats", "exceed", "exceeds", "exceeded", "surge", "surged", "surging",
    "upgrade", "upgraded", "raised", "raises", "strong", "stronger", "record",
    "outperform", "outperformed", "bullish", "positive", "growth", "growing",
    "expansion", "expanding", "approval", "approved", "wins", "win", "profitable",
    "profit", "rally", "rallied", "soar", "soared", "jump", "jumped", "gain",
    "gains", "rise", "rose", "rising", "boost", "boosted", "breakthrough",
    "innovative", "robust", "solid", "successful", "milestone", "momentum",
    "accelerate", "accelerated", "improvement", "improved", "optimistic",
    "favorable",
}

_NEGATIVE = {
    "miss", "missed", "missing", "downgrade", "downgraded", "lowered", "lowers",
    "cut", "cuts", "decline", "declined", "declining", "fall", "fell", "falling",
    "drop", "dropped", "dropping", "loss", "losses", "lawsuit", "investigation",
    "probe", "warning", "warned", "weak", "weaker", "bearish", "negative",
    "recall", "recalled", "fraud", "scandal", "plunge", "plunged", "slump",
    "slumped", "slowdown", "slowing", "concern", "concerns", "worry", "worried",
    "risk", "risks", "risky", "default", "bankruptcy", "bankrupt", "deficit",
    "shortfall", "headwind", "headwinds", "delisted", "fine", "fined",
    "subpoena", "halt", "halted", "suspended",
}

_WORD_RE = re.compile(r"[A-Za-z][A-Za-z'-]*")


def _count(text: str, vocab: set[str]) -> int:
    if not text:
        return 0
    return sum(1 for w in _WORD_RE.findall(text.lower()) if w in vocab)


def _label(raw: float) -> str:
    if raw > 0.15:
        return "positive"
    if raw < -0.15:
        return "negative"
    return "neutral"


def score(texts: list[str]) -> list[dict[str, Any]]:
    """Lexicon score for each text: {label, score, raw}."""
    out: list[dict[str, Any]] = []
    for text in texts:
        pos = _count(text or "", _POSITIVE)
        neg = _count(text or "", _NEGATIVE)
        denom = max(pos + neg, 1)
        raw = (pos - neg) / denom
        out.append({"label": _label(raw), "score": abs(raw), "raw": raw})
    return out
