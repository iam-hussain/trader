"use client";
import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Loader2, ExternalLink, History } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { api, fetcher } from "@/lib/api";

type Session = "premarket" | "midday" | "postmarket";

interface ReplaySummary {
  id: string;
  date: string;
  session: Session | string;
  status: string;
  createdAt: string;
  llmProvider?: string;
  llmModel?: string;
  matchCount?: number;
  extraCount?: number;
  missingCount?: number;
}

interface ReplaysResponse {
  replays: ReplaySummary[];
}

interface JobStatus {
  status: string;
  replayId?: string;
  runId?: string;
  error?: string;
}

function yesterday(): string {
  const d = new Date(Date.now() - 86400_000);
  return d.toISOString().slice(0, 10);
}

async function pollReplayJob(
  jobId: string,
  interval = 1500,
  timeoutMs = 300_000,
): Promise<JobStatus> {
  const start = Date.now();
  while (true) {
    const job = await api<JobStatus>(`/api/replay/jobs/${encodeURIComponent(jobId)}`);
    if (job.status === "done" || job.status === "failed") return job;
    if (Date.now() - start > timeoutMs)
      return { ...job, status: "failed", error: job.error ?? "Polling timed out" };
    await new Promise((r) => setTimeout(r, interval));
  }
}

function StatusChip({ status }: { status: string }) {
  const cls =
    status === "done"
      ? "chip chip-pos"
      : status === "failed"
        ? "chip chip-neg"
        : status === "running"
          ? "chip chip-info"
          : "chip";
  return <span className={cls}>{status}</span>;
}

export default function ReplayPage() {
  const router = useRouter();
  const [date, setDate] = useState(yesterday());
  const [session, setSession] = useState<Session>("premarket");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const { data: replays, mutate } = useSWR<ReplaysResponse>(
    "/api/replay",
    fetcher,
    { refreshInterval: 5_000 },
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    setStatusMsg("Submitting…");
    try {
      const body: Record<string, unknown> = { date, session };
      if (provider.trim()) body.llmProvider = provider.trim();
      if (model.trim()) body.llmModel = model.trim();
      const res = await api<{ replayId: string; jobId: string }>(
        "/api/replay/run",
        { method: "POST", body: JSON.stringify(body) },
      );
      setStatusMsg("Running…");
      const job = await pollReplayJob(res.jobId);
      if (job.status === "done") {
        const id = job.replayId ?? res.replayId;
        router.push(`/replay/${encodeURIComponent(id)}`);
      } else {
        setErr(job.error ?? "Replay failed");
        setStatusMsg(null);
      }
      void mutate();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Replay failed");
      setStatusMsg(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Topbar crumbs={["Workspace", "Replay"]} />
      <div className="page max-w-[1100px] flex flex-col gap-3">
        <div className="b-card p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-fg-dim" />
            <div className="text-[13px] font-medium">Replay engine</div>
            <span className="text-[11px] t-dim">
              Re-run brief generation for a past session and compare to the
              actual brief.
            </span>
          </div>
          <form
            onSubmit={submit}
            className="grid grid-cols-1 sm:grid-cols-4 gap-2"
          >
            <label className="flex flex-col gap-1 text-[11px]">
              <span className="t-dim">Date</span>
              <input
                type="date"
                className="input mono h-[28px] text-[12px]"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <div className="flex flex-col gap-1 text-[11px] sm:col-span-2">
              <span className="t-dim">Session</span>
              <div className="seg">
                {(["premarket", "midday", "postmarket"] as Session[]).map(
                  (s) => (
                    <button
                      key={s}
                      type="button"
                      className={clsx(session === s && "active")}
                      onClick={() => setSession(s)}
                    >
                      {s}
                    </button>
                  ),
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-[11px]">
                <span className="t-dim">Provider</span>
                <input
                  className="input mono h-[28px] text-[12px]"
                  placeholder="auto"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px]">
                <span className="t-dim">Model</span>
                <input
                  className="input mono h-[28px] text-[12px]"
                  placeholder="auto"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                />
              </label>
            </div>
            <div className="sm:col-span-4 flex items-center gap-2">
              {statusMsg && (
                <span className="text-[11px] t-dim flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {statusMsg}
                </span>
              )}
              {err && <span className="text-[11px] t-neg">{err}</span>}
              <button
                type="submit"
                className="btn btn-primary btn-sm ml-auto"
                disabled={busy}
              >
                {busy ? "Running…" : "Run replay"}
              </button>
            </div>
          </form>
        </div>

        <section className="flex flex-col gap-2">
          <div className="text-[11px] uppercase tracking-[0.06em] text-fg-muted font-medium">
            Replay history
          </div>
          {!replays ? (
            <div className="b-card p-3">
              <div className="skel h-3 w-full mb-1" />
              <div className="skel h-3 w-2/3" />
            </div>
          ) : replays.replays.length === 0 ? (
            <div className="b-card p-3 text-[12px] t-dim">No replays yet.</div>
          ) : (
            <div className="b-card p-0 overflow-hidden">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-[0.06em] text-fg-muted">
                    <th className="text-left p-2 font-medium">Date</th>
                    <th className="text-left p-2 font-medium">Session</th>
                    <th className="text-left p-2 font-medium">Status</th>
                    <th className="text-left p-2 font-medium">LLM</th>
                    <th className="text-right p-2 font-medium">Match</th>
                    <th className="text-right p-2 font-medium">Extra</th>
                    <th className="text-right p-2 font-medium">Missing</th>
                    <th className="text-left p-2 font-medium">Created</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {replays.replays.map((r) => (
                    <tr
                      key={r.id}
                      style={{ borderTop: "1px solid var(--border)" }}
                    >
                      <td className="p-2 mono tabular-nums">{r.date}</td>
                      <td className="p-2">{r.session}</td>
                      <td className="p-2">
                        <StatusChip status={r.status} />
                      </td>
                      <td className="p-2 mono tabular-nums t-dim">
                        {r.llmProvider ?? "—"}
                        {r.llmModel ? ` · ${r.llmModel}` : ""}
                      </td>
                      <td className="p-2 text-right mono tabular-nums t-pos">
                        {r.matchCount ?? "—"}
                      </td>
                      <td className="p-2 text-right mono tabular-nums">
                        {r.extraCount ?? "—"}
                      </td>
                      <td className="p-2 text-right mono tabular-nums t-neg">
                        {r.missingCount ?? "—"}
                      </td>
                      <td className="p-2 mono tabular-nums t-dim">
                        {new Date(r.createdAt).toLocaleString()}
                      </td>
                      <td className="p-2 text-right">
                        <Link
                          href={`/replay/${encodeURIComponent(r.id)}`}
                          className="btn btn-ghost btn-sm"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
