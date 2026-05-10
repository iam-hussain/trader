import { EventEmitter } from "node:events";
import {
  IBApi,
  EventName,
  OrderAction,
  OrderType,
  SecType,
  TimeInForce,
  type Contract,
  type Order,
} from "@stoqey/ib";
import type {
  BracketOrder,
  BrokerAdapter,
  BrokerOrderStatus,
  Position,
} from "./types.js";

export interface IbkrConfig {
  host: string;
  port: number;
  clientId: number;
  /** "paper" | "live" — used purely for surfacing in UI; auth happens in Gateway desktop. */
  mode: "paper" | "live";
}

export interface Logger {
  info: (msg: string, ctx?: Record<string, unknown>) => void;
  warn: (msg: string, ctx?: Record<string, unknown>) => void;
  error: (msg: string, ctx?: Record<string, unknown>) => void;
}

export class BrokerError extends Error {
  readonly kind = "broker_error" as const;
  constructor(
    message: string,
    public readonly code:
      | "not_connected"
      | "rejected"
      | "timeout"
      | "unknown" = "unknown"
  ) {
    super(message);
    this.name = "BrokerError";
  }
}

interface PendingBracket {
  parentId: number;
  resolve: (status: BrokerOrderStatus) => void;
  reject: (err: Error) => void;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
}

/**
 * IBKR / TWS adapter using @stoqey/ib. Wraps the event-driven TWS API with
 * a Promise-based, Node EventEmitter-compatible surface for the order
 * service. Lifecycle: connect → subscribe to events → receive nextValidId
 * → emit lifecycle. Auto-reconnects with capped backoff.
 *
 * Bracket OCA grouping: all three legs share `ocaGroup="oca:<parentId>"`
 * with `ocaType=1` so cancellation of any one cancels the others. Only the
 * last (stop) leg is transmitted, which atomically submits the triple.
 */
export class IbkrAdapter extends EventEmitter implements BrokerAdapter {
  readonly name = "ibkr";

  #ib: IBApi;
  #connected = false;
  #connecting: Promise<void> | null = null;
  #disconnectIntent = false;
  #reconnectAttempts = 0;
  readonly #maxReconnects = 5;
  readonly #reconnectDelayMs = 5_000;
  #nextOrderId = 1;
  #nextOrderIdReady: Promise<void>;
  #resolveNextOrderId!: () => void;
  #pendingBrackets = new Map<number, PendingBracket>();
  #log: Logger | null;

