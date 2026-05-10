"use client";
import Link from "next/link";
import { ChevronDown, Filter, LineChart, FlaskConical, Plus, Sparkles, Zap, Calendar } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { MacroStrip } from "@/components/MacroStrip";
import { SectorHeatmap } from "@/components/SectorHeatmap";
import { BriefTile } from "@/components/BriefTile";
import { SignalRow } from "@/components/SignalRow";
import { RiskCard } from "@/components/RiskCard";
import { Spark, walk } from "@/components/Spark";

// Phase-1/2: live data plumbing for these is a stub until Phase 3 brings the
// scheduled briefs + real signal engine online. Mock arrays here render the
// design and exercise every component; replace with API data as it ships.

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

const MACRO = [
  { label: "VIX", value: "14.82", changeStr: "−2.1%", positive: true },
  { label: "SPY", value: "528.40", changeStr: "+0.42%", positive: true },
  { label: "QQQ", value: "452.18", changeStr: "+0.61%", positive: true },
  { label: "10Y", value: "4.31%", changeStr: "+3bp", positive: false },
  { label: "DXY", value: "104.21", changeStr: "+0.18%", positive: false },
  { label: "GOLD", value: "2,348", changeStr: "+0.27%", positive: true },
  { label: "CRUDE", value: "78.42", changeStr: "−0.84%", positive: false },
  { label: "BTC", value: "68,420", changeStr: "+1.4%", positive: true },
];

const POSITIONS = [
  { ticker: "NVDA", side: "LONG", optionTag: null, qty: 25, entry: 912.10, last: 938.42, pnl: 658.0, pct: 2.88, seed: 1, drift: 0.06 },
  { ticker: "AAPL", side: "LONG", optionTag: null, qty: 100, entry: 218.5, last: 221.04, pnl: 254.0, pct: 1.16, seed: 2, drift: 0.04 },
  { ticker: "SPY", side: "OPT", optionTag: "P 525", qty: 2, entry: 3.2, last: 1.85, pnl: -270.0, pct: -42.19, seed: 3, drift: -0.4 },
  { ticker: "MSFT", side: "OPT", optionTag: "C 440", qty: 5, entry: 8.2, last: 10.6, pnl: 1200.0, pct: 29.27, seed: 4, drift: 0.2 },
  { ticker: "TSLA", side: "SHORT", optionTag: null, qty: 50, entry: 252.4, last: 249.32, pnl: 154.0, pct: 1.22, seed: 5, drift: -0.05 },
  { ticker: "META", side: "LONG", optionTag: null, qty: 15, entry: 596.0, last: 594.2, pnl: -27.0, pct: -0.30, seed: 6, drift: 0.01 },
];

const SIGNALS: React.ComponentProps<typeof SignalRow>[] = [
  { ticker: "NVDA", name: "Nvidia Corp", direction: "long", instrument: "CALL DEBIT", thesis: "Earnings drift continuation, RS leader vs SMH; entry on pullback to 20EMA.", entry: 932.4, target: 965.0, stop: 918.0, riskReward: 2.3, confidence: 72 },
  { ticker: "SPY", name: "SPDR S&P 500", direction: "hedge", instrument: "PUT 525/520", thesis: "Tail hedge ahead of NFP Fri; protects long book delta if VIX backs up > 16.", entry: 1.85, target: 3.4, stop: 0.95, riskReward: 1.7, confidence: 58 },
  { ticker: "TSLA", name: "Tesla Inc", direction: "short", instrument: "EQUITY", thesis: "Lower-high pattern, volume divergence on bounce; deliveries miss priced in.", entry: 251.2, target: 238.0, stop: 258.4, riskReward: 1.8, confidence: 64 },
  { ticker: "AMD", name: "Adv Micro Devices", direction: "long", instrument: "EQUITY", thesis: "Pre-earnings setup, IV rank 38, options unusually active in Feb 200 calls.", entry: 184.2, target: 198.0, stop: 178.4, riskReward: 2.4, confidence: 68, staged: true },
  { ticker: "XOM", name: "Exxon Mobil", direction: "wait", instrument: "EQUITY", thesis: "Crude weakness; wait for 110 reclaim before entry. Soft signal.", entry: 110.4, target: 116.0, stop: 107.8, riskReward: 2.1, confidence: 42 },
];

