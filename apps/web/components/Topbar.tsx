"use client";
import { Bell, SunMoon } from "lucide-react";

export interface TopbarProps {
  crumbs?: string[];
  title?: string;
  right?: React.ReactNode;
}

export function Topbar({ crumbs, title, right }: TopbarProps) {
  return (
    <div className="topbar">
      <div className="flex items-center gap-1.5 text-[13px] font-medium">
        {crumbs?.length
          ? crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <span style={{ color: i === crumbs.length - 1 ? "var(--text)" : "var(--text-muted)" }}>
                  {c}
                </span>
                {i < crumbs.length - 1 && <span className="t-dim">/</span>}
              </span>
            ))
          : title}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {right}
        <button
          className="btn btn-ghost btn-sm"
          aria-label="Toggle theme"
          title="Toggle theme"
          onClick={() => {
            const cur = document.documentElement.getAttribute("data-theme") || "dark";
            const next = cur === "dark" ? "light" : "dark";
            document.documentElement.setAttribute("data-theme", next);
            try {
              localStorage.setItem("trader-theme", next);
            } catch {}
          }}
        >
          <SunMoon className="w-3.5 h-3.5" />
        </button>
        <button className="btn btn-ghost btn-sm relative" aria-label="Notifications">
          <Bell className="w-3.5 h-3.5" />
          <span
            className="absolute"
            style={{
              top: 4,
              right: 4,
              width: 6,
              height: 6,
              background: "var(--primary)",
              borderRadius: "50%",
            }}
          />
        </button>
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold"
          style={{ background: "var(--bg-elev-3)", border: "1px solid var(--border)" }}
        >
          JK
        </div>
      </div>
    </div>
  );
}
