"use client";
import { useMemo, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import type { Trade } from "@/lib/orders";
import { editOrder } from "@/lib/orders";

export interface StagedOrderRowProps {
  trade: Trade;
  onConfirm: () => Promise<void>;
  onEdit: () => void;
  onCancel: () => Promise<void>;
  busy?: boolean;
  error?: string;
  riskReasons?: string[];
  onEdited?: (trade: Trade) => void;
}

function fmtPrice(v?: number) {
  if (v === undefined || v === null || Number.isNaN(v)) return "—";
  return v.toFixed(2);
}

function fmtUsd(v?: number) {
  if (v === undefined || v === null || Number.isNaN(v)) return "—";
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toFixed(0)}`;
}

function isOption(t: Trade) {
  return !!t.optionLeg;
}

function optionLabel(t: Trade) {
  if (!t.optionLeg) return "";
  const { expiry, strike, right } = t.optionLeg;
  return `${expiry} ${strike}${right}`;
}

function calcMaxLoss(t: Trade): number | undefined {
  if (t.entryPrice === undefined || t.stopPrice === undefined) return undefined;
  const mult = t.optionLeg?.multiplier ?? (isOption(t) ? 100 : 1);
  const dir = t.side === "buy" ? 1 : -1;
  return Math.max(0, (t.entryPrice - t.stopPrice) * dir) * t.qty * mult;
}

function calcRR(t: Trade): number | undefined {
  if (
    t.entryPrice === undefined ||
    t.stopPrice === undefined ||
    t.targetPrice === undefined
  )
    return undefined;
  const reward = Math.abs(t.targetPrice - t.entryPrice);
  const risk = Math.abs(t.entryPrice - t.stopPrice);
  if (risk === 0) return undefined;
  return reward / risk;
}

function calcMargin(t: Trade): number | undefined {
  if (t.entryPrice === undefined) return undefined;
  const mult = t.optionLeg?.multiplier ?? (isOption(t) ? 100 : 1);
  return t.entryPrice * t.qty * mult;
}

export function StagedOrderRow({
  trade,
  onConfirm,
  onEdit,
  onCancel,
  busy,
  error,
  riskReasons,
  onEdited,
}: StagedOrderRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    qty: String(trade.qty),
    entryPrice: trade.entryPrice !== undefined ? String(trade.entryPrice) : "",
    targetPrice: trade.targetPrice !== undefined ? String(trade.targetPrice) : "",
    stopPrice: trade.stopPrice !== undefined ? String(trade.stopPrice) : "",
  });
  const [saving, setSaving] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);

  const maxLoss = useMemo(() => calcMaxLoss(trade), [trade]);
  const rr = useMemo(() => calcRR(trade), [trade]);
  const margin = useMemo(() => calcMargin(trade), [trade]);
  const estFees = useMemo(() => {
    if (isOption(trade)) return 0.65 * trade.qty;
    return Math.max(1, trade.qty * 0.005);
  }, [trade]);

  function startEdit() {
    setDraft({
      qty: String(trade.qty),
      entryPrice: trade.entryPrice !== undefined ? String(trade.entryPrice) : "",
      targetPrice: trade.targetPrice !== undefined ? String(trade.targetPrice) : "",
      stopPrice: trade.stopPrice !== undefined ? String(trade.stopPrice) : "",
    });
    setEditing(true);
    onEdit?.();
  }

  async function saveEdit() {
    setSaving(true);
    setEditErr(null);
    try {
      const patch = {
        qty: Number(draft.qty),
        entryPrice: draft.entryPrice ? Number(draft.entryPrice) : undefined,
        targetPrice: draft.targetPrice ? Number(draft.targetPrice) : undefined,
        stopPrice: draft.stopPrice ? Number(draft.stopPrice) : undefined,
      };
      const updated = await editOrder(trade.id, patch);
      onEdited?.(updated);
      setEditing(false);
    } catch (e) {
      setEditErr(e instanceof Error ? e.message : "Edit failed");
    } finally {
      setSaving(false);
    }
  }

  const sideChip =
    trade.side === "buy"
      ? "chip chip-pos"
      : "chip chip-neg";
  const sideLabel = isOption(trade)
    ? `${trade.side === "buy" ? "BUY" : "SELL"} ${trade.optionLeg?.right === "C" ? "CALL" : "PUT"}`
    : trade.side === "buy"
      ? "LONG"
      : "SHORT";

  return (
    <div className="b-card p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="mono tabular-nums font-semibold text-[14px]">
          {trade.ticker}
        </span>
        <span className={sideChip}>{sideLabel}</span>
        {isOption(trade) && <span className="chip chip-info">{optionLabel(trade)}</span>}
        <span className="chip">qty {trade.qty}</span>
        <span className="ml-auto t-dim text-[10px] mono">{trade.id.slice(0, 8)}</span>
      </div>

      {!editing ? (
        <div className="grid grid-cols-5 gap-3 text-[11px] mono tabular-nums">
          <Field label="entry" value={fmtPrice(trade.entryPrice)} />
          <Field label="target" value={fmtPrice(trade.targetPrice)} accent="var(--success)" />
          <Field label="stop" value={fmtPrice(trade.stopPrice)} accent="var(--danger)" />
          <Field
            label="max loss"
            value={fmtUsd(maxLoss)}
            accent="var(--danger)"
          />
          <Field label="R:R" value={rr !== undefined ? rr.toFixed(2) : "—"} />
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2 text-[11px]">
          <EditField
            label="qty"
            value={draft.qty}
            onChange={(v) => setDraft({ ...draft, qty: v })}
          />
          <EditField
            label="entry"
            value={draft.entryPrice}
            onChange={(v) => setDraft({ ...draft, entryPrice: v })}
          />
          <EditField
            label="target"
            value={draft.targetPrice}
            onChange={(v) => setDraft({ ...draft, targetPrice: v })}
          />
          <EditField
            label="stop"
            value={draft.stopPrice}
            onChange={(v) => setDraft({ ...draft, stopPrice: v })}
          />
        </div>
      )}

      <div className="flex items-center gap-3 text-[10px] mono tabular-nums t-dim">
        <span>fees ~{fmtUsd(estFees)}</span>
        <span>margin ~{fmtUsd(margin)}</span>
        {trade.notes && (
          <span className="ml-auto truncate max-w-[40%]">note: {trade.notes}</span>
        )}
      </div>

      {(error || editErr) && (
        <div className="t-neg text-[11px]">{error ?? editErr}</div>
      )}

      {riskReasons && riskReasons.length > 0 && (
        <div className="t-neg text-[11px] flex flex-col gap-0.5">
          <span className="font-medium">Risk check failed:</span>
          <ul className="list-disc pl-5">
            {riskReasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-2 mt-1">
        {editing ? (
          <>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              <X className="w-3 h-3" /> Discard
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={saveEdit}
              disabled={saving}
            >
              <Check className="w-3 h-3" /> {saving ? "Saving…" : "Save"}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={startEdit}
              disabled={busy}
            >
              <Pencil className="w-3 h-3" /> Edit
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void onCancel()}
              disabled={busy}
            >
              <X className="w-3 h-3" /> Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm ml-auto"
              onClick={() => void onConfirm()}
              disabled={busy}
            >
              <Check className="w-3 h-3" /> {busy ? "Confirming…" : "Confirm"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="t-dim text-[10px] uppercase tracking-wide">{label}</span>
      <span style={{ color: accent ?? "var(--text)" }}>{value}</span>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="t-dim text-[10px] uppercase tracking-wide">{label}</span>
      <input
        className="input mono"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
      />
    </label>
  );
}
