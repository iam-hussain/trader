"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, Filter, LineChart, FlaskConical, Plus, Sparkles, Zap, Calendar } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { MacroStrip, type MacroStripProps } from "@/components/MacroStrip";
import { SectorHeatmap } from "@/components/SectorHeatmap";
import { BriefTile } from "@/components/BriefTile";
import { SignalRow } from "@/components/SignalRow";
import { RiskCard } from "@/components/RiskCard";
import { Spark, walk } from "@/components/Spark";
import { api } from "@/lib/api";
import { toast, notImplemented } from "@/lib/toast";

// Phase-2: real data plumbing. Fallback mock arrays render until the first
// fetch resolves, and remain visible if a given endpoint errors.

const SECTORS = [
  { label: "Tech", pct: 1.42 },
  { label: "Comm", pct: 0.84 },
  { label: "Cons-D", pct: 0.61 },
  { label: "Financ", pct: 0.32 },
  { label: "Health", pct: 0.18 },
  { label: "Indust", pct: 0.05 },
  { label: "Mat", pct: -0.12 },
  { label: "Cons-S", pct: -0.21 },
  { label: "Energy", pct: -0.84 },
  { label: "RE", pct: -0.42 },
  { label: "Util", pct: -0.61 },
];

type MacroItem = MacroStripProps["items"][number];
type Regime = NonNullable<MacroStripProps["regime"]>;

const MACRO: MacroItem[] = [
  { label: "VIX", value: "14.82", changeStr: "−2.1%", positive: true },
  { label: "SPY", value: "528.40", changeStr: "+0.42%", positive: true },
  { label: "QQQ", value: "452.18", changeStr: "+0.61%", positive: true },
  { label: "10Y", value: "4.31%", changeStr: "+3bp", positive: false },
  { label: "DXY", value: "104.21", changeStr: "+0.18%", positive: false },
  { label: "GOLD", value: "2,348", changeStr: "+0.27%", positive: true },
  { label: "CRUDE", value: "78.42", changeStr: "−0.84%", positive: false },
  { label: "BTC", value: "68,420", changeStr: "+1.4%", positive: true },
];

interface PositionRow {
  ticker: string;
  side: string;
  optionTag: string | null;
  qty: number;
  entry: number;
  last: number;
  pnl: number;
  pct: number;
  seed: number;
  drift: number;
}

const POSITIONS: PositionRow[] = [
  { ticker: "NVDA", side: "LONG", optionTag: null, qty: 25, entry: 912.10, last: 938.42, pnl: 658.0, pct: 2.88, seed: 1, drift: 0.06 },
  { ticker: "AAPL", side: "LONG", optionTag: null, qty: 100, entry: 218.5, last: 221.04, pnl: 254.0, pct: 1.16, seed: 2, drift: 0.04 },
  { ticker: "SPY", side: "OPT", optionTag: "P 525", qty: 2, entry: 3.2, last: 1.85, pnl: -270.0, pct: -42.19, seed: 3, drift: -0.4 },
  { ticker: "MSFT", side: "OPT", optionTag: "C 440", qty: 5, entry: 8.2, last: 10.6, pnl: 1200.0, pct: 29.27, seed: 4, drift: 0.2 },
  { ticker: "TSLA", side: "SHORT", optionTag: null, qty: 50, entry: 252.4, last: 249.32, pnl: 154.0, pct: 1.22, seed: 5, drift: -0.05 },
  { ticker: "META", side: "LONG", optionTag: null, qty: 15, entry: 596.0, last: 594.2, pnl: -27.0, pct: -0.30, seed: 6, drift: 0.01 },
];

type SignalProps = React.ComponentProps<typeof SignalRow>;