const WATCHLIST_PREVIEW = [
  { t: "AAPL", p: 221.04, c: 1.16, seed: 11 },
  { t: "NVDA", p: 938.42, c: 2.88, seed: 12 },
  { t: "MSFT", p: 442.10, c: 0.61, seed: 13 },
  { t: "GOOGL", p: 198.20, c: 0.42, seed: 14 },
  { t: "AMZN", p: 224.80, c: -0.18, seed: 15 },
  { t: "TSLA", p: 249.32, c: -1.22, seed: 16 },
  { t: "META", p: 594.20, c: -0.30, seed: 17 },
  { t: "AMD", p: 184.20, c: 1.84, seed: 18 },
];

export default function DashboardPage() {
  return (
    <>
      <Topbar
        crumbs={["Workspace", "Today"]}
        right={
          <>
            <div className="seg">
              <button className="active">Today</button>
              <button>Week</button>
              <button>Custom</button>
            </div>
            <div className="divider-v" />
            <button className="btn btn-sm">
              <Zap className="w-3.5 h-3.5" /> Run brief <span className="kbd">g b</span>
            </button>
          </>
        }
      />

      <MacroStrip
        regime="risk-on"
        items={MACRO}
        asOfTime={new Date().toLocaleTimeString("en-US", {
          hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/New_York",
        }) + " ET"}
      />
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
            <div className="flex gap-1.5 mt-auto">
              <button className="btn btn-primary btn-lg flex-1 justify-center">
                <Zap className="w-4 h-4" /> Run brief
                <span
                  className="kbd ml-auto"
                  style={{ background: "rgba(255,255,255,0.2)", color: "white", borderColor: "transparent" }}
                >
                  g b
                </span>
              </button>
              <button className="btn btn-lg" aria-label="LLM provider">
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          <BriefTile
            status="done"
            session="PRE-MARKET"
            scheduledAt="08:00 ET"
            summary="Megacap tech leading; semis bid on Foxconn deal. Watch SPY 530 pivot, NFP risk Fri."
            chips={[
              { label: "6 setups", tone: "info" },
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
              <button className="btn btn-sm">
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
                <span className="chip ml-2">{POSITIONS.length}</span>
                <div className="ml-auto flex items-center gap-2">
                  <span className="mono text-[11px]">
                    Total:{" "}
                    <span className="t-pos">+${POSITIONS.reduce((s, p) => s + p.pnl, 0).toFixed(2)}</span>{" "}
                    <span className="t-muted">(+1.82%)</span>
                  </span>
                  <div className="seg">
                    <button className="active">All</button>
                    <button>Equities</button>
                    <button>Options</button>
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
              {POSITIONS.map((p) => {
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
                <span className="chip ml-2">{SIGNALS.length} active</span>
                <span className="chip chip-info ml-1.5">
                  <Sparkles className="w-3 h-3" /> claude-opus-4-7
                </span>
                <div className="ml-auto flex gap-1.5">
                  <div className="seg">
                    <button className="active">All</button>
                    <button>Long</button>
                    <button>Short</button>
                    <button>Options</button>
                  </div>
                  <button className="btn btn-sm">
                    <Filter className="w-3 h-3" /> Filter
                  </button>
                </div>
              </div>
              {SIGNALS.map((s) => (
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
                <span className="chip ml-2">{WATCHLIST_PREVIEW.length}</span>
                <Link href="/watchlist" className="btn btn-ghost btn-sm ml-auto">
                  <Plus className="w-3 h-3" />
                </Link>
              </div>
              {WATCHLIST_PREVIEW.map((w) => (
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
