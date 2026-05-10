import Link from "next/link";
import {
  LayoutDashboard,
  ListChecks,
  FileText,
  ScrollText,
  ClipboardList,
  Settings,
  TrendingUp,
} from "lucide-react";

const items = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/watchlist", label: "Watchlist", icon: ListChecks },
  { href: "/briefs", label: "Briefs", icon: FileText },
  { href: "/orders", label: "Orders", icon: ClipboardList },
  { href: "/journal", label: "Journal", icon: ScrollText },
  { href: "/forecast", label: "Forecast", icon: TrendingUp },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="w-56 shrink-0 border-r border-border h-screen sticky top-0 p-3">
      <div className="px-2 py-3 mb-3">
        <div className="font-semibold tracking-tight">Trader Daily</div>
        <div className="text-xs text-fg-muted">Phase 1</div>
      </div>
      <nav className="flex flex-col gap-0.5">
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-fg-muted
                       hover:text-fg hover:bg-bg-surface transition-colors"
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
