"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import {
  LayoutDashboard,
  Newspaper,
  ArrowRightLeft,
  BookOpen,
  Bell,
  Star,
  LineChart,
  FlaskConical,
  Shapes,
  Settings,
  Search,
  History,
  PieChart,
  Clock,
} from "lucide-react";

interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
}

const SECTIONS: { name: string; items: NavItem[] }[] = [
  {
    name: "Workspace",
    items: [
      { id: "dashboard", label: "Today", href: "/", icon: LayoutDashboard, shortcut: "g d" },
      { id: "briefs", label: "Briefs", href: "/briefs", icon: Newspaper, shortcut: "g b" },
      { id: "orders", label: "Orders", href: "/orders", icon: ArrowRightLeft, shortcut: "g o" },
      { id: "journal", label: "Journal", href: "/journal", icon: BookOpen, shortcut: "g j" },
      { id: "alerts", label: "Alerts", href: "/alerts", icon: Bell, shortcut: "g a" },
      { id: "attribution", label: "Attribution", href: "/attribution", icon: PieChart, shortcut: "g p" },
    ],
  },
  {
    name: "Markets",
    items: [
      { id: "watchlist", label: "Watchlist", href: "/watchlist", icon: Star, shortcut: "g w" },
      { id: "forecast", label: "Forecast", href: "/forecast", icon: LineChart, shortcut: "g f" },
      { id: "history", label: "History", href: "/history", icon: Clock, shortcut: "g h" },
      { id: "backtest", label: "Backtest", href: "/backtest", icon: FlaskConical, shortcut: "g t" },
      { id: "replay", label: "Replay", href: "/replay", icon: History, shortcut: "g r" },
    ],
  },
  {
    name: "Reference",
    items: [
      { id: "components", label: "Components", href: "/components", icon: Shapes },
      { id: "settings", label: "Settings", href: "/settings", icon: Settings, shortcut: "g s" },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function formatEtTime(d: Date): string {
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

interface SettingsLite {
  defaultLlmProvider: string;
}

interface ValidateResponse {
  ok: boolean;
  host?: string;
  latencyMs?: number;
  modelsCount?: number;
  error?: string;
}

type LlmStatus = "unknown" | "ok" | "fail";

export function Sidebar() {
  const pathname = usePathname() || "/";
  const [query, setQuery] = useState("");
  const [clock, setClock] = useState<string | undefined>(undefined);
  const [llmProvider, setLlmProvider] = useState<string | null>(null);
  const [llmStatus, setLlmStatus] = useState<LlmStatus>("unknown");

  useEffect(() => {
    setClock(formatEtTime(new Date()));
    const id = setInterval(() => setClock(formatEtTime(new Date())), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const probe = async (provider: string) => {
      try {
        const res = await api<ValidateResponse>(
          `/api/providers/validate/${provider}`,
          { method: "POST" },
        );
        if (cancelled) return;
        setLlmStatus(res.ok ? "ok" : "fail");
      } catch {
        if (cancelled) return;
        // 400 / network errors → treat as unknown (e.g. unconfigured) rather than fail.
        setLlmStatus("unknown");
      }
    };

    const refresh = async () => {
      try {
        const s = await api<SettingsLite>("/api/settings/");
        if (cancelled) return;
        const next = s.defaultLlmProvider;
        setLlmProvider((prev) => (prev === next ? prev : next));
        if (next) await probe(next);
      } catch {
        // ignore — sidebar should never block the app.
      }
    };

    void refresh();
    const id = setInterval(() => void refresh(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((it) => it.label.toLowerCase().includes(q)),
    })).filter((section) => section.items.length > 0);
  }, [query]);

  return (
    <aside className="sidebar">
      <Link
        href="/"
        className="flex items-center gap-2 px-2 py-1.5 mb-2 no-underline text-fg"
      >
        <span
          className="w-[22px] h-[22px] rounded-[5px] flex items-center justify-center mono font-semibold text-[12px] text-white"
          style={{
            background: "linear-gradient(135deg, var(--primary), oklch(50% 0.15 280))",
          }}
        >
          T
        </span>
        <span className="font-semibold text-[13px] tracking-[-0.01em]">Trader</span>
        <span className="chip ml-auto h-4 px-1 text-[9px]">v0.4</span>
      </Link>

      <div className="relative mb-1.5">
        <input
          className="input w-full pl-[26px] h-[26px] text-[11px]"
          placeholder="Search · jump to"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Search className="absolute left-2 top-[7px] w-3 h-3 text-fg-dim" />
        <span className="kbd absolute right-1.5 top-[5px]">⌘K</span>
      </div>

      {filteredSections.map((section) => (
        <div key={section.name}>
          <div className="sb-section">{section.name}</div>
          {section.items.map((it) => {
            const Icon = it.icon;
            const active = isActive(pathname, it.href);
            return (
              <Link
                key={it.id}
                href={it.href}
                className={`sb-item ${active ? "active" : ""}`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{it.label}</span>
                {it.shortcut && <span className="sb-key">{it.shortcut}</span>}
              </Link>
            );
          })}
        </div>
      ))}

      <div
        className="mt-auto pt-2"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <Link
          href="/settings"
          className="flex items-center gap-2 px-2 py-1 text-[11px] text-fg-muted no-underline hover:text-fg"
        >
          <span
            className="pulse-dot"
            style={{
              background:
                llmStatus === "ok"
                  ? "var(--success)"
                  : llmStatus === "fail"
                    ? "var(--destructive)"
                    : "var(--fg-dim, #888)",
              opacity: llmStatus === "unknown" ? 0.5 : 1,
            }}
          />
          <span className="uppercase tracking-[0.06em] text-fg-dim text-[9px]">LLM</span>
          <span className="mono">{llmProvider ?? "—"}</span>
          <span className="ml-auto mono t-muted text-[10px]">
            {llmStatus === "ok" ? "ok" : llmStatus === "fail" ? "down" : "?"}
          </span>
        </Link>
        <div className="px-2 py-1 flex items-center gap-2 text-[11px] text-fg-muted">
          <span className="pulse-dot" />
          <span>IBKR · Paper</span>
          <span className="ml-auto mono t-muted">
            {clock ? `${clock} ET` : " "}
          </span>
        </div>
      </div>
    </aside>
  );
}
