"use client";
import { use, useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { SignalCard } from "@/components/SignalCard";
import { MacroStrip } from "@/components/MacroStrip";
import { api, fetcher } from "@/lib/api";

type Session = "premarket" | "midday" | "postmarket";
type Direction = "long" | "short";
type Instrument = "stock" | "option";
type HoldPeriod = "intraday" | "swing" | "position";

interface OptionLeg {
  type: "call" | "put";
  strike: number;
  expiry: string;
}

interface Signal {
  id?: string;
  ticker: string;
  name?: string;
  direction: Direction;
  instrument: Instrument;
  thesis: string;
  signals?: string[];
  catalysts?: string[];
  invalidation?: string;
  entry: number;
  target1: number;
  target2?: number;
  stop: number;
  qty: number;
  riskUsd?: number;
  riskPct?: number;
  riskReward: number;
  confidence: number; // 0..1
  holdPeriod: HoldPeriod;
  status?: "pending" | "staged" | "rejected";
  optionLeg?: OptionLeg;
}

interface MacroSnapshot {
  vix: number;
  vixChange: number;
  spyPct: number;
  qqqPct: number;
  yield10y?: number;
  dxy?: number;
  goldPct?: number;
  fearGreed?: number;
}

interface Brief {
  id: string;
  date: string;
  session: Session;
  marketRegime?: "risk-on" | "neutral" | "risk-off";
  macro?: MacroSnapshot;
  context?: string;
  summary?: string;
  signals: Signal[];
  warnings?: string[];
  llmProvider: string;
  llmModel: string;
  generatedAt?: string;
}

interface JobStatusResponse {
  status: "pending" | "running" | "done" | "failed";
  error?: string;
  briefId?: string;
}

const SESSION_LABEL: Record<Session, string> = {
  premarket: "Pre-market",
  midday: "Mid-day",
  postmarket: "Post-market",
};

const PROVIDERS = ["anthropic", "openai", "google", "ollama"];

function formatInstrument(s: Signal): string {
  if (s.instrument === "stock") return "EQUITY";
  if (s.optionLeg) {
    return `${s.optionLeg.type.toUpperCase()} ${s.optionLeg.strike} ${s.optionLeg.expiry}`;
  }
  return "OPTION";
}

export default function BriefDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR<Brief>(
    `/api/briefs/${id}`,
    fetcher,
    { keepPreviousData: true },
  );
  const [reRunning, setReRunning] = useState(false);
  const [reRunErr, setReRunErr] = useState<string | null>(null);
  const [pendingSig, setPendingSig] = useState<string | null>(null);

  const crumbs = data
    ? ["Workspace", "Briefs", `${data.date} · ${SESSION_LABEL[data.session]}`]
    : ["Workspace", "Briefs", "…"];

  const reRunWith = async (provider: string) => {
    if (!data) return;
    setReRunErr(null);
    setReRunning(true);
    try {
      const res = await api<{ jobId: string; briefId?: string }>(
        "/api/briefs/generate",
        {
          method: "POST",
          body: JSON.stringify({
            session: data.session,
            llmProvider: provider,
          }),
        },
      );
      const newId = await pollJob(res.jobId);
      router.push(`/briefs/${newId}`);
    } catch (e) {
      setReRunErr(e instanceof Error ? e.message : "Re-run failed");
    } finally {
      setReRunning(false);
    }
  };

  const stage = async (s: Signal) => {
    if (!s.id) return;
    setPendingSig(s.id);
    try {
      await api(`/api/briefs/${id}/signals/${s.id}/stage`, { method: "POST" });
      await mutate();
    } catch {
      // Silent — caller can retry from order ticket flow.
    } finally {
      setPendingSig(null);
    }
  };

  const skip = async (s: Signal) => {
    if (!s.id) return;
    setPendingSig(s.id);
    try {
      await api(`/api/briefs/${id}/signals/${s.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "rejected" }),
      });
      await mutate();
    } catch {
      // ignore
    } finally {
      setPendingSig(null);
    }
  };

  return (
    <>
      <Topbar
        crumbs={crumbs}
        right={
          data && (
            <ReRunMenu
              providers={PROVIDERS}
              current={data.llmProvider}
              onPick={reRunWith}
              disabled={reRunning}
            />
          )
        }
      />
      <div className="page max-w-[1100px]">
        {error && (
          <div className="b-card p-3 flex items-center gap-2 text-[12px] t-neg">
            <AlertCircle className="w-3.5 h-3.5" />
            Could not load brief.
            <button
              type="button"
              className="btn btn-sm ml-auto"
              onClick={() => mutate()}
            >
              Retry
            </button>
          </div>
        )}
        {reRunErr && (
          <div className="b-card p-3 flex items-center gap-2 text-[12px] t-neg">
            <AlertCircle className="w-3.5 h-3.5" />
            {reRunErr}
          </div>
        )}

        {isLoading && !data && (
          <>
            <div className="skel" style={{ height: 80 }} />
            <div className="skel" style={{ height: 60 }} />
            <div className="skel" style={{ height: 200 }} />
            <div className="skel" style={{ height: 200 }} />
          </>
        )}

        {data && (
          <>
            <div className="b-card p-3 flex flex-wrap items-center gap-2">
              <div className="flex flex-col">
                <span className="text-[13px] font-semibold">
                  {data.date} · {SESSION_LABEL[data.session]}
                </span>
                {data.generatedAt && (
                  <span className="mono tabular-nums text-[10px] text-fg-muted">
                    generated {new Date(data.generatedAt).toLocaleString("en-US", {
                      timeZone: "America/New_York",
                    })} ET
                  </span>
                )}
              </div>
              <span className="chip ml-auto">
                {data.llmProvider} · {data.llmModel}
              </span>
              {data.marketRegime && (
                <span
                  className={`chip ${
                    data.marketRegime === "risk-on"
                      ? "chip-pos"
                      : data.marketRegime === "risk-off"
                        ? "chip-neg"
                        : "chip-info"
                  }`}
                >
                  {data.marketRegime}
                </span>
              )}
            </div>

            {data.macro && (
              <MacroStrip
                regime={data.marketRegime ?? "neutral"}
                items={macroItems(data.macro)}
              />
            )}

            {data.summary && (
              <div className="b-card p-3 text-[12px] leading-[1.6]">
                {data.summary}
              </div>
            )}

            {data.warnings && data.warnings.length > 0 && (
              <div className="b-card p-3 flex flex-col gap-1">
                {data.warnings.map((w, i) => (
                  <div key={i} className="text-[11px] t-warn flex items-start gap-1.5">
                    <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-2">
              {data.signals.map((s, idx) => (
                <SignalCard
                  key={s.id ?? `${s.ticker}-${idx}`}
                  ticker={s.ticker}
                  name={s.name}
                  direction={s.direction}
                  instrument={formatInstrument(s)}
                  thesis={s.thesis}
                  signals={s.signals}
                  catalysts={s.catalysts}
                  invalidation={s.invalidation}
                  entry={s.entry}
                  target1={s.target1}
                  target2={s.target2}
                  stop={s.stop}
                  qty={s.qty}
                  riskUsd={s.riskUsd}
                  riskPct={s.riskPct}
                  riskReward={s.riskReward}
                  confidence={Math.round(s.confidence * 100)}
                  holdPeriod={s.holdPeriod}
                  llmProvider={data.llmProvider}
                  llmModel={data.llmModel}
                  staged={s.status === "staged" || pendingSig === s.id}
                  onStage={() => stage(s)}
                  onSkip={() => skip(s)}
                />
              ))}
              {data.signals.length === 0 && (
                <div className="b-card p-6 text-center">
                  <div className="text-[13px] font-medium">
                    No high-quality setups found this session.
                  </div>
                  <p className="text-[11px] text-fg-muted mt-1">
                    The brief ran successfully but no signals cleared the
                    confidence and risk-reward thresholds.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function macroItems(m: MacroSnapshot) {
  const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
  const items: { label: string; value: string; changeStr?: string; positive?: boolean }[] = [
    {
      label: "VIX",
      value: m.vix.toFixed(2),
      changeStr: fmtPct(m.vixChange),
      positive: m.vixChange < 0,
    },
    { label: "SPY", value: fmtPct(m.spyPct), changeStr: undefined, positive: m.spyPct >= 0 },
    { label: "QQQ", value: fmtPct(m.qqqPct), changeStr: undefined, positive: m.qqqPct >= 0 },
  ];
  if (m.yield10y !== undefined) {
    items.push({ label: "10Y", value: `${m.yield10y.toFixed(2)}%` });
  }
  if (m.dxy !== undefined) items.push({ label: "DXY", value: m.dxy.toFixed(2) });
  if (m.goldPct !== undefined)
    items.push({ label: "GOLD", value: fmtPct(m.goldPct), positive: m.goldPct >= 0 });
  if (m.fearGreed !== undefined)
    items.push({ label: "F&G", value: m.fearGreed.toString() });
  return items;
}

function ReRunMenu({
  providers,
  current,
  onPick,
  disabled,
}: {
  providers: string[];
  current: string;
  onPick: (p: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
      >
        <RefreshCw className="w-3 h-3" />
        {disabled ? "Re-running…" : "Re-run with…"}
      </button>
      {open && !disabled && (
        <div
          className="absolute right-0 mt-1 b-card p-1 flex flex-col z-10"
          style={{ minWidth: 140 }}
        >
          {providers.map((p) => (
            <button
              key={p}
              type="button"
              className="btn btn-ghost btn-sm justify-start"
              onClick={() => {
                setOpen(false);
                onPick(p);
              }}
            >
              {p}
              {p === current && <span className="chip ml-auto">current</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

async function pollJob(jobId: string, maxMs = 5 * 60_000): Promise<string> {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    await new Promise<void>((r) => setTimeout(r, 1500));
    const res = await api<JobStatusResponse>(`/api/briefs/jobs/${jobId}`);
    if (res.status === "done") {
      if (!res.briefId) throw new Error("Job done but no briefId");
      return res.briefId;
    }
    if (res.status === "failed") throw new Error(res.error || "Job failed");
  }
  throw new Error("Timed out");
}
