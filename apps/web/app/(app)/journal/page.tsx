"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { AlertCircle, Pencil, X } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { CalendarHeatmap, type HeatmapDay } from "@/components/CalendarHeatmap";
import { api, fetcher } from "@/lib/api";

type Outcome = "win" | "loss" | "scratch";

interface JournalEntry {
  id: string;
  ticker: string;
  date: string; // YYYY-MM-DD
  thesis: string;
  outcome?: Outcome;
  pnl?: number;
  tags?: string[];
  lessons?: string;
}

interface JournalListResponse {
  entries: JournalEntry[];
}

interface HeatmapResponse {
  days: HeatmapDay[];
}

const OUTCOMES: { id: Outcome; label: string; chip: string }[] = [
  { id: "win", label: "Win", chip: "chip chip-pos" },
  { id: "loss", label: "Loss", chip: "chip chip-neg" },
  { id: "scratch", label: "Scratch", chip: "chip" },
];

function todayInET(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function defaultFromDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

export default function JournalPage() {
  const [from, setFrom] = useState(defaultFromDate());
  const [to, setTo] = useState(todayInET());
  const [tagFilter, setTagFilter] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<Set<Outcome>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);

  const params = useMemo(() => {
    const sp = new URLSearchParams();
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    if (tagFilter) sp.set("tag", tagFilter);
    if (outcomeFilter.size === 1) sp.set("outcome", Array.from(outcomeFilter)[0]);
    return sp.toString();
  }, [from, to, tagFilter, outcomeFilter]);

  const { data, error, isLoading, mutate } = useSWR<JournalListResponse>(
    `/api/journal${params ? `?${params}` : ""}`,
    fetcher,
    { keepPreviousData: true },
  );
  const { data: heatmap } = useSWR<HeatmapResponse>(
    "/api/journal/heatmap",
    fetcher,
  );

  const filteredEntries = useMemo(() => {
    const list = data?.entries ?? [];
    // Server may not honor outcome filter for multi-select; apply locally too.
    if (outcomeFilter.size === 0 || outcomeFilter.size === OUTCOMES.length) return list;
    return list.filter((e) => e.outcome && outcomeFilter.has(e.outcome));
  }, [data, outcomeFilter]);

  const toggleOutcome = (o: Outcome) => {
    setOutcomeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(o)) next.delete(o);
      else next.add(o);
      return next;
    });
  };

  const saveEntry = async (id: string, patch: Partial<JournalEntry>) => {
    await api(`/api/journal/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    setEditingId(null);
    await mutate();
  };

  return (
    <>
      <Topbar crumbs={["Workspace", "Journal"]} />
      <div className="page max-w-[1100px]">
        {/* Filters */}
        <div className="b-card p-3 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide t-dim">From</span>
            <input
              type="date"
              className="input mono tabular-nums"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide t-dim">To</span>
            <input
              type="date"
              className="input mono tabular-nums"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide t-dim">Tag</span>
            <input
              className="input"
              placeholder="filter by tag"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide t-dim">Outcome</span>
            <div className="flex items-center gap-1">
              {OUTCOMES.map((o) => {
                const active = outcomeFilter.has(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => toggleOutcome(o.id)}
                    className={active ? o.chip : "chip"}
                    style={{ cursor: "pointer" }}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Heatmap */}
        <CalendarHeatmap data={heatmap?.days ?? []} days={90} />

        {/* List */}
        {error && (
          <div className="b-card p-3 flex items-center gap-2 text-[12px] t-neg">
            <AlertCircle className="w-3.5 h-3.5" />
            Could not load journal.
            <button type="button" className="btn btn-sm ml-auto" onClick={() => mutate()}>
              Retry
            </button>
          </div>
        )}

        {isLoading && !data && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skel" style={{ height: 60 }} />
            ))}
          </div>
        )}

        {data && filteredEntries.length === 0 && (
          <div className="b-card p-6 flex flex-col items-center text-center gap-2">
            <div className="text-[14px] font-semibold">No entries yet</div>
            <p className="text-[12px] text-fg-muted max-w-[420px] leading-[1.6]">
              The journal captures your trade thesis, outcome, and lessons. As
              you stage and close trades, entries appear here automatically.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {filteredEntries.map((e) =>
            editingId === e.id ? (
              <EntryEditor
                key={e.id}
                entry={e}
                onSave={(patch) => saveEntry(e.id, patch)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <EntryRow key={e.id} entry={e} onEdit={() => setEditingId(e.id)} />
            ),
          )}
        </div>
      </div>
    </>
  );
}

function EntryRow({
  entry,
  onEdit,
}: {
  entry: JournalEntry;
  onEdit: () => void;
}) {
  const snippet = entry.thesis.split("\n").slice(0, 2).join(" ").slice(0, 220);
  const outcome = entry.outcome
    ? OUTCOMES.find((o) => o.id === entry.outcome)
    : undefined;
  return (
    <div className="b-card p-3 flex items-start gap-3">
      <div className="flex flex-col items-start gap-1 w-[92px] flex-shrink-0">
        <span className="chip mono">{entry.ticker}</span>
        <span className="mono tabular-nums text-[10px] text-fg-muted">{entry.date}</span>
      </div>
      <div className="flex flex-col flex-1 min-w-0 gap-1.5">
        <p className="text-[12px] leading-[1.5] text-fg">{snippet}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {(entry.tags ?? []).map((t) => (
            <span key={t} className="chip">
              {t}
            </span>
          ))}
          {outcome && <span className={outcome.chip}>{outcome.label}</span>}
          {entry.pnl !== undefined && (
            <span
              className={`chip mono tabular-nums ${entry.pnl >= 0 ? "chip-pos" : "chip-neg"}`}
            >
              {entry.pnl >= 0 ? "+" : ""}
              ${entry.pnl.toFixed(0)}
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-sm flex-shrink-0"
        onClick={onEdit}
      >
        <Pencil className="w-3 h-3" />
        Edit
      </button>
    </div>
  );
}

function EntryEditor({
  entry,
  onSave,
  onCancel,
}: {
  entry: JournalEntry;
  onSave: (patch: Partial<JournalEntry>) => Promise<void>;
  onCancel: () => void;
}) {
  const [thesis, setThesis] = useState(entry.thesis);
  const [outcome, setOutcome] = useState<Outcome | undefined>(entry.outcome);
  const [lessons, setLessons] = useState(entry.lessons ?? "");
  const [tags, setTags] = useState((entry.tags ?? []).join(", "));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    setSaving(true);
    try {
      await onSave({
        thesis,
        outcome,
        lessons,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="b-card p-3 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="chip mono">{entry.ticker}</span>
        <span className="mono tabular-nums text-[10px] text-fg-muted">{entry.date}</span>
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-ghost btn-sm ml-auto"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wide t-dim">Thesis</span>
        <textarea
          className="input"
          rows={4}
          value={thesis}
          onChange={(e) => setThesis(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wide t-dim">Outcome</span>
        <div className="flex items-center gap-1">
          {OUTCOMES.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setOutcome(outcome === o.id ? undefined : o.id)}
              className={outcome === o.id ? o.chip : "chip"}
              style={{ cursor: "pointer" }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wide t-dim">Lessons</span>
        <textarea
          className="input"
          rows={3}
          value={lessons}
          onChange={(e) => setLessons(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wide t-dim">Tags</span>
        <input
          className="input"
          placeholder="comma separated"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
      </div>
      {err && <div className="text-[11px] t-neg">{err}</div>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-ghost btn-sm ml-auto"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={submit}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