const SIGNALS: SignalProps[] = [
  { ticker: "NVDA", name: "Nvidia Corp", direction: "long", instrument: "CALL DEBIT", thesis: "Earnings drift continuation, RS leader vs SMH; entry on pullback to 20EMA.", entry: 932.4, target: 965.0, stop: 918.0, riskReward: 2.3, confidence: 72 },
  { ticker: "SPY", name: "SPDR S&P 500", direction: "hedge", instrument: "PUT 525/520", thesis: "Tail hedge ahead of NFP Fri; protects long book delta if VIX backs up > 16.", entry: 1.85, target: 3.4, stop: 0.95, riskReward: 1.7, confidence: 58 },
  { ticker: "TSLA", name: "Tesla Inc", direction: "short", instrument: "EQUITY", thesis: "Lower-high pattern, volume divergence on bounce; deliveries miss priced in.", entry: 251.2, target: 238.0, stop: 258.4, riskReward: 1.8, confidence: 64 },
  { ticker: "AMD", name: "Adv Micro Devices", direction: "long", instrument: "EQUITY", thesis: "Pre-earnings setup, IV rank 38, options unusually active in Feb 200 calls.", entry: 184.2, target: 198.0, stop: 178.4, riskReward: 2.4, confidence: 68, staged: true },
  { ticker: "XOM", name: "Exxon Mobil", direction: "wait", instrument: "EQUITY", thesis: "Crude weakness; wait for 110 reclaim before entry. Soft signal.", entry: 110.4, target: 116.0, stop: 107.8, riskReward: 2.1, confidence: 42 },
];

interface WatchlistPreviewItem {
  t: string;
  p: number;
  c: number;
  seed: number;
}

const WATCHLIST_PREVIEW: WatchlistPreviewItem[] = [
  { t: "AAPL", p: 221.04, c: 1.16, seed: 11 },
  { t: "NVDA", p: 938.42, c: 2.88, seed: 12 },
  { t: "MSFT", p: 442.10, c: 0.61, seed: 13 },
  { t: "GOOGL", p: 198.20, c: 0.42, seed: 14 },
  { t: "AMZN", p: 224.80, c: -0.18, seed: 15 },
  { t: "TSLA", p: 249.32, c: -1.22, seed: 16 },
  { t: "META", p: 594.20, c: -0.30, seed: 17 },
  { t: "AMD", p: 184.20, c: 1.84, seed: 18 },
];

function formatEtTime(d: Date) {
  return (
    d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "America/New_York",
    }) + " ET"
  );
}

// ---------- API response shapes ----------

interface MacroRegimeResponse {
  regime?: string;
  items?: MacroItem[];
}

interface PositionsResponse {
  positions: unknown[];
  asOf?: string;
  source?: string;
}

interface PnlResponse {
  pnl?: number;
  realizedPnl?: number;
  unrealizedPnl?: number;
  pct?: number;
  total?: number;
}

interface BriefSignal {
  ticker?: string;
  symbol?: string;
  name?: string;
  direction?: string;
  instrument?: string;
  thesis?: string;
  rationale?: string;
  entry?: number;
  target?: number;
  stop?: number;
  riskReward?: number;
  rr?: number;
  confidence?: number;
  staged?: boolean;
}

interface BriefRecord {
  id: string;
  date?: string;
  session?: string;
  status?: string;
  summary?: string | null;
  signals?: BriefSignal[];
  signalCount?: number;
}

interface BriefsListResponse {
  briefs?: BriefRecord[];
}

interface WatchlistRow {
  id?: string;
  name?: string;
  tickers?: string[];
}

interface ProviderRow {
  provider: string;
  configured?: boolean;
  source?: string;
}

interface SettingsResponse {
  defaultLlmProvider?: string;
}

const LLM_PROVIDER_SET = new Set([
  "anthropic",
  "openai",
  "google",
  "ollama",
  "lmstudio",
]);

// ---------- helpers ----------

