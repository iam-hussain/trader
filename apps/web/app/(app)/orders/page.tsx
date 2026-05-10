import { Topbar } from "@/components/Topbar";
import { Power } from "lucide-react";

export default function OrdersPage() {
  return (
    <>
      <Topbar
        crumbs={["Workspace", "Orders"]}
        right={
          <button className="btn btn-danger" disabled title="Phase 4">
            <Power className="w-3.5 h-3.5" /> Kill switch
          </button>
        }
      />
      <div className="page max-w-[1100px]">
        <div className="b-card p-4 text-[12px] text-fg-muted leading-[1.6]">
          Phase 4 lands the staging queue, one-click confirm, and the
          hold-to-confirm kill switch (cancels all open IBKR orders). The IBKR
          adapter exists as a typed stub today; full TWS API wiring is the
          Phase 4 deliverable.
        </div>
      </div>
    </>
  );
}
