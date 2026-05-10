"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Plus, Check, Moon, AlertCircle } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { RunBriefDialog } from "@/components/RunBriefDialog";
import { fetcher } from "@/lib/api";

type Session = "premarket" | "midday" | "postmarket";
type BriefStatus = "done" | "queued" | "missing" | "failed";

interface BriefSummary {
  id: string;
  date: string; // YYYY-MM-DD
  session: Session;
  status?: BriefStatus;
  signalCount?: number;
  llmProvider?: string;
  llmModel?: string;
  generatedAt?: string;
}

interface BriefListResponse {
  briefs: BriefSummary[];
}

const SESSIONS: { id: Session; label: string; time: string }[] = [
  { id: "premarket", label: "Pre-market", time: "08:00 ET" },
  { id: "midday", label: "Mid-day", time: "12:00 ET" },
  { id: "postmarket", label: "Post-market", time: "16:30 ET" },
];

function todayInET(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function formatDateLabel(iso: string): string {
  const today = todayInET();
  if (iso === today) return "Today";
  const yest = new Date(today);
  yest.setDate(yest.getDate() - 1);
  if (iso === yest.toISOString().slice(0, 10)) return "Yesterday";
  // weekday + month/day
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  });
}

export default function BriefsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data, error, isLoading, mutate } = useSWR<BriefListResponse>(
    "/api/briefs",
    fetcher,
    { refreshInterval: 30_000, keepPreviousData: true },
  );

  // Group briefs by date and pick last 30 dates including today.
  const grouped = useMemo(() => {
    const map = new Map<string, Map<Session, BriefSummary>>();
    for (const b of data?.briefs ?? []) {
      if (!map.has(b.date)) map.set(b.date, new Map());
      map.get(b.date)!.set(b.session, b);
    }
    const out: { date: string; sessions: Map<Session, BriefSummary> }[] = [];
    const today = new Date(todayInET() + "T12:00:00");
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      out.push({ date: iso, sessions: map.get(iso) ?? new Map() });
    }
    return out;
  }, [data]);

  const totalBriefs = data?.briefs.length ?? 0;

  return (
    <>
      <Topbar
        crumbs={["Workspace", "Briefs"]}
        right={
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="w-3.5 h-3.5" /> Run brief
          </button>
        }
      />
      <div className="page max-w-[1100px]">
        {error && (
          <div className="b-card p-3 flex items-center gap-2 text-[12px] t-neg">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Could not load briefs.</span>
            <button
              type="button"
              className="btn btn-sm ml-auto"
              onClick={() => mutate()}
            >
              Retry
            </button>
          </div>
        )}

        {isLoading && !data && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skel" style={{ height: 64 }} />
            ))}
          </div>
        )}

        {data && totalBriefs === 0 && (
          <div className="b-card p-6 flex flex-col items-center text-center gap-3">
            <div className="text-[14px] font-semibold">No briefs yet</div>
            <p className="text-[12px] text-fg-muted max-w-[420px] leading-[1.6]">
              Briefs combine your watchlist, macro context, and recent news into
              ranked trade signals. Generate one for the current session to get
              started.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setDialogOpen(true)}
            >
              <Plus className="w-3.5 h-3.5" /> Run brief
            </button>
          </div>
        )}

        {data && totalBriefs > 0 && (
          <div className="flex flex-col gap-2">
            {grouped.map(({ date, sessions }) => (
              <DateRow key={date} date={date} sessions={sessions} />
            ))}
          </div>
        )}
      </div>

      <RunBriefDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </>
  );
}

function DateRow({
  date,
  sessions,
}: {
  date: string;
  sessions: Map<Session, BriefSummary>;
}) {
  return (
    <div className="b-card p-3 grid items-center gap-3" style={{ gridTemplateColumns: "120px 1fr" }}>
      <div className="flex flex-col">
        <span className="text-[13px] font-medium">{formatDateLabel(date)}</span>
        <span className="mono tabular-nums text-[10px] text-fg-muted">{date}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {SESSIONS.map((s) => {
          const b = sessions.get(s.id);
          return <SessionChip key={s.id} session={s} brief={b} date={date} />;
        })}
      </div>
    </div>
  );
}

function SessionChip({
  session,
  brief,
  date,
}: {
  session: { id: Session; label: string; time: string };
  brief: BriefSummary | undefined;
  date: string;
}) {
  const status: BriefStatus = brief?.status ?? (brief ? "done" : "missing");
  const href = brief ? `/briefs/${brief.id}` : `/briefs/by-date/${date}/${session.id}`;
  const clickable = !!brief;

  const inner = (
    <div className="flex items-center gap-2 px-2.5 py-2 rounded-md" style={{ background: "var(--bg-elev-2)", border: "1px solid var(--border)", height: "100%" }}>
      <StatusIndicator status={status} />
      <div className="flex flex-col min-w-0">
        <span className="text-[11px] font-medium leading-tight">{session.label}</span>
        <span className="mono tabular-nums text-[9px] text-fg-muted">{session.time}</span>
      </div>
      {brief?.signalCount !== undefined && (
        <span className="ml-auto chip">{brief.signalCount} signals</span>
      )}
      {!brief && <span className="ml-auto chip t-dim">missing</span>}
    </div>
  );

  return clickable ? (
    <Link href={href} className="no-underline text-fg block">
      {inner}
    </Link>
  ) : (
    <div className="opacity-60">{inner}</div>
  );
}

function StatusIndicator({ status }: { status: BriefStatus }) {
  if (status === "done")
    return (
      <span className="chip chip-pos">
        <Check className="w-3 h-3" /> done
      </span>
    );
  if (status === "queued")
    return (
      <span className="chip chip-info">
        <span className="pulse-dot" /> queued
      </span>
    );
  if (status === "failed")
    return (
      <span className="chip chip-neg">
        <AlertCircle className="w-3 h-3" /> failed
      </span>
    );
  return (
    <span className="chip">
      <Moon className="w-3 h-3" />
    </span>
  );
}
