"use client";
import { Topbar } from "@/components/Topbar";
import { BriefTile } from "@/components/BriefTile";
import { SignalRow } from "@/components/SignalRow";
import { RiskCard } from "@/components/RiskCard";
import { Spark, walk } from "@/components/Spark";
import { ConfBar } from "@/components/ConfBar";
import { notImplemented } from "@/lib/toast";

export default function ComponentsPage() {
  return (
    <>
      <Topbar crumbs={["Reference", "Components"]} />
      <div className="page max-w-[1200px]">
        <div className="text-[11px] text-fg-muted mb-3">
          Design reference page — buttons are illustrative.
        </div>
        <Section title="Buttons">
          <div className="flex gap-2 items-center">
            <button
              className="btn"
              onClick={() => notImplemented("Default button")}
            >
              Default
            </button>
            <button
              className="btn btn-primary"
              onClick={() => notImplemented("Primary button")}
            >
              Primary
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => notImplemented("Ghost button")}
            >
              Ghost
            </button>
            <button
              className="btn btn-danger"
              onClick={() => notImplemented("Danger button")}
            >
              Danger
            </button>
            <button
              className="btn btn-sm"
              onClick={() => notImplemented("Small button")}
            >
              Small
            </button>
            <button
              className="btn btn-lg btn-primary"
              onClick={() => notImplemented("Large primary button")}
            >
              Large primary
            </button>
          </div>
        </Section>

        <Section title="Chips">
          <div className="flex gap-2 items-center">
            <span className="chip">default</span>
            <span className="chip chip-pos">long</span>
            <span className="chip chip-neg">short</span>
            <span className="chip chip-warn">wait</span>
            <span className="chip chip-info">hedge</span>
            <span className="chip chip-solid">solid</span>
          </div>
        </Section>

        <Section title="Inputs">
          <div className="flex gap-2 items-center">
            <input className="input w-60" placeholder="Default" />
            <input className="input mono w-40" placeholder="MONO" />
            <span className="kbd">⌘K</span>
            <span className="kbd">g d</span>
          </div>
        </Section>

        <Section title="Segmented">
          <div className="seg">
            <button
              className="active"
              onClick={() => notImplemented("Segmented: All")}
            >
              All
            </button>
            <button onClick={() => notImplemented("Segmented: Long")}>
              Long
            </button>
            <button onClick={() => notImplemented("Segmented: Short")}>
              Short
            </button>
            <button onClick={() => notImplemented("Segmented: Options")}>
              Options
            </button>
          </div>
        </Section>

        <Section title="Sparkline">
          <div className="flex gap-3 items-center">
            <Spark data={walk(1, 30, 0.06)} width={120} height={32} />
            <Spark data={walk(2, 30, -0.2)} width={120} height={32} />
            <Spark data={walk(3, 30, 0.0)} color="primary" width={120} height={32} />
          </div>
        </Section>

        <Section title="Confidence bar">
          <div className="flex gap-3 items-center">
            <ConfBar value={28} />
            <ConfBar value={62} />
            <ConfBar value={91} />
          </div>
        </Section>

        <Section title="Brief tile">
          <div className="grid grid-cols-3 gap-3">
            <BriefTile status="done" session="PRE-MARKET" scheduledAt="08:00 ET" summary="Done." chips={[{ label: "6 setups", tone: "info" }]} />
            <BriefTile status="live" session="MID-DAY" scheduledAt="12:00 ET" summary="Next." chips={[{ label: "auto-run on" }]} />
            <BriefTile status="queued" session="POST-MARKET" scheduledAt="16:30 ET" summary="Queued." />
          </div>
        </Section>

        <Section title="Signal row">
          <div className="b-card">
            <SignalRow ticker="NVDA" name="Nvidia Corp" direction="long" instrument="EQUITY" thesis="Momentum continuation; breakout above 940 with rising relative strength." entry={932.4} target={965.0} stop={918.0} riskReward={2.3} confidence={72} />
            <SignalRow ticker="TSLA" name="Tesla" direction="short" instrument="EQUITY" thesis="Lower-high pattern, volume divergence on bounce." entry={251.2} target={238.0} stop={258.4} riskReward={1.8} confidence={64} />
          </div>
        </Section>

        <Section title="Risk card">
          <div className="max-w-xs">
            <RiskCard pnlPct={0.82} pnlAtRisk={5820} tradesUsed={2} tradesCap={5} drawdownPct={0.6} drawdownCap={3.0} exposurePct={52} />
          </div>
        </Section>

        <Section title="Skeletons">
          <div className="space-y-2">
            <div className="skel h-3 w-1/3" />
            <div className="skel h-3 w-2/3" />
            <div className="skel h-20 w-full" />
          </div>
        </Section>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="h-section">{title}</div>
      <div className="b-card p-4">{children}</div>
    </section>
  );
}
