import type {
  BracketOrder,
  BrokerAdapter,
  BrokerOrderStatus,
  Position,
} from "./types";

export interface IbkrConfig {
  host: string;
  port: number;
  clientId: number;
  /** "paper" | "live" — used purely for surfacing in UI; auth happens in Gateway desktop. */
  mode: "paper" | "live";
}

/**
 * Phase 1 stub: returns NotConnected errors. Phase 4 will wire this up to
 * @stoqey/ib (TWS API) — connect, market data, place bracket, cancel-all,
 * positions, P&L.
 */
export class IbkrAdapter implements BrokerAdapter {
  readonly name = "ibkr";
  #connected = false;

  constructor(public readonly config: IbkrConfig) {}

  async connect(): Promise<void> {
    // TODO(phase-4): real TWS connection via @stoqey/ib
    throw new Error(
      "IBKR adapter is a Phase 1 stub. Wire up @stoqey/ib in Phase 4."
    );
  }

  async disconnect(): Promise<void> {
    this.#connected = false;
  }

  isConnected(): boolean {
    return this.#connected;
  }

  async placeBracket(_order: BracketOrder): Promise<BrokerOrderStatus> {
    throw new Error("IBKR not connected");
  }

  async cancelOrder(_brokerOrderId: string): Promise<void> {
    throw new Error("IBKR not connected");
  }

  async cancelAll(): Promise<number> {
    throw new Error("IBKR not connected");
  }

  async getPositions(): Promise<Position[]> {
    return [];
  }

  async getDailyPnl(): Promise<number> {
    return 0;
  }
}