function regimeFromString(r: unknown): Regime {
  if (r === "risk-on" || r === "risk_on" || r === "RISK_ON") return "risk-on";
  if (r === "risk-off" || r === "risk_off" || r === "RISK_OFF") return "risk-off";
  return "neutral";
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function normalizePosition(raw: unknown, idx: number): PositionRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const ticker = String(r.symbol ?? r.ticker ?? "").toUpperCase();
  if (!ticker) return null;
  const qty = Number(r.qty ?? r.quantity ?? 0);
  const entry = Number(r.avgPrice ?? r.entryPrice ?? r.entry ?? 0);
  const last = Number(r.lastPrice ?? r.last ?? r.markPrice ?? entry);
  const pnl = Number(r.unrealizedPnl ?? r.pnl ?? (last - entry) * qty);
  const cost = entry * qty;
  const pct = cost !== 0 ? (pnl / Math.abs(cost)) * 100 : 0;
  const sideRaw = String(r.side ?? (qty < 0 ? "SHORT" : "LONG")).toUpperCase();
  const isOpt = String(r.assetType ?? r.type ?? "").toUpperCase().includes("OPT");
  const side = isOpt ? "OPT" : sideRaw === "SHORT" ? "SHORT" : "LONG";
  const optionTag = isOpt
    ? String(r.optionTag ?? r.strike ?? r.contract ?? "OPT")
    : null;
  return {
    ticker,
    side,
    optionTag,
    qty: Math.abs(qty),
    entry,
    last,
    pnl,
    pct,
    seed: idx + 100,
    drift: pnl >= 0 ? 0.05 : -0.05,
  };
}

function normalizeSignal(raw: BriefSignal, idx: number): SignalProps | null {
  const ticker = (raw.ticker ?? raw.symbol ?? "").toString().toUpperCase();
  if (!ticker) return null;
  const dirRaw = (raw.direction ?? "long").toString().toLowerCase();
  const direction: SignalProps["direction"] =
    dirRaw === "short" || dirRaw === "hedge" || dirRaw === "wait" ? dirRaw : "long";
  return {
    ticker,
    name: raw.name ?? ticker,
    direction,
    instrument: raw.instrument ?? "EQUITY",
    thesis: raw.thesis ?? raw.rationale ?? "",
    entry: Number(raw.entry ?? 0),
    target: Number(raw.target ?? 0),
    stop: Number(raw.stop ?? 0),
    riskReward: Number(raw.riskReward ?? raw.rr ?? 0),
    confidence: Number(raw.confidence ?? 50),
    staged: raw.staged ?? (idx > 2),
  };
}

function normalizeWatchlist(raw: unknown): WatchlistPreviewItem[] | null {
  let arr: unknown[] | null = null;
  if (Array.isArray(raw)) arr = raw;
  else if (raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown[] }).items)) {
    arr = (raw as { items: unknown[] }).items;
  }
  if (!arr) return null;
  // Flatten any tickers field on each row into a deduped ticker list.
  const tickers = new Set<string>();
  for (const row of arr) {
    if (typeof row === "string") {
      tickers.add(row.toUpperCase());
      continue;
    }
    if (!row || typeof row !== "object") continue;
    const r = row as WatchlistRow & { ticker?: string; symbol?: string };
    if (Array.isArray(r.tickers)) r.tickers.forEach((t) => tickers.add(t.toUpperCase()));
    if (r.ticker) tickers.add(r.ticker.toUpperCase());
    if (r.symbol) tickers.add(r.symbol.toUpperCase());
  }
  if (tickers.size === 0) return [];
  let i = 30;
  return Array.from(tickers)
    .slice(0, 12)
    .map((t) => ({ t, p: 0, c: 0, seed: ++i }));
}

type PosFilter = "all" | "equities" | "options";
type SigFilter = "all" | "long" | "short" | "options";
type RangeFilter = "today" | "week" | "custom";

