import { Topbar } from "@/components/Topbar";

export default function JournalPage() {
  return (
    <>
      <Topbar crumbs={["Workspace", "Journal"]} />
      <div className="page max-w-[1100px]">
        <div className="b-card p-4 text-[12px] text-fg-muted leading-[1.6]">
          Phase 3+: trading-day calendar heatmap, per-trade entries with thesis
          snapshot + screenshots + tags + lessons, and a quarterly edge-analysis
          chart breaking P/L by setup tag.
        </div>
      </div>
    </>
  );
}
