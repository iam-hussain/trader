"""Combine articles with sentiment scoring and aggregate stats."""

from __future__ import annotations

from typing import Any

from . import finbert, lexicon


def _article_text(article: dict[str, Any]) -> str:
    title = str(article.get("title") or "").strip()
    summary = str(article.get("summary") or article.get("description") or "").strip()
    return f"{title}. {summary}".strip(". ").strip()


def _method() -> str:
    return "finbert" if finbert.is_available() else "lexicon"


def score_articles(articles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return a new article list enriched with sentiment + sentimentScore."""
    if not articles:
        return []
    texts = [_article_text(a) for a in articles]
    if finbert.is_available():
        try:
            scored = finbert.score(texts)
        except Exception:  # noqa: BLE001
            scored = lexicon.score(texts)
    else:
        scored = lexicon.score(texts)

    enriched: list[dict[str, Any]] = []
    for article, s in zip(articles, scored):
        enriched.append(
            {
                **article,
                "sentiment": s["label"],
                "sentimentScore": float(s["raw"]),
            }
        )
    return enriched


def aggregate(articles: list[dict[str, Any]]) -> dict[str, Any]:
    """Aggregate scored articles into summary stats and top movers."""
    count = len(articles)
    if count == 0:
        return {
            "count": 0,
            "avgScore": 0.0,
            "positive": 0,
            "neutral": 0,
            "negative": 0,
            "topPositive": [],
            "topNegative": [],
            "method": _method(),
        }

    scores = [float(a.get("sentimentScore", 0.0)) for a in articles]
    pos = sum(1 for a in articles if a.get("sentiment") == "positive")
    neg = sum(1 for a in articles if a.get("sentiment") == "negative")
    neu = sum(1 for a in articles if a.get("sentiment") == "neutral")
    avg = sum(scores) / count

    by_desc = sorted(articles, key=lambda a: float(a.get("sentimentScore", 0.0)), reverse=True)
    by_asc = sorted(articles, key=lambda a: float(a.get("sentimentScore", 0.0)))

    return {
        "count": count,
        "avgScore": avg,
        "positive": pos,
        "neutral": neu,
        "negative": neg,
        "topPositive": by_desc[:3],
        "topNegative": by_asc[:3],
        "method": _method(),
    }
