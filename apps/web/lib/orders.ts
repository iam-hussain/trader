import { api } from "./api";

export type TradeSide = "buy" | "sell";
export type TradeStatus =
  | "staged"
  | "submitted"
  | "filled"
  | "partial"
  | "cancelled"
  | "rejected";

export interface OptionLeg {
  expiry: string;
  strike: number;
  right: "C" | "P";
  multiplier?: number;
}

export interface Trade {
  id: string;
  signalId?: string;
  ticker: string;
  side: TradeSide;
  qty: number;
  entryPrice?: number;
  exitPrice?: number;
  stopPrice?: number;
  targetPrice?: number;
  brokerOrderId?: string;
  brokerStatus?: string;
  status: TradeStatus;
  filledQty: number;
  pnl?: number;
  fees?: number;
  notes?: string;
  tags: string[];
  openedAt: string;
  closedAt?: string;
  optionLeg?: OptionLeg;
}

export interface StageOrderInput {
  signalId?: string;
  ticker?: string;
  side?: TradeSide;
  qty?: number;
  entryPrice?: number;
  takeProfit?: number;
  stopLoss?: number;
  optionLeg?: OptionLeg;
  notes?: string;
}

export interface RiskCheckResult {
  ok: boolean;
  reasons?: string[];
  [k: string]: unknown;
}

export type OrderErrorKind = "risk_rejected" | "broker_error" | "unknown";

export class OrderError extends Error {
  kind: OrderErrorKind;
  result?: RiskCheckResult;
  status?: number;

  constructor(opts: {
    kind: OrderErrorKind;
    message?: string;
    result?: RiskCheckResult;
    status?: number;
  }) {
    super(opts.message ?? opts.kind);
    this.name = "OrderError";
    this.kind = opts.kind;
    this.result = opts.result;
    this.status = opts.status;
  }
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

async function rawJson(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { res, body };
}

export async function stageOrder(input: StageOrderInput): Promise<Trade> {
  const out = await api<{ trade: Trade }>("/api/orders/stage", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return out.trade;
}

export async function confirmOrder(tradeId: string): Promise<Trade> {
  const { res, body } = await rawJson(`/api/orders/${tradeId}/confirm`, {
    method: "POST",
  });
  if (res.ok) {
    return (body as { trade: Trade }).trade;
  }
  const b = (body ?? {}) as { error?: string; message?: string; result?: RiskCheckResult };
  if (res.status === 422 && b.error === "risk_rejected") {
    throw new OrderError({
      kind: "risk_rejected",
      message: b.message ?? "Risk check failed",
      result: b.result,
      status: res.status,
    });
  }
  if (res.status === 502 || b.error === "broker_error") {
    throw new OrderError({
      kind: "broker_error",
      message: b.message ?? "Broker error",
      status: res.status,
    });
  }
  throw new OrderError({
    kind: "unknown",
    message: b.message ?? `Confirm failed (${res.status})`,
    status: res.status,
  });
}

export async function cancelOrder(tradeId: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/api/orders/${tradeId}/cancel`, { method: "POST" });
}

export async function cancelAll(): Promise<{ cancelled: number }> {
  return api<{ cancelled: number }>("/api/orders/cancel-all", { method: "POST" });
}

export async function flattenAll(): Promise<{ closed: number }> {
  return api<{ closed: number }>("/api/orders/flatten-all", {
    method: "POST",
    body: JSON.stringify({ confirm: true }),
  });
}

export async function editOrder(
  tradeId: string,
  patch: Partial<Pick<Trade, "qty" | "entryPrice" | "stopPrice" | "targetPrice" | "notes">>,
): Promise<Trade> {
  const out = await api<{ trade: Trade }>(`/api/orders/${tradeId}/edit`, {
    method: "POST",
    body: JSON.stringify(patch),
  });
  return out.trade;
}
