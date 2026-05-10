"use client";
import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { KillSwitch } from "@/components/KillSwitch";
import { LiveBanner } from "@/components/LiveBanner";
import { RiskHeader } from "@/components/RiskHeader";
import { StagedOrderRow } from "@/components/StagedOrderRow";
import { PositionsPanel } from "@/components/PositionsPanel";
import { fetcher, api } from "@/lib/api";
import {
  type Trade,
  cancelAll,
  cancelOrder,
  confirmOrder,
  flattenAll,
  OrderError,
} from "@/lib/orders";
import { useUserEvents } from "@/lib/sse";

interface OrdersResponse {
  orders: Trade[];
}
interface HistoryResponse {
  trades: Trade[];
}
interface BrokerStatus {
  connected: boolean;
  mode: "paper" | "live";
  host: string;
  port: number;
}
interface PnlResponse {
  realizedPnl: number;
  unrealizedPnl: number;
  pnl: number;
}
interface SettingsResponse {
  accountSizeUsd: number;
  maxRiskPerTradePct: number;
  maxDailyLossPct: number;
  maxTradesPerDay: number;
  ibkrMode: string;
}

type Filter = "all" | "equities" | "options";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function OrdersPage() {
  const orders = useSWR<OrdersResponse>("/api/orders", fetcher, {
    keepPreviousData: true,
    refreshInterval: 10_000,
  });
  const broker = useSWR<BrokerStatus>("/api/positions/broker/status", fetcher, {
    refreshInterval: 15_000,
  });
  const pnl = useSWR<PnlResponse>("/api/positions/pnl", fetcher, {
    keepPreviousData: true,
    refreshInterval: 15_000,
  });
  const settings = useSWR<SettingsResponse>("/api/settings", fetcher);
  const today = todayIso();
  const history = useSWR<HistoryResponse>(
    `/api/orders/history?from=${today}`,
    fetcher,
    { keepPreviousData: true, refreshInterval: 30_000 },
  );

  // SSE: refresh affected SWR caches in place.
  useUserEvents((e) => {
    if (e.type.startsWith("order.")) {
      void orders.mutate();
      void history.mutate();
      void pnl.mutate();
    }
    if (e.type === "positions.update") {
      void pnl.mutate();
    }
  });

  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [riskReasons, setRiskReasons] = useState<Record<string, string[]>>({});

  const staged = useMemo(() => {
    const all = orders.data?.orders ?? [];
    return all.filter((t) => t.status === "staged" || t.status === "submitted");
  }, [orders.data]);

  const filtered = useMemo(() => {
    if (filter === "all") return staged;
    if (filter === "options") return staged.filter((t) => !!t.optionLeg);
    return staged.filter((t) => !t.optionLeg);
  }, [staged, filter]);

  const handleConfirm = useCallback(
    async (t: Trade) => {
      setBusyId(t.id);
      setRowError((m) => ({ ...m, [t.id]: "" }));
      setRiskReasons((m) => ({ ...m, [t.id]: [] }));
      try {
        await confirmOrder(t.id);
        await orders.mutate();
      } catch (e) {
        if (e instanceof OrderError) {
          if (e.kind === "risk_rejected") {
            const reasons =
              (e.result?.reasons as string[] | undefined) ??
              (e.message ? [e.message] : ["Risk check failed"]);
            setRiskReasons((m) => ({ ...m, [t.id]: reasons }));
          } else {
            setRowError((m) => ({ ...m, [t.id]: e.message }));
          }
        } else {
          setRowError((m) => ({
            ...m,
            [t.id]: e instanceof Error ? e.message : "Confirm failed",
          }));
        }
      } finally {
        setBusyId(null);
      }
    },
    [orders],
  );

  const handleCancel = useCallback(
    async (t: Trade) => {
      setBusyId(t.id);
      try {
        await cancelOrder(t.id);
        await orders.mutate();
      } catch (e) {
        setRowError((m) => ({
          ...m,
          [t.id]: e instanceof Error ? e.message : "Cancel failed",
        }));
      } finally {
        setBusyId(null);
      }
    },
    [orders],
  );

  const handleKill = useCallback(async () => {
    try {
      await cancelAll();
    } finally {
      await orders.mutate();
    }
  }, [orders]);

  const handleFlatten = useCallback(async () => {
    try {
      await flattenAll();
    } finally {
      await orders.mutate();
      await pnl.mutate();
    }
  }, [orders, pnl]);

  const handleSwitchToPaper = useCallback(async () => {
    try {
      await api("/api/settings/broker/switch-mode", {
        method: "POST",
        body: JSON.stringify({ mode: "paper" }),
      });
    } finally {
      await broker.mutate();
      await settings.mutate();
    }
  }, [broker, settings]);

  const acctSize = settings.data?.accountSizeUsd ?? 0;
  const realized = pnl.data?.realizedPnl ?? 0;
  const unrealized = pnl.data?.unrealizedPnl ?? 0;
  const pnlAtRisk = realized + unrealized;
  const pnlPct = acctSize > 0 ? (pnlAtRisk / acctSize) * 100 : 0;
  const dayHistoryLen = history.data?.trades?.length ?? 0;
  const tradesCap = settings.data?.maxTradesPerDay ?? 5;
  const ddCap = settings.data?.maxDailyLossPct ?? 2;
  const ddPct = pnlPct < 0 ? Math.abs(pnlPct) : 0;

  const isLive = broker.data?.mode === "live" && broker.data?.connected;

  const recent = (history.data?.trades ?? []).slice(0, 20);

  return (
    <>
      {isLive && broker.data && (
        <LiveBanner
          host={broker.data.host}
          port={broker.data.port}
          onSwitchToPaper={() => void handleSwitchToPaper()}
        />
      )}
      <Topbar
        crumbs={["Workspace", "Orders"]}
        right={
          <div className="flex items-center gap-2">
            <BrokerPill broker={broker.data} />
            <KillSwitch onTrigger={handleFlatten} label="Flatten" />
            <KillSwitch onTrigger={handleKill} label="Kill switch" />
          </div>
        }
      />
      <div className="page max-w-[1200px]">
        <RiskHeader
          tradesUsed={dayHistoryLen}
          tradesCap={tradesCap}
          pnlPct={pnlPct}
          pnlAtRisk={pnlAtRisk}
          drawdownPct={ddPct}
          drawdownCap={ddCap}
        />

        <section className="b-card p-3 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-medium">Staged orders</span>
            <span className="chip">{staged.length}</span>
            <div className="seg ml-auto">
              <button
                className={filter === "all" ? "active" : ""}
                onClick={() => setFilter("all")}
              >
                All
              </button>
              <button
                className={filter === "equities" ? "active" : ""}
                onClick={() => setFilter("equities")}
              >
                Equities
              </button>
              <button
                className={filter === "options" ? "active" : ""}
                onClick={() => setFilter("options")}
              >
                Options
              </button>
            </div>
          </div>
          {filtered.length === 0 ? (
            <div className="t-muted text-[12px] py-6 text-center">
              No staged orders. Stage from a brief or watchlist.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map((t) => (
                <StagedOrderRow
                  key={t.id}
                  trade={t}
                  busy={busyId === t.id}
                  error={rowError[t.id]}
                  riskReasons={riskReasons[t.id]}
                  onConfirm={() => handleConfirm(t)}
                  onCancel={() => handleCancel(t)}
                  onEdit={() => {}}
                  onEdited={() => void orders.mutate()}
                />
              ))}
            </div>
          )}
        </section>

        <PositionsPanel accountSizeUsd={acctSize} />

        <section className="b-card overflow-hidden">
          <div
            className="flex items-center px-3 py-2 border-b"
            style={{ borderColor: "var(--border)" }}
          >
            <span className="text-[12px] font-medium">Today</span>
            <span className="chip ml-2">{recent.length}</span>
            <Link
              href="/orders/history"
              className="btn btn-ghost btn-sm ml-auto"
            >
              Full history
            </Link>
          </div>
          {recent.length === 0 ? (
            <div className="t-muted text-[12px] py-6 text-center">
              No fills or cancels today.
            </div>
          ) : (
            <table className="t">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Ticker</th>
                  <th>Side</th>
                  <th className="r">Qty</th>
                  <th className="r">Entry</th>
                  <th className="r">Exit</th>
                  <th>Status</th>
                  <th className="r">P/L</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((t) => (
                  <tr key={t.id}>
                    <td className="mono tabular-nums t-dim">
                      {new Date(t.closedAt ?? t.openedAt).toLocaleTimeString()}
                    </td>
                    <td className="mono tabular-nums">{t.ticker}</td>
                    <td>
                      <span
                        className={
                          t.side === "buy" ? "chip chip-pos" : "chip chip-neg"
                        }
                      >
                        {t.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="r mono tabular-nums">{t.qty}</td>
                    <td className="r mono tabular-nums">
                      {t.entryPrice !== undefined ? t.entryPrice.toFixed(2) : "—"}
                    </td>
                    <td className="r mono tabular-nums">
                      {t.exitPrice !== undefined ? t.exitPrice.toFixed(2) : "—"}
                    </td>
                    <td>
                      <span className="chip">{t.status}</span>
                    </td>
                    <td
                      className={`r mono tabular-nums ${
                        (t.pnl ?? 0) > 0
                          ? "t-pos"
                          : (t.pnl ?? 0) < 0
                            ? "t-neg"
                            : ""
                      }`}
                    >
                      {t.pnl !== undefined ? `$${t.pnl.toFixed(2)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}

function BrokerPill({ broker }: { broker?: BrokerStatus }) {
  if (!broker) {
    return <span className="chip">broker —</span>;
  }
  const cls =
    broker.connected && broker.mode === "live"
      ? "chip chip-neg"
      : broker.connected
        ? "chip chip-pos"
        : "chip chip-warn";
  return (
    <span className={cls} title={`${broker.host}:${broker.port}`}>
      <span
        className="dot"
        style={{
          background: broker.connected
            ? broker.mode === "live"
              ? "var(--destructive)"
              : "var(--success)"
            : "var(--warning)",
        }}
      />
      {broker.connected ? broker.mode : "disconnected"}
    </span>
  );
}
