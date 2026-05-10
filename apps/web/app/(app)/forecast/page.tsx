"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, Clock } from "lucide-react";
import { Topbar } from "@/components/Topbar";

const RECENT_KEY = "trader.forecast.recent";

function loadRecents(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((v) => typeof v === "string");
  } catch {
    return [];
  }
}

function saveRecent(symbol: string) {
  try {
    const cur = loadRecents();
    const next = [symbol, ...cur.filter((s) => s !== symbol)].slice(0, 8);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export default function ForecastPage() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [recents, setRecents] = useState<string[]>([]);

  useEffect(() => {
    setRecents(loadRecents());
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const sym = value.trim().toUpperCase();
    if (!sym) return;
    saveRecent(sym);
    router.push(`/forecast/${encodeURIComponent(sym)}`);
  };

  return (
    <>
      <Topbar crumbs={["Markets", "Forecast"]} />
      <div className="page max-w-[1100px] flex flex-col gap-3">
        <div className="b-card p-4">
          <div className="text-[13px] font-medium mb-2">Symbol forecast</div>
          <form onSubmit={submit} className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                className="input mono w-full pl-[26px] h-[30px] text-[12px]"
                placeholder="Enter ticker (e.g. AAPL)"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
              />
              <Search className="absolute left-2 top-[9px] w-3 h-3 text-fg-dim" />
            </div>
            <button type="submit" className="btn btn-primary btn-sm">
              Forecast
            </button>
          </form>
          <div className="text-[11px] text-fg-muted mt-3 leading-[1.6]">
            Prophet next-week directional forecast with confidence bands,
            ARIMA + GARCH volatility forecast, and candlestick pattern
            recognition over recent bars.
          </div>
        </div>

        <div className="b-card p-3">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-3.5 h-3.5 text-fg-dim" />
            <span className="text-[11px] uppercase tracking-[0.06em] text-fg-muted font-medium">
              Recent
            </span>
          </div>
          {recents.length === 0 ? (
            <div className="text-[11px] t-dim">No recent forecasts yet.</div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {recents.map((s) => (
                <Link
                  key={s}
                  href={`/forecast/${encodeURIComponent(s)}`}
                  className="chip mono tabular-nums hover:opacity-100"
                  style={{ textDecoration: "none" }}
                >
                  {s}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
