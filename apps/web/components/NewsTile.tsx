"use client";
import { useState } from "react";
import clsx from "clsx";
import { ExternalLink } from "lucide-react";

export interface NewsArticle {
  source: string;
  url: string;
  title: string;
  publishedAt: string;
  summary?: string;
  sentiment?: "positive" | "neutral" | "negative";
  sentimentScore?: number;
}

function formatTime(ts: string) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

export function NewsTile({ article }: { article: NewsArticle }) {
  const [open, setOpen] = useState(false);
  const sentiment = article.sentiment ?? "neutral";
  const sentimentClass =
    sentiment === "positive"
      ? "bg-pos/10 text-pos border-pos/30"
      : sentiment === "negative"
        ? "bg-neg/10 text-neg border-neg/30"
        : "bg-bg-elevated text-fg-muted border-border";

  return (
    <article className="card p-3 hover:bg-bg-elevated/40 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <a
            href={article.url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-sm font-medium hover:text-accent inline-flex items-start gap-1.5"
          >
            <span className="line-clamp-2">{article.title}</span>
            <ExternalLink className="w-3.5 h-3.5 mt-0.5 shrink-0 text-fg-subtle" />
          </a>
          <div className="mt-1 text-xs text-fg-muted flex items-center gap-1.5">
            <span className="truncate">{article.source}</span>
            <span className="text-fg-subtle">·</span>
            <span className="font-mono tabular-nums">
              {formatTime(article.publishedAt)}
            </span>
          </div>
        </div>
        <span
          className={clsx(
            "text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0",
            sentimentClass,
          )}
        >
          {sentiment}
          {typeof article.sentimentScore === "number" && (
            <span className="ml-1 font-mono tabular-nums">
              {article.sentimentScore >= 0 ? "+" : ""}
              {article.sentimentScore.toFixed(2)}
            </span>
          )}
        </span>
      </div>
      {article.summary && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-xs text-fg-muted hover:text-fg"
          >
            {open ? "Hide summary" : "Show summary"}
          </button>
          {open && (
            <p className="mt-1.5 text-sm text-fg-muted leading-relaxed">
              {article.summary}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

export default NewsTile;