export default function DashboardPage() {
  const [asOfTime, setAsOfTime] = useState<string | undefined>(undefined);

  // Live data state (falls back to hardcoded arrays if fetch fails)
  const [macroItems, setMacroItems] = useState<MacroItem[]>(MACRO);
  const [regime, setRegime] = useState<Regime>("risk-on");
  const [positions, setPositions] = useState<PositionRow[]>(POSITIONS);
  const [pnlTotal, setPnlTotal] = useState<number | null>(null);
  const [pnlPct, setPnlPct] = useState<number | null>(null);
  const [signals, setSignals] = useState<SignalProps[]>(SIGNALS);
  const [briefMeta, setBriefMeta] = useState<{ status?: string; signalCount?: number }>({});
  const [watchlist, setWatchlist] = useState<WatchlistPreviewItem[]>(WATCHLIST_PREVIEW);

  // UI state
  const [range, setRange] = useState<RangeFilter>("today");
  const [posFilter, setPosFilter] = useState<PosFilter>("all");
  const [sigFilter, setSigFilter] = useState<SigFilter>("all");
  const [providerOpen, setProviderOpen] = useState(false);
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [symInput, setSymInput] = useState("");

  // ---------- effects ----------

  useEffect(() => {
    setAsOfTime(formatEtTime(new Date()));
    const id = setInterval(() => setAsOfTime(formatEtTime(new Date())), 1000);
    return () => clearInterval(id);
  }, []);

  const refetchBriefs = async () => {
    try {
      const res = await api<BriefsListResponse>("/api/briefs/");
      const latest = res.briefs?.[0];
      if (latest) {
        setBriefMeta({ status: latest.status, signalCount: latest.signalCount });
        if (latest.signals && latest.signals.length) {
          const mapped = latest.signals
            .map((s, i) => normalizeSignal(s, i))
            .filter((s): s is SignalProps => s !== null);
          if (mapped.length) setSignals(mapped);
        }
      }
    } catch (e) {
      toast(`Failed to load briefs: ${errMsg(e)}`, "error");
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadMacro = async () => {
      try {
        const res = await api<MacroRegimeResponse>("/api/macro/regime");
        if (cancelled) return;
        if (res.items && Array.isArray(res.items) && res.items.length) {
          setMacroItems(res.items);
        }
        setRegime(regimeFromString(res.regime));
      } catch {
        // Silent fallback per spec — quant bug being fixed in parallel.
        if (!cancelled) toast("Macro regime unavailable", "error");
      }
    };

    const loadPositions = async () => {
      try {
        const res = await api<PositionsResponse>("/api/positions/");
        if (cancelled) return;
        if (Array.isArray(res.positions) && res.positions.length) {
          const mapped = res.positions
            .map((p, i) => normalizePosition(p, i))
            .filter((p): p is PositionRow => p !== null);
          if (mapped.length) setPositions(mapped);
          else setPositions([]); // empty broker → empty list
        } else {
          setPositions([]);
        }
      } catch (e) {
        if (!cancelled) toast(`Failed to load positions: ${errMsg(e)}`, "error");
      }
    };

    const loadPnl = async () => {
      try {
        const res = await api<PnlResponse>("/api/positions/pnl");
        if (cancelled) return;
        const total = res.total ?? res.pnl ?? 0;
        setPnlTotal(total);
        if (typeof res.pct === "number") setPnlPct(res.pct);
      } catch (e) {
        if (!cancelled) toast(`Failed to load P&L: ${errMsg(e)}`, "error");
      }
    };

    const loadWatchlist = async () => {
      try {
        const res = await api<unknown>("/api/watchlist/");
        if (cancelled) return;
        const norm = normalizeWatchlist(res);
        if (norm && norm.length) setWatchlist(norm);
      } catch (e) {
        if (!cancelled) toast(`Failed to load watchlist: ${errMsg(e)}`, "error");
      }
    };

    const loadActiveLlm = async () => {
      try {
        const res = await api<SettingsResponse>("/api/settings/");
        if (cancelled) return;
        if (res.defaultLlmProvider) setSelectedProvider(res.defaultLlmProvider);
      } catch {
        // non-fatal — dropdown can still be opened manually
      }
    };

    void Promise.all([loadMacro(), loadPositions(), loadPnl(), loadWatchlist(), refetchBriefs(), loadActiveLlm()]);

    return () => {
      cancelled = true;
    };
  }, []);

  // Provider dropdown (lazy-loaded on first open)
  const ensureProviders = async () => {
    if (providersLoaded) return;
    try {
      const res = await api<ProviderRow[]>("/api/providers/");
      setProviders(Array.isArray(res) ? res : []);
      setProvidersLoaded(true);
    } catch (e) {
      toast(`Failed to load providers: ${errMsg(e)}`, "error");
    }
  };

  const toggleProviderDropdown = async () => {
    const next = !providerOpen;
    setProviderOpen(next);
    if (next) await ensureProviders();
  };

  // Keyboard shortcut: g b → run brief
  useEffect(() => {
    let lastG = 0;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || (e.target as HTMLElement | null)?.isContentEditable) return;
      if (e.key === "g") {
        lastG = Date.now();
        return;
      }
      if (e.key === "b" && Date.now() - lastG < 800) {
        lastG = 0;
        void runBrief("midday");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvider, busy]);

  const selectActiveProvider = async (provider: string) => {
    if (selectedProvider === provider) return;
    setSelectedProvider(provider);
    try {
      await api("/api/settings/", {
        method: "PATCH",
        body: JSON.stringify({ defaultLlmProvider: provider }),
      });
      toast(`Active LLM → ${provider}`, "success");
    } catch (e) {
      toast(`Failed to set active LLM: ${errMsg(e)}`, "error");
    }
  };

  const runBrief = async (
    session: "premarket" | "midday" | "postmarket",
    symbols?: string[],
  ) => {
    if (busy) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { session, symbols: symbols ?? [] };
      if (selectedProvider) body.llmProvider = selectedProvider;
      await api("/api/briefs/generate", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (symbols && symbols.length === 1) {
        toast(`Brief queued for ${symbols[0]}`, "success");
      } else {
        toast(session === "midday" ? "Mid-day brief queued" : "Brief queued", "success");
      }
      await refetchBriefs();
    } catch (e) {
      toast(`Failed to queue brief: ${errMsg(e)}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const runBriefForSymbol = () => {
    const sym = symInput.trim().toUpperCase();
    if (!sym) return;
    void runBrief("midday", [sym]);
  };

  // ---------- derived state ----------

  const filteredPositions = positions.filter((p) => {
    if (posFilter === "all") return true;
    if (posFilter === "options") return p.side === "OPT";
    return p.side !== "OPT";
  });

  const filteredSignals = signals.filter((s) => {
    if (sigFilter === "all") return true;
    if (sigFilter === "long") return s.direction === "long";
    if (sigFilter === "short") return s.direction === "short";
    if (sigFilter === "options") return /OPT|CALL|PUT/i.test(s.instrument ?? "");
    return true;
  });

  const totalPnl = pnlTotal ?? filteredPositions.reduce((s, p) => s + p.pnl, 0);
  const totalPnlPct = pnlPct ?? 1.82;

  // ---------- render ----------

  return (
    <>
      <Topbar
        crumbs={["Workspace", "Today"]}
        right={
          <>
            <div className="seg">
              <button
                className={range === "today" ? "active" : ""}
                onClick={() => setRange("today")}
              >
                Today
              </button>
              <button
                className={range === "week" ? "active" : ""}
                onClick={() => setRange("week")}
              >
                Week
              </button>
              <button
                className={range === "custom" ? "active" : ""}
                onClick={() => setRange("custom")}
              >
                Custom
              </button>
            </div>
            <div className="divider-v" />
            <input
              type="text"
              value={symInput}
              onChange={(e) =>
                setSymInput(e.target.value.toUpperCase().slice(0, 10))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") runBriefForSymbol();
              }}
              placeholder="Symbol"
              aria-label="Ticker symbol for on-demand brief"
              maxLength={10}
              className="input input-sm"
              style={{
                width: 84,
                height: 26,
                padding: "0 8px",
                fontSize: 12,
                fontFamily: "var(--font-mono, ui-monospace, monospace)",
                background: "var(--bg-elev-1)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                color: "var(--fg)",
                textTransform: "uppercase",
              }}
            />
            <button
              className="btn btn-sm"
              onClick={runBriefForSymbol}
              disabled={busy || symInput.trim().length === 0}
              title="Run brief for the entered symbol"
            >
              <Zap className="w-3.5 h-3.5" /> Run for {symInput.trim() || "—"}
            </button>
            <button
              className="btn btn-sm"
              onClick={() => runBrief("midday")}
              disabled={busy}
            >
              <Zap className="w-3.5 h-3.5" /> Run brief <span className="kbd">g b</span>
            </button>
          </>
        }
      />

      <MacroStrip regime={regime} items={macroItems} asOfTime={asOfTime} />
      <SectorHeatmap sectors={SECTORS} />

      <div className="page">
        {/* Hero CTA + brief tiles */}
        <div className="grid gap-3" style={{ gridTemplateColumns: "300px 1fr 1fr 1fr" }}>
          <div
            className="b-card flex flex-col gap-2"
            style={{
              padding: 16,
              background: "linear-gradient(135deg, color-mix(in oklab, var(--primary) 18%, var(--bg-elev-1)), var(--bg-elev-1))",
              borderColor: "color-mix(in oklab, var(--primary) 35%, var(--border))",
            }}
          >
            <div className="text-[11px] text-fg-muted uppercase tracking-[0.06em] font-medium">
              {new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · 09:41 ET
            </div>
            <div className="text-[18px] font-semibold leading-[1.2] tracking-tight">Run morning brief</div>
            <div className="text-[11px] text-fg-muted leading-[1.5]">
              Scan watchlist + pre-market movers, run thesis through the selected LLM provider.
            </div>
            <div className="flex gap-1.5 mt-auto relative">
              <button
                className="btn btn-primary btn-lg flex-1 justify-center"
                onClick={() => runBrief("midday")}
                disabled={busy}
              >
                <Zap className="w-4 h-4" /> Run brief
                <span
                  className="kbd ml-auto"
                  style={{ background: "rgba(255,255,255,0.2)", color: "white", borderColor: "transparent" }}
                >
                  g b
                </span>
              </button>
              <button
                className="btn btn-lg"
                aria-label="LLM provider"
                onClick={toggleProviderDropdown}
              >
                <ChevronDown className="w-4 h-4" />
              </button>
              {providerOpen && (
                <div
                  className="b-card"
                  style={{
                    position: "absolute",
                    top: "calc(100% + 4px)",
                    right: 0,
                    minWidth: 200,
                    zIndex: 20,
                    padding: 6,
                    background: "var(--bg-elev-2, var(--bg-elev-1))",
                  }}
                >
                  <div className="text-[10px] uppercase tracking-[0.06em] text-fg-muted px-2 py-1">
                    LLM provider
                  </div>
                  {(() => {
                    const llmProviders = providers.filter((p) => LLM_PROVIDER_SET.has(p.provider));
                    if (llmProviders.length === 0) {
                      return (
                        <div className="text-[11px] text-fg-muted px-2 py-1.5">No providers configured</div>
                      );
                    }
                    return llmProviders.map((p) => {
                      const active = selectedProvider === p.provider;
                      return (
                        <button
                          key={p.provider}
                          className="btn btn-ghost btn-sm w-full justify-start"
                          style={{
                            width: "100%",
                            justifyContent: "flex-start",
                            background: active ? "color-mix(in oklab, var(--primary) 15%, transparent)" : undefined,
                          }}
                          onClick={() => {
                            void selectActiveProvider(p.provider);
                            setProviderOpen(false);
                          }}
                          disabled={!p.configured}
                        >
                          <span style={{ textTransform: "capitalize" }}>{p.provider}</span>
                          {!p.configured && (
                            <span className="chip ml-auto" style={{ height: 16 }}>
                              not set
                            </span>
                          )}
                          {active && <span className="chip chip-info ml-auto" style={{ height: 16 }}>active</span>}
                        </button>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          </div>

          <BriefTile
            status="done"
            session="PRE-MARKET"
            scheduledAt="08:00 ET"
            summary="Megacap tech leading; semis bid on Foxconn deal. Watch SPY 530 pivot, NFP risk Fri."
            chips={[
              { label: `${briefMeta.signalCount ?? 6} setups`, tone: "info" },
              { label: "3 staged" },
            ]}
          />
          <BriefTile
            status="live"
            session="MID-DAY"
            scheduledAt="12:00 ET"
            inLabel="in 2h 19m"
            summary="Re-evaluates open positions, scans for momentum continuation, flags overstretched moves."
            chips={[{ label: "auto-run on" }]}
            cta={
              <button
                className="btn btn-sm"
                onClick={() => runBrief("midday")}
                disabled={busy}
              >
                Run early <span className="kbd">⇧M</span>
              </button>
            }
          />
          <BriefTile
            status="queued"
            session="POST-MARKET"
            scheduledAt="16:30 ET"
            summary="Daily review: P/L, what worked, swing setups for tomorrow, journal prompts."
            chips={[
              { label: "incl. earnings recap" },
              { label: "incl. tomorrow econ" },
            ]}
          />
        </div>

        {/* Main grid */}
        <div className="grid items-start gap-4" style={{ gridTemplateColumns: "1fr 320px" }}>
          <div className="flex flex-col gap-4">
            {/* Open positions */}
            <div className="b-card">
              <div className="flex items-center px-3.5 py-2.5 hairline-b">
                <div className="font-semibold text-[13px]">Open positions</div>
                <span className="chip ml-2">{filteredPositions.length}</span>
                <div className="ml-auto flex items-center gap-2">
                  <span className="mono text-[11px]">
                    Total:{" "}
                    <span className={totalPnl >= 0 ? "t-pos" : "t-neg"}>
                      {totalPnl >= 0 ? "+" : "−"}${Math.abs(totalPnl).toFixed(2)}
                    </span>{" "}
                    <span className="t-muted">
                      ({totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(2)}%)
                    </span>
                  </span>
                  <div className="seg">
                    <button
                      className={posFilter === "all" ? "active" : ""}
                      onClick={() => setPosFilter("all")}
                    >
                      All
                    </button>
                    <button
                      className={posFilter === "equities" ? "active" : ""}
                      onClick={() => setPosFilter("equities")}
                    >
                      Equities
                    </button>
                    <button
                      className={posFilter === "options" ? "active" : ""}
                      onClick={() => setPosFilter("options")}
                    >
                      Options
                    </button>
                  </div>
                </div>
              </div>
              <div
                className="grid px-3 py-2 text-[10px] text-fg-muted uppercase tracking-[0.04em] hairline-b bg-1"
                style={{ gridTemplateColumns: "70px 60px 50px 70px 70px 80px 60px 1fr" }}
              >
                <div>Ticker</div>
                <div>Side</div>
                <div className="text-right">Qty</div>
                <div className="text-right">Entry</div>
                <div className="text-right">Last</div>
                <div className="text-right">$P/L</div>
                <div className="text-right">%</div>
                <div />
              </div>
              {filteredPositions.map((p) => {
                const sideChip =
                  p.side === "LONG" ? "chip chip-pos"
                  : p.side === "SHORT" ? "chip chip-neg"
                  : "chip chip-info";
                return (
                  <div
                    key={p.ticker}
                    className="pos-row"
                    style={{ gridTemplateColumns: "70px 60px 50px 70px 70px 80px 60px 1fr" }}
                  >
                    <span className="font-sans font-semibold">{p.ticker}</span>
                    <span className={sideChip} style={{ height: 18, justifySelf: "start", fontFamily: "Geist, sans-serif" }}>
                      {p.optionTag ?? p.side}
                    </span>
                    <span className="text-right">{p.qty}</span>
                    <span className="text-right">{p.entry.toFixed(2)}</span>
                    <span className="text-right">{p.last.toFixed(2)}</span>
                    <span className={`text-right ${p.pnl >= 0 ? "t-pos" : "t-neg"}`}>
                      {p.pnl >= 0 ? "+" : "−"}
                      {Math.abs(p.pnl).toFixed(2)}
                    </span>
                    <span className={`text-right ${p.pct >= 0 ? "t-pos" : "t-neg"}`}>
                      {p.pct >= 0 ? "+" : ""}
                      {p.pct.toFixed(2)}%
                    </span>
                    <span style={{ justifySelf: "end" }}>
                      <Spark data={walk(p.seed, 30, p.drift)} width={100} height={22} />
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Today's signals */}
            <div className="b-card">
              <div className="flex items-center px-3.5 py-2.5 hairline-b">
                <div className="font-semibold text-[13px]">Today&apos;s signals</div>
                <span className="chip ml-2">{filteredSignals.length} active</span>
                <span className="chip chip-info ml-1.5">
                  <Sparkles className="w-3 h-3" /> claude-opus-4-7
                </span>
                <div className="ml-auto flex gap-1.5">
                  <div className="seg">
                    <button
                      className={sigFilter === "all" ? "active" : ""}
                      onClick={() => setSigFilter("all")}
                    >
                      All
                    </button>
                    <button
                      className={sigFilter === "long" ? "active" : ""}
                      onClick={() => setSigFilter("long")}
                    >
                      Long
                    </button>
                    <button
                      className={sigFilter === "short" ? "active" : ""}
                      onClick={() => setSigFilter("short")}
                    >
                      Short
                    </button>
                    <button
                      className={sigFilter === "options" ? "active" : ""}
                      onClick={() => setSigFilter("options")}
                    >
                      Options
                    </button>
                  </div>
                  <button
                    className="btn btn-sm"
                    onClick={() => notImplemented("Advanced filter")}
                  >
                    <Filter className="w-3 h-3" /> Filter
                  </button>
                </div>
              </div>
              {filteredSignals.map((s) => (
                <SignalRow key={s.ticker} {...s} />
              ))}
            </div>
          </div>

          {/* Right sidebar */}
          <div className="flex flex-col gap-4 sticky" style={{ top: 50 }}>
            <RiskCard
              pnlPct={0.82}
              pnlAtRisk={5820}
              tradesUsed={2}
              tradesCap={5}
              drawdownPct={0.6}
              drawdownCap={3.0}
              exposurePct={52}
            />

            <div className="b-card overflow-hidden">
              <div className="flex items-center px-3.5 py-2.5 hairline-b">
                <div className="font-semibold text-[13px]">Watchlist</div>
                <span className="chip ml-2">{watchlist.length}</span>
                <Link href="/watchlist" className="btn btn-ghost btn-sm ml-auto">
                  <Plus className="w-3 h-3" />
                </Link>
              </div>
              {watchlist.map((w) => (
                <Link key={w.t} href={`/ticker/${w.t}`} className="wl-row no-underline text-fg">
                  <span className="font-semibold text-[12px]">{w.t}</span>
                  <span>
                    <Spark data={walk(w.seed, 25, w.c * 0.05)} width={90} height={18} />
                  </span>
                  <span className="mono text-right text-[11px]">{w.p.toFixed(2)}</span>
                  <span className={`mono text-right text-[11px] ${w.c >= 0 ? "t-pos" : "t-neg"}`}>
                    {w.c >= 0 ? "+" : ""}
                    {w.c.toFixed(2)}%
                  </span>
                </Link>
              ))}
            </div>

            <div className="b-card overflow-hidden">
              <div className="flex items-center px-3.5 py-2.5 hairline-b">
                <div className="font-semibold text-[13px]">Today · catalysts</div>
                <button className="btn btn-ghost btn-sm ml-auto">
                  <Calendar className="w-3 h-3" />
                </button>
              </div>
              <div className="ev-row">
                <span className="chip chip-warn" style={{ height: 18 }}>CPI</span>
                <span className="flex-1">Dec CPI YoY</span>
                <span className="mono t-muted">08:30</span>
                <span className="mono">3.2% e</span>
              </div>
              <div className="ev-row">
                <span className="chip" style={{ height: 18 }}>EARN</span>
                <span className="flex-1 font-medium">NFLX</span>
                <span className="mono t-muted">AMC</span>
                <span className="mono t-pos">+8.2% IV</span>
              </div>
              <div className="ev-row">
                <span className="chip" style={{ height: 18 }}>FED</span>
                <span className="flex-1">Beige Book</span>
                <span className="mono t-muted">14:00</span>
                <span />
              </div>
              <div className="ev-row">
                <span className="chip" style={{ height: 18 }}>EARN</span>
                <span className="flex-1 font-medium">DAL</span>
                <span className="mono t-muted">BMO</span>
                <span className="mono t-pos">+3.8% IV</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <Link href="/forecast" className="b-card no-underline text-fg" style={{ padding: "10px 12px" }}>
                <div className="text-fg-muted text-[10px]">Forecast</div>
                <div className="font-medium mt-0.5 flex items-center gap-1">
                  <LineChart className="w-3 h-3" /> SPY next-week
                </div>
              </Link>
              <Link href="/backtest" className="b-card no-underline text-fg" style={{ padding: "10px 12px" }}>
                <div className="text-fg-muted text-[10px]">Backtest</div>
                <div className="font-medium mt-0.5 flex items-center gap-1">
                  <FlaskConical className="w-3 h-3" /> Strategy lab
                </div>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
