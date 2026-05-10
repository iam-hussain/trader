"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { api } from "@/lib/api";

type Session = "premarket" | "midday" | "postmarket";
type Provider = "anthropic" | "openai" | "google" | "ollama";

export interface RunBriefDialogProps {
  open: boolean;
  onClose: () => void;
  defaultSession?: Session;
}

interface GenerateResponse {
  jobId: string;
  briefId?: string;
}

interface JobStatusResponse {
  status: "pending" | "running" | "done" | "failed";
  error?: string;
  briefId?: string;
}

const SESSIONS: { id: Session; label: string }[] = [
  { id: "premarket", label: "Pre-market" },
  { id: "midday", label: "Mid-day" },
  { id: "postmarket", label: "Post-market" },
];

const PROVIDERS: { id: Provider; label: string }[] = [
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
  { id: "google", label: "Google" },
  { id: "ollama", label: "Ollama (local)" },
];

export function RunBriefDialog({ open, onClose, defaultSession = "premarket" }: RunBriefDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [session, setSession] = useState<Session>(defaultSession);
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [model, setModel] = useState("");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  useEffect(() => {
    if (open) {
      setSession(defaultSession);
      setStatus(null);
      setError(null);
      setRunning(false);
    }
  }, [open, defaultSession]);

  const submit = async () => {
    setError(null);
    setRunning(true);
    setStatus("Enqueuing…");
    try {
      const res = await api<GenerateResponse>("/api/briefs/generate", {
        method: "POST",
        body: JSON.stringify({
          session,
          llmProvider: provider,
          ...(model ? { llmModel: model } : {}),
        }),
      });
      // Poll
      setStatus("Generating…");
      const briefId = await pollJob(res.jobId);
      onClose();
      router.push(`/briefs/${briefId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate brief");
      setRunning(false);
      setStatus(null);
    }
  };

  return (
    <dialog
      ref={ref}
      onClose={() => {
        if (!running) onClose();
      }}
      className="b-card p-0 m-auto"
      style={{ minWidth: 380, maxWidth: 480, background: "var(--bg-elev-1)" }}
    >
      <div className="p-4 flex flex-col gap-3">
        <div className="flex items-center">
          <h2 className="text-[14px] font-semibold">Run brief</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            className="btn btn-ghost btn-sm ml-auto"
            aria-label="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wide t-dim mb-1">Session</div>
          <div className="seg">
            {SESSIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={session === s.id ? "active" : ""}
                onClick={() => setSession(s.id)}
                disabled={running}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wide t-dim mb-1">LLM provider</div>
          <select
            className="input w-full"
            value={provider}
            onChange={(e) => setProvider(e.target.value as Provider)}
            disabled={running}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wide t-dim mb-1">
            Model (optional)
          </div>
          <input
            className="input mono w-full"
            placeholder="e.g. claude-opus-4-7"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={running}
          />
        </div>

        {status && (
          <div className="text-[11px] text-fg-muted flex items-center gap-2">
            <span className="pulse-dot" />
            {status}
          </div>
        )}
        {error && (
          <div className="b-card p-2 text-[11px] t-neg">{error}</div>
        )}

        <div className="flex items-center gap-2 mt-1">
          <button
            type="button"
            className="btn btn-ghost ml-auto"
            onClick={onClose}
            disabled={running}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={submit}
            disabled={running}
          >
            {running ? "Generating…" : "Generate"}
          </button>
        </div>
      </div>
    </dialog>
  );
}

/**
 * Poll the job endpoint every 1.5 s until status is done or failed.
 * Resolves with the briefId on success, throws on failure or timeout.
 */
async function pollJob(jobId: string, maxMs = 5 * 60_000): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    await sleep(1500);
    const res = await api<JobStatusResponse>(`/api/briefs/jobs/${jobId}`);
    if (res.status === "done") {
      if (!res.briefId) throw new Error("Job done but no briefId returned");
      return res.briefId;
    }
    if (res.status === "failed") {
      throw new Error(res.error || "Job failed");
    }
  }
  throw new Error("Timed out waiting for brief generation");
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
