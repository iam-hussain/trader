"use client";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { api } from "@/lib/api";

export interface LiveModeModalProps {
  open: boolean;
  onClose: () => void;
  onConfirmed: () => void;
}

export function LiveModeModal({ open, onClose, onConfirmed }: LiveModeModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      try {
        dlg.showModal();
      } catch {
        /* ignore */
      }
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      setConfirmText("");
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const canConfirm = confirmText === "LIVE" && !busy;

  async function handleConfirm() {
    if (!canConfirm) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/settings/broker/switch-mode", {
        method: "POST",
        body: JSON.stringify({ mode: "live", confirmText }),
      });
      onConfirmed();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Switch failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={onClose}
      style={{
        background: "var(--bg-elev-1)",
        color: "var(--text)",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius-lg)",
        padding: 0,
        width: 460,
        maxWidth: "90vw",
      }}
    >
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" style={{ color: "var(--destructive)" }} />
          <h2 className="text-[15px] font-semibold">Switch to live trading</h2>
          <button
            type="button"
            className="btn btn-ghost btn-sm ml-auto"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="w-3 h-3" />
          </button>
        </div>

        <div
          className="live-banner"
          style={{ borderRadius: "var(--radius)", borderBottom: "none", border: "1px solid color-mix(in oklab, var(--destructive) 40%, transparent)" }}
        >
          <span>
            Orders will hit your live IBKR account. Risk checks still run, but mistakes
            cost real money.
          </span>
        </div>

        <ul className="text-[12px] text-fg-muted leading-[1.6] list-disc pl-5 space-y-1">
          <li>Existing paper positions will not transfer.</li>
          <li>Confirm dialogs in the staging queue stay one-click.</li>
          <li>Use the kill switch (top-right) to cancel everything.</li>
        </ul>

        <label className="flex flex-col gap-1 text-[12px]">
          <span className="text-fg-muted">
            Type <span className="mono">LIVE</span> to confirm
          </span>
          <input
            className="input mono"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoFocus
            spellCheck={false}
            autoCapitalize="characters"
            placeholder="LIVE"
          />
        </label>

        {error && <div className="t-neg text-[12px]">{error}</div>}

        <div className="flex items-center gap-2 mt-1">
          <button
            type="button"
            className="btn btn-ghost btn-sm ml-auto"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            {busy ? "Switching…" : "Switch to live"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