  constructor(public readonly config: IbkrConfig, logger: Logger | null = null) {
    super();
    this.#log = logger;
    this.#ib = new IBApi({
      host: config.host,
      port: config.port,
      clientId: config.clientId,
    });
    this.#nextOrderIdReady = new Promise<void>((res) => {
      this.#resolveNextOrderId = res;
    });
    this.#wireEvents();
  }

  // ── public api ─────────────────────────────────────────────────────────

  async connect(): Promise<void> {
    if (this.#connected) return;
    if (this.#connecting) return this.#connecting;
    this.#disconnectIntent = false;
    this.#connecting = new Promise<void>((resolve, reject) => {
      const onConnected = () => {
        this.#ib.off(EventName.connected, onConnected);
        this.#ib.off(EventName.error, onErr);
        resolve();
      };
      const onErr = (err: Error) => {
        // Only treat as a connect failure if we never got "connected".
        if (!this.#connected) {
          this.#ib.off(EventName.connected, onConnected);
          this.#ib.off(EventName.error, onErr);
          reject(err);
        }
      };
      this.#ib.on(EventName.connected, onConnected);
      this.#ib.on(EventName.error, onErr);
      try {
        this.#ib.connect();
      } catch (err) {
        this.#ib.off(EventName.connected, onConnected);
        this.#ib.off(EventName.error, onErr);
        reject(err as Error);
      }
    }).finally(() => {
      this.#connecting = null;
    });

    await this.#connecting;
    // Wait for the first nextValidId before allowing orders.
    await this.#nextOrderIdReady;
  }

  async disconnect(): Promise<void> {
    this.#disconnectIntent = true;
    if (!this.#connected) return;
    try {
      this.#ib.disconnect();
    } catch (err) {
      this.#log?.warn("ibkr disconnect threw", { err: String(err) });
    }
    this.#connected = false;
  }

  isConnected(): boolean {
    return this.#connected;
  }

  async placeBracket(order: BracketOrder): Promise<BrokerOrderStatus> {
    this.#assertConnected();

    const parentId = this.#claimOrderIds(3);
    const tpId = parentId + 1;
    const slId = parentId + 2;
    const ocaGroup = `oca:${parentId}`;
    const contract = buildContract(order);
    const oppositeAction =
      order.side === "buy" ? OrderAction.SELL : OrderAction.BUY;
    const tif = order.tif === "GTC" ? TimeInForce.GTC : TimeInForce.DAY;

    const parent: Order = {
      action: order.side === "buy" ? OrderAction.BUY : OrderAction.SELL,
      orderType: order.entryType === "market" ? OrderType.MKT : OrderType.LMT,
      totalQuantity: order.qty,
      tif,
      transmit: false,
      ocaGroup,
      ocaType: 1,
    };
    if (order.entryType === "limit") {
      if (order.entryPrice == null) {
        throw new BrokerError(
          "limit order requires entryPrice",
          "rejected"
        );
      }
      parent.lmtPrice = order.entryPrice;
    }

    const tp: Order = {
      action: oppositeAction,
      orderType: OrderType.LMT,
      totalQuantity: order.qty,
      lmtPrice: order.takeProfit,
      tif,
      transmit: false,
      parentId,
      ocaGroup,
      ocaType: 1,
    };

    const sl: Order = {
      action: oppositeAction,
      orderType: OrderType.STP,
      totalQuantity: order.qty,
      auxPrice: order.stopLoss,
      tif,
      transmit: true, // last leg transmits the whole bracket
      parentId,
      ocaGroup,
      ocaType: 1,
    };

    const result = new Promise<BrokerOrderStatus>((resolve, reject) => {
      this.#pendingBrackets.set(parentId, {
        parentId,
        resolve,
        reject,
        symbol: order.symbol,
        side: order.side,
        qty: order.qty,
      });
    });

    try {
      this.#ib.placeOrder(parentId, contract, parent);
      this.#ib.placeOrder(tpId, contract, tp);
      this.#ib.placeOrder(slId, contract, sl);
    } catch (err) {
      this.#pendingBrackets.delete(parentId);
      throw new BrokerError(
        `placeOrder failed: ${(err as Error).message}`,
        "rejected"
      );
    }

    // 30s safety timeout — TWS Submitted ack should be near-instant.
    const timeoutMs = 30_000;
    const status = await Promise.race([
      result,
      new Promise<BrokerOrderStatus>((_, rej) =>
        setTimeout(
          () => rej(new BrokerError("placeBracket ack timeout", "timeout")),
          timeoutMs
        )
      ),
    ]).finally(() => {
      // resolved or timed-out: clear from pending, but keep listening for fills via emitter
      this.#pendingBrackets.delete(parentId);
    });

    return status;
  }

  async cancelOrder(brokerOrderId: string): Promise<void> {
    this.#assertConnected();
    const id = Number.parseInt(brokerOrderId, 10);
    if (!Number.isFinite(id)) {
      throw new BrokerError(`invalid brokerOrderId: ${brokerOrderId}`, "rejected");
    }
    try {
      this.#ib.cancelOrder(id);
    } catch (err) {
      throw new BrokerError(
        `cancelOrder failed: ${(err as Error).message}`,
        "unknown"
      );
    }
  }

  async cancelAll(): Promise<number> {
    this.#assertConnected();
    const before = this.#pendingBrackets.size;
    try {
      this.#ib.reqGlobalCancel();
    } catch (err) {
      throw new BrokerError(
        `reqGlobalCancel failed: ${(err as Error).message}`,
        "unknown"
      );
    }
    return before;
  }

  async getPositions(): Promise<Position[]> {
    this.#assertConnected();
    return new Promise<Position[]>((resolve, reject) => {
      const positions: Position[] = [];
      const onPos = (
        _account: string,
        contract: Contract,
        pos: number,
        avgCost: number
      ) => {
        if (pos === 0) return;
        positions.push({
          symbol: contract.symbol ?? "",
          qty: pos,
          avgCost,
        });
      };
      const onEnd = () => {
        cleanup();
        resolve(positions);
      };
      const onErr = (err: Error) => {
        cleanup();
        reject(new BrokerError(`getPositions: ${err.message}`, "unknown"));
      };
      const cleanup = () => {
        this.#ib.off(EventName.position, onPos);
        this.#ib.off(EventName.positionEnd, onEnd);
        this.#ib.off(EventName.error, onErr);
        clearTimeout(timer);
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve(positions);
      }, 5_000);
      this.#ib.on(EventName.position, onPos);
      this.#ib.on(EventName.positionEnd, onEnd);
      this.#ib.on(EventName.error, onErr);
      try {
        this.#ib.reqPositions();
      } catch (err) {
        cleanup();
        reject(new BrokerError(`reqPositions: ${(err as Error).message}`, "unknown"));
      }
    });
  }

  async getDailyPnl(): Promise<number> {
    this.#assertConnected();
    return new Promise<number>((resolve) => {
      let dailyPnl = 0;
      const reqId = this.#claimOrderIds(1);
      const onPnl = (
        rid: number,
        daily: number,
        _unrealized?: number,
        _realized?: number
      ) => {
        if (rid !== reqId) return;
        if (Number.isFinite(daily)) dailyPnl = daily;
      };
      const cleanup = () => {
        this.#ib.off(EventName.pnl, onPnl);
        clearTimeout(timer);
        try {
          this.#ib.cancelPnL?.(reqId);
        } catch {
          /* ignore */
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve(dailyPnl);
      }, 2_000);
      this.#ib.on(EventName.pnl, onPnl);
      try {
        // Empty account string asks for the default account on the connection.
        this.#ib.reqPnL?.(reqId, "", "");
      } catch {
        cleanup();
        resolve(0);
      }
    });
  }

  // ── internals ──────────────────────────────────────────────────────────

  #assertConnected(): void {
    if (!this.#connected) {
      throw new BrokerError("IBKR not connected", "not_connected");
    }
  }

  #claimOrderIds(n: number): number {
    const id = this.#nextOrderId;
    this.#nextOrderId += n;
    return id;
  }

  #wireEvents(): void {
    this.#ib.on(EventName.connected, () => {
      this.#connected = true;
      this.#reconnectAttempts = 0;
      this.emit("connected");
      this.#log?.info("ibkr connected");
    });

    this.#ib.on(EventName.disconnected, () => {
      this.#connected = false;
      this.emit("disconnected");
      this.#log?.warn("ibkr disconnected");
      if (!this.#disconnectIntent) {
        void this.#scheduleReconnect();
      }
    });

    this.#ib.on(EventName.nextValidId, (orderId: number) => {
      if (orderId > this.#nextOrderId) this.#nextOrderId = orderId;
      this.#resolveNextOrderId();
    });

    this.#ib.on(EventName.error, (err: Error, code?: number, reqId?: number) => {
      this.#log?.warn("ibkr error event", {
        err: err.message,
        code,
        reqId,
      });
      // Reject any pending bracket whose parentId matches reqId.
      if (typeof reqId === "number") {
        const pending = this.#pendingBrackets.get(reqId);
        if (pending) {
          pending.reject(new BrokerError(err.message, "rejected"));
          this.#pendingBrackets.delete(reqId);
        }
      }
    });

    this.#ib.on(
      EventName.orderStatus,
      (
        orderId: number,
        status: string,
        filled: number,
        _remaining: number,
        avgFillPrice: number
      ) => {
        const mapped = mapOrderStatus(status);
        const evt: BrokerOrderStatus = {
          brokerOrderId: String(orderId),
          status: mapped,
          filledQty: filled,
          ...(Number.isFinite(avgFillPrice) && avgFillPrice > 0
            ? { avgFillPrice }
            : {}),
          message: status,
        };
        this.emit("orderStatus", evt);

        // Resolve the pending bracket Promise on the parent id.
        const pending = this.#pendingBrackets.get(orderId);
        if (pending) {
          if (mapped === "submitted" || mapped === "partial" || mapped === "filled") {
            pending.resolve(evt);
            this.#pendingBrackets.delete(orderId);
          } else if (mapped === "rejected" || mapped === "cancelled") {
            pending.reject(
              new BrokerError(
                `order ${orderId} ${mapped}: ${status}`,
                mapped === "rejected" ? "rejected" : "unknown"
              )
            );
            this.#pendingBrackets.delete(orderId);
          }
        }
      }
    );

    this.#ib.on(EventName.openOrder, (orderId: number, contract: Contract, order: Order) => {
      this.emit("openOrder", { orderId, contract, order });
    });

    this.#ib.on(
      EventName.position,
      (account: string, contract: Contract, pos: number, avgCost: number) => {
        if (pos === 0) return;
        const update: Position = {
          symbol: contract.symbol ?? "",
          qty: pos,
          avgCost,
        };
        this.emit("position", { account, position: update });
      }
    );

    this.#ib.on(
      EventName.execDetails,
      (reqId: number, contract: Contract, execution: unknown) => {
        this.emit("execution", { reqId, contract, execution });
      }
    );
  }

  async #scheduleReconnect(): Promise<void> {
    if (this.#disconnectIntent) return;
    if (this.#reconnectAttempts >= this.#maxReconnects) {
      this.#log?.error("ibkr reconnect attempts exhausted");
      this.emit("reconnect_failed");
      return;
    }
    this.#reconnectAttempts += 1;
    await new Promise((r) => setTimeout(r, this.#reconnectDelayMs));
    if (this.#disconnectIntent) return;
    try {
      await this.connect();
    } catch (err) {
      this.#log?.warn("ibkr reconnect failed", { err: String(err) });
      void this.#scheduleReconnect();
    }
  }
}

// ── helpers ──────────────────────────────────────────────────────────────

export function buildContract(order: BracketOrder): Contract {
  if (order.option) {
    return {
      symbol: order.symbol,
      secType: SecType.OPT,
      exchange: "SMART",
      currency: "USD",
      lastTradeDateOrContractMonth: order.option.expiry.replace(/-/g, ""),
      strike: order.option.strike,
      right: order.option.right,
      multiplier: "100",
    };
  }
  return {
    symbol: order.symbol,
    secType: SecType.STK,
    exchange: "SMART",
    currency: "USD",
  };
}

export function mapOrderStatus(
  status: string
): BrokerOrderStatus["status"] {
  const s = status.toLowerCase();
  if (s === "filled") return "filled";
  if (s === "cancelled" || s === "apicancelled" || s === "pendingcancel") {
    return "cancelled";
  }
  if (s === "inactive") return "rejected";
  if (s === "presubmitted" || s === "submitted" || s === "pendingsubmit") {
    return "submitted";
  }
  // partial fills surface as "Submitted" with filled>0; the orderStatus
  // callsite distinguishes via filled count, so default to submitted.
  return "submitted";
}
