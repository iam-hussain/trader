import { prisma } from "@trader/db";
import type { BrokerOrderStatus, Position } from "@trader/brokers";
import { getBrokerAdapter } from "@trader/brokers";
import {
  publishPositionUpdate,
  publishOrderEvent,
} from "../services/order-events.js";
import { env } from "../env.js";

const POLL_INTERVAL_MS = 3_000;

let _controller: AbortController | null = null;
let _adapterCleanup: (() => void) | null = null;
const _lastSnapshot = new Map<string, Position[]>();

const log = {
  info: (...a: unknown[]) => console.log("[positions-publisher]", ...a),
  warn: (...a: unknown[]) => console.warn("[positions-publisher]", ...a),
  error: (...a: unknown[]) => console.error("[positions-publisher]", ...a),
};

function positionsEqual(a: Position[], b: Position[]): boolean {
  if (a.length !== b.length) return false;
  const ka = new Map(a.map((p) => [p.symbol, p]));
  for (const p of b) {
    const prev = ka.get(p.symbol);
    if (
      !prev ||
      prev.qty !== p.qty ||
      prev.avgCost !== p.avgCost ||
      prev.marketPrice !== p.marketPrice ||
      prev.unrealizedPnl !== p.unrealizedPnl
    ) {
      return false;
    }
  }
  return true;
}

async function loadPrimaryUser(): Promise<{
  userId: string;
  config: { host: string; port: number; clientId: number; mode: "paper" | "live" };
} | null> {
  const count = await prisma.user.count();
  if (count === 0) return null;
  if (count > 1) {
    log.warn(`multi-user (${count}) unsupported in P4; using first user.`);
  }
  const user = await prisma.user.findFirst({ select: { id: true } });
  if (!user) return null;
  const setting = await prisma.setting.findUnique({ where: { userId: user.id } });
  return {
    userId: user.id,
    config: {
      host: setting?.ibkrHost ?? env.IBKR_HOST,
      port: setting?.ibkrPort ?? env.IBKR_PORT,
      clientId: env.IBKR_CLIENT_ID,
      mode: (setting?.ibkrMode ?? env.IBKR_MODE) as "paper" | "live",
    },
  };
}

async function handleOrderStatus(userId: string, s: BrokerOrderStatus): Promise<void> {
  try {
    const trade = await prisma.trade.findFirst({
      where: { userId, brokerOrderId: s.brokerOrderId },
    });
    if (!trade) return;
    const data: Record<string, unknown> = {
      brokerStatus: s.status,
      filledQty: s.filledQty,
    };
    if (s.avgFillPrice !== undefined && trade.entryPrice == null) {
      data.entryPrice = s.avgFillPrice;
    }
    // Closing fill: filled when we already had an entryPrice and price differs.
    if (
      s.status === "filled" &&
      s.filledQty >= trade.qty &&
      trade.entryPrice != null &&
      s.avgFillPrice !== undefined &&
      s.avgFillPrice !== trade.entryPrice &&
      trade.closedAt == null
    ) {
      data.closedAt = new Date();
      data.exitPrice = s.avgFillPrice;
      const dir = trade.side === "buy" ? 1 : -1;
      data.pnl = (s.avgFillPrice - trade.entryPrice) * trade.qty * dir;
    }
    await prisma.trade.update({ where: { id: trade.id }, data });

    const type =
      s.status === "filled"
        ? "order.filled"
        : s.status === "cancelled"
          ? "order.cancelled"
          : s.status === "rejected"
            ? "order.rejected"
            : "order.update";
    await publishOrderEvent(userId, {
      type,
      tradeId: trade.id,
      brokerOrderId: s.brokerOrderId,
      status: s.status,
      filledQty: s.filledQty,
      avgFillPrice: s.avgFillPrice,
      message: s.message,
    });
  } catch (err) {
    log.error("handleOrderStatus failed", err);
  }
}

async function handleExecution(userId: string, e: BrokerOrderStatus): Promise<void> {
  try {
    const trade = await prisma.trade.findFirst({
      where: { userId, brokerOrderId: e.brokerOrderId },
    });
    if (!trade) return;
    await publishOrderEvent(userId, {
      type: "order.execution",
      tradeId: trade.id,
      brokerOrderId: e.brokerOrderId,
      filledQty: e.filledQty,
      avgFillPrice: e.avgFillPrice,
    });
  } catch (err) {
    log.error("handleExecution failed", err);
  }
}

function publishPositionsIfChanged(userId: string, positions: Position[]): void {
  const prev = _lastSnapshot.get(userId);
  if (!prev || !positionsEqual(prev, positions)) {
    _lastSnapshot.set(userId, positions);
    void publishPositionUpdate(userId, positions);
  }
}

function wireAdapterEvents(
  userId: string,
  adapter: ReturnType<typeof getBrokerAdapter>
): () => void {
  const onStatus = (s: BrokerOrderStatus) => void handleOrderStatus(userId, s);
  const onPosition = (positions: Position[]) =>
    publishPositionsIfChanged(userId, positions);
  const onExec = (e: BrokerOrderStatus) => void handleExecution(userId, e);

  const ev = adapter as unknown as {
    on?: (event: string, h: (...a: unknown[]) => void) => void;
    off?: (event: string, h: (...a: unknown[]) => void) => void;
  };
  ev.on?.("orderStatus", onStatus as (...a: unknown[]) => void);
  ev.on?.("position", onPosition as (...a: unknown[]) => void);
  ev.on?.("execution", onExec as (...a: unknown[]) => void);
  return () => {
    ev.off?.("orderStatus", onStatus as (...a: unknown[]) => void);
    ev.off?.("position", onPosition as (...a: unknown[]) => void);
    ev.off?.("execution", onExec as (...a: unknown[]) => void);
  };
}

async function pollOnce(
  userId: string,
  config: { host: string; port: number; clientId: number; mode: "paper" | "live" }
): Promise<void> {
  const adapter = getBrokerAdapter(config);
  if (!adapter.isConnected()) return;
  if (!_adapterCleanup) _adapterCleanup = wireAdapterEvents(userId, adapter);
  try {
    const positions = await adapter.getPositions();
    publishPositionsIfChanged(userId, positions);
  } catch (err) {
    log.warn("getPositions failed", err);
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });
}

async function loop(signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    try {
      const primary = await loadPrimaryUser();
      if (primary) await pollOnce(primary.userId, primary.config);
    } catch (err) {
      log.error("poll cycle failed", err);
    }
    await sleep(POLL_INTERVAL_MS, signal);
  }
}

export function startPositionsPublisher(): AbortController {
  if (_controller) return _controller;
  _controller = new AbortController();
  void loop(_controller.signal);
  log.info(`started (poll=${POLL_INTERVAL_MS}ms)`);
  return _controller;
}

export async function stopPositionsPublisher(): Promise<void> {
  if (!_controller) return;
  _controller.abort();
  _controller = null;
  if (_adapterCleanup) {
    _adapterCleanup();
    _adapterCleanup = null;
  }
  _lastSnapshot.clear();
}
