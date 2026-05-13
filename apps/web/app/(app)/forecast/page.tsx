"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { Search, Clock, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { api } from "@/lib/api";
import {
  isError,
  type ForecastBundle,
  type ProphetForecast,
} from "@/lib/forecast";

const RECENT_KEY = "trader.forecast.recent";
const DEFAULT_SYMBOLS = ["SPY", "QQQ", "AAPL", "NVDA", "TSLA", "MSFT"] as const;

type WatchState =
  | { status: "loading" }
  | { status: "ok"; prophet: ProphetForecast | null }
  | { status: "error" };

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

function WatchCard({ symbol, state }: { symbol: string; state: WatchState }) {
  const prophet = state.status === "ok" ? state.prophet : null;
  const dir = (prophet?.direction || "").toLowerCase();
  const ret = prophet?.expectedReturnPct ?? null;
  const horizon = prophet?.horizonDays ?? null;
  const DirIcon =
    dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : Minus;
  const dirChip =
    dir === "up" ? "chip chip-pos" : dir === "down" ? "chip chip-neg" : "chip";

  return (
    <Link
      href={`/forecast/${encodeURIComponent(symbol)}`}
      className="b-card p-3 flex flex-col gap-2 hover:opacity-100"
      style={{ textDecoration: "none" }}
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold mono tabular-nums text-[14px]">
          {symbol}
        </span>
        {state.status === "loading" && (
          <span className="text-[11px] t-dim mono">—</span>
        )}
        {state.status === "error" && (
          <span className="text-[11px] t-dim mono">n/a</span>
        )}
        {state.status === "ok" && prophet && (
          <span className={dirChip}>
            <DirIcon className="w-3 h-3" /> {dir.toUpperCase() || "FLAT"}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="t-dim uppercase tracking-[0.06em]">Expected</span>
        <span
          className={clsx(
            "mono tabular-nums",
            ret !== null && ret > 0 && "t-pos",
            ret !== null && ret < 0 && "t-neg"
          )}
        >
          {ret === null
            ? "—"
            : `${ret > 0 ? "+" : ""}${ret.toFixed(2)}%`}
        </span>
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="t-dim uppercase tracking-[0.06em]">Horizon</span>
        <span className="mono tabular-nums t-dim">
          {horizon === null ? "—" : `${horizon}d`}
        </span>
      </div>
    </Link>
  );
}

export default function ForecastPage() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [recents, setRecents] = useState<string[]>([]);
  const [watch, setWatch] = useState<Record<string, WatchState>>(() =>
    Object.fromEntries(
      DEFAULT_SYMBOLS.map((s) => [s, { status: "loading" } as WatchState])
    )
  );

  useEffect(() => {
    setRecents(loadRecents());
  }, []);

  useEffect(() => {
    let cancelled = false;
    DEFAULT_SYMBOLS.forEach((sym) => {
      api<ForecastBundle>(`/api/forecast/${encodeURIComponent(sym)}`)
        .then((bundle) => {
          if (cancelled) return;
          const prophet =
            bundle.prophet && !isError(bundle.prophet) ? bundle.prophet : null;
          setWatch((prev) => ({
            ...prev,
            [sym]: { status: "ok", prophet },
          }));
        })
        .catch(() => {
          if (cancelled) return;
          // Silent per-symbol failure — don't toast (would spam).
          setWatch((prev) => ({ ...prev, [sym]: { status: "error" } }));
        });
    });
    return () => {
      cancelled = true;
    };
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
                onChange={(e) => setValue(e.target.value.toUpperCase())}
                autoFocus
              />
              <Search className="absolute left-2 top-[9px] w-3 h-3 text-fg-dim" />
            </div>
            <button type="submit" className="btn btn-primary btn-sm">
              Open forecast
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
            <span className="text-[11px] uppercase tracking-[0.06em] text-fg-muted font-medium">
              Watchlist
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {DEFAULT_SYMBOLS.map((sym) => (
              <WatchCard
                key={sym}
                symbol={sym}
                state={watch[sym] ?? { status: "loading" }}
              />
            ))}
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
