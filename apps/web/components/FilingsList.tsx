import { ExternalLink, FileText } from "lucide-react";

export interface FilingRow {
  form: string;
  filedAt: string;
  primaryDocDescription?: string;
  url: string;
}

export function FilingsList({ rows }: { rows: FilingRow[] }) {
  if (!rows || rows.length === 0) {
    return (
      <div className="card p-4 text-sm text-fg-muted">No filings found.</div>
    );
  }

  return (
    <ul className="card divide-y divide-border">
      {rows.map((r, i) => (
        <li key={`${r.form}-${r.filedAt}-${i}`}>
          <a
            href={r.url}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-bg-elevated/40 transition-colors"
          >
            <FileText className="w-4 h-4 text-fg-subtle shrink-0" />
            <span className="font-mono text-xs uppercase tracking-wide w-16 shrink-0 text-accent">
              {r.form}
            </span>
            <span className="flex-1 text-sm truncate">
              {r.primaryDocDescription || r.form}
            </span>
            <span className="font-mono tabular-nums text-xs text-fg-muted shrink-0">
              {r.filedAt}
            </span>
            <ExternalLink className="w-3.5 h-3.5 text-fg-subtle shrink-0" />
          </a>
        </li>
      ))}
    </ul>
  );
}

export default FilingsList;
