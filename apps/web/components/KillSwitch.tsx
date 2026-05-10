"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Power } from "lucide-react";

export interface KillSwitchProps {
  onTrigger: () => void | Promise<void>;
  label?: string;
  confirmHoldMs?: number;
  size?: "sm" | "md" | "lg";
}

const SIZE_PX: Record<NonNullable<KillSwitchProps["size"]>, number> = {
  sm: 24,
  md: 28,
  lg: 36,
};

export function KillSwitch({
  onTrigger,
  label = "Kill switch",
  confirmHoldMs = 2000,
  size = "md",
}: KillSwitchProps) {
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const firedRef = useRef(false);

  const cancel = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    startRef.current = null;
    firedRef.current = false;
    setProgress(0);
  }, []);

  useEffect(() => () => cancel(), [cancel]);

  const tick = useCallback(
    (t: number) => {
      if (startRef.current === null) return;
      const elapsed = t - startRef.current;
      const p = Math.min(1, elapsed / confirmHoldMs);
      setProgress(p);
      if (p >= 1) {
        if (!firedRef.current) {
          firedRef.current = true;
          startRef.current = null;
          setBusy(true);
          Promise.resolve(onTrigger())
            .catch(() => {})
            .finally(() => {
              setBusy(false);
              setProgress(0);
            });
        }
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    },
    [confirmHoldMs, onTrigger],
  );

  const handleDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (busy) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      firedRef.current = false;
      startRef.current = performance.now();
      rafRef.current = requestAnimationFrame(tick);
    },
    [busy, tick],
  );

  const handleUp = useCallback(() => {
    if (firedRef.current) return;
    cancel();
  }, [cancel]);

  // SVG ring sizing
  const r = 9;
  const c = 2 * Math.PI * r;
  const dash = c * progress;
  const px = SIZE_PX[size];

  return (
    <button
      type="button"
      className="btn btn-danger relative select-none"
      style={{
        height: px,
        padding: size === "sm" ? "0 8px" : size === "lg" ? "0 14px" : "0 10px",
        fontSize: size === "sm" ? 11 : size === "lg" ? 13 : 12,
      }}
      onPointerDown={handleDown}
      onPointerUp={handleUp}
      onPointerLeave={handleUp}
      onPointerCancel={handleUp}
      aria-label={label}
      title={`Hold ${(confirmHoldMs / 1000).toFixed(1)}s to ${label.toLowerCase()}`}
      disabled={busy}
    >
      <span className="relative inline-flex items-center" style={{ width: 14, height: 14 }}>
        <Power className="w-3.5 h-3.5" style={{ opacity: progress > 0 ? 0.4 : 1 }} />
        {progress > 0 && (
          <svg
            width={20}
            height={20}
            viewBox="0 0 20 20"
            style={{
              position: "absolute",
              left: -3,
              top: -3,
              pointerEvents: "none",
              transform: "rotate(-90deg)",
            }}
          >
            <circle
              cx={10}
              cy={10}
              r={r}
              fill="none"
              stroke="rgba(255,255,255,0.25)"
              strokeWidth={2}
            />
            <circle
              cx={10}
              cy={10}
              r={r}
              fill="none"
              stroke="white"
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${c}`}
            />
          </svg>
        )}
      </span>
      <span className="ml-1.5">{busy ? "…" : label}</span>
    </button>
  );
}
