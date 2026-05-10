"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
    ],
  },
  {
    name: "Markets",
    items: [
      { id: "watchlist", label: "Watchlist", href: "/watchlist", icon: Star, shortcut: "g w" },
      { id: "forecast", label: "Forecast", href: "/forecast", icon: LineChart, shortcut: "g f" },
      { id: "backtest", label: "Backtest", href: "/backtest", icon: FlaskConical, shortcut: "g t" },
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

export function Sidebar() {
  const pathname = usePathname() || "/";

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
        />
        <Search className="absolute left-2 top-[7px] w-3 h-3 text-fg-dim" />
        <span className="kbd absolute right-1.5 top-[5px]">⌘K</span>
      </div>

      {SECTIONS.map((section) => (
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
        className="mt-auto pt-2 px-2 flex items-center gap-2 text-[11px] text-fg-muted"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <span className="pulse-dot" />
        <span>IBKR · Paper</span>
        <span className="ml-auto mono t-muted">
          {new Date().toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "America/New_York",
          })}{" "}
          ET
        </span>
      </div>
    </aside>
  );
}
