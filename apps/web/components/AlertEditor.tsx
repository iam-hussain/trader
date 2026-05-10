"use client";
import { useState } from "react";

export type AlertKind = "price" | "iv" | "news" | "breakout";

export interface PriceRule {
  op: "above" | "below";
  value: number;
}
export interface IvRule {
  op: "changesByPct";
  pct: number;
}
export interface NewsRule {
  keyword: string;
}
export interface BreakoutRule {
  period: number;
}

export type AlertRule = PriceRule | IvRule | NewsRule | BreakoutRule;

export interface Alert {
  id?: string;
  ticker: string;
  kind: AlertKind;
  rule: AlertRule;
  enabled?: boolean;
}

export interface AlertEditorProps {
  alert?: Alert;
  onSave: (a: Partial<Alert>) => Promise<void>;
  onCancel: () => void;
}

const KINDS: { id: AlertKind; label: string }[] = [
  { id: "price", label: "Price" },
  { id: "iv", label: "IV" },
  { id: "news", label: "News" },
  { id: "breakout", label: "Breakout" },
];

const DEFAULT_RULE: Record<AlertKind, AlertRule> = {
  price: { op: "above", value: 0 },
  iv: { op: "changesByPct", pct: 10 },
  news: { keyword: "" },
  breakout: { period: 20 },
};

export function AlertEditor({ alert, onSave, onCancel }: AlertEditorProps) {
  const [ticker, setTicker] = useState(alert?.ticker ?? "");
  const [kind, setKind] = useState<AlertKind>(alert?.kind ?? "price");
  const [rule, setRule] = useState<AlertRule>(alert?.rule ?? DEFAULT_RULE.price);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const switchKind = (next: AlertKind) => {
    setKind(next);
    if (alert?.kind === next && alert.rule) setRule(alert.rule);
    else setRule(DEFAULT_RULE[next]);
  };

  const submit = async () => {
    setErr(null);
    if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(ticker.toUpperCase())) {
      setErr("Invalid ticker");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        ...(alert?.id ? { id: alert.id } : {}),
        ticker: ticker.toUpperCase(),
        kind,
        rule,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="b-card p-3 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          className="input mono uppercase"
          style={{ width: 100 }}
          placeholder="TICKER"
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          maxLength={10}
        />
        <div className="seg">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              className={kind === k.id ? "active" : ""}
              onClick={() => switchKind(k.id)}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {/* Rule fields */}
      {kind === "price" && (
        <div className="flex items-center gap-2">
          <select
            className="input"
            value={(rule as PriceRule).op}
            onChange={(e) =>
              setRule({ op: e.target.value as PriceRule["op"], value: (rule as PriceRule).value })
            }
          >
            <option value="above">above</option>
            <option value="below">below</option>
          </select>
          <input
            className="input mono tabular-nums"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={(rule as PriceRule).value || ""}
            onChange={(e) =>
              setRule({ op: (rule as PriceRule).op, value: parseFloat(e.target.value) || 0 })
            }
          />
        </div>
      )}

      {kind === "iv" && (
        <div className="flex items-center gap-2 text-[12px]">
          <span className="text-fg-muted">IV changes by</span>
          <input
            className="input mono tabular-nums"
            style={{ width: 90 }}
            type="number"
            step="0.5"
            value={(rule as IvRule).pct || ""}
            onChange={(e) =>
              setRule({ op: "changesByPct", pct: parseFloat(e.target.value) || 0 })
            }
          />
          <span className="text-fg-muted">%</span>
        </div>
      )}

      {kind === "news" && (
        <input
          className="input"
          placeholder="keyword (e.g. earnings)"
          value={(rule as NewsRule).keyword}
          onChange={(e) => setRule({ keyword: e.target.value })}
        />
      )}

      {kind === "breakout" && (
        <div className="flex items-center gap-2 text-[12px]">
          <input
            className="input mono tabular-nums"
            style={{ width: 80 }}
            type="number"
            min="1"
            step="1"
            value={(rule as BreakoutRule).period || ""}
            onChange={(e) =>
              setRule({ period: parseInt(e.target.value, 10) || 0 })
            }
          />
          <span className="text-fg-muted">-day high</span>
        </div>
      )}

      {err && <div className="text-[11px] t-neg">{err}</div>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-ghost btn-sm ml-auto"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={submit}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
