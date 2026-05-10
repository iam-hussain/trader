import { Topbar } from "@/components/Topbar";
import { BriefTile } from "@/components/BriefTile";

export default function BriefsPage() {
  return (
    <>
      <Topbar crumbs={["Workspace", "Briefs"]} />
      <div className="page max-w-[1100px]">
        <div className="grid grid-cols-3 gap-3">
          <BriefTile
            status="done"
            session="PRE-MARKET"
            scheduledAt="08:00 ET"
            summary="Phase 3 brings real LLM-generated briefs. This tile renders the design today."
            chips={[{ label: "Phase 3", tone: "info" }]}
          />
          <BriefTile
            status="live"
            session="MID-DAY"
            scheduledAt="12:00 ET"
            inLabel="upcoming"
            chips={[{ label: "auto-run on" }]}
          />
          <BriefTile
            status="queued"
            session="POST-MARKET"
            scheduledAt="16:30 ET"
            chips={[{ label: "incl. tomorrow econ" }]}
          />
        </div>
        <div className="b-card p-4 text-[12px] text-fg-muted">
          The full per-ticker signal cards, macro context, earnings sidebar, and the
          &ldquo;re-run with another LLM&rdquo; chip land in Phase 3.
        </div>
      </div>
    </>
  );
}
