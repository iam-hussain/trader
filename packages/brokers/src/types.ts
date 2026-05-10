export type Side = "buy" | "sell";
export type Tif = "DAY" | "GTC";

export interface BracketOrder {
  symbol: string;
  side: Side;
  qty: number;
  entryType: "limit" | "market";
  entryPrice?: number;
  takeProfit: number;
  stopLoss: number;
  tif?: Tif;
  /** For options: ISO YYYY-MM-DD expiry, strike, right. */
  option?: { expiry: string; strike: number; right: "C" | "P" };
}

export interface BrokerOrderStatus {
  brokerOrderId: string;
  status: "submitted" | "filled" | "partial" | "cancelled" | "rejected";
  filledQty: number;
  avgFillPrice?: number;
  message?: string;
}

export interface Position {
  symbol: string;
  qty: number;
  avgCost: number;
  marketPrice?: number;
  unrealizedPnl?: number;
  realizedPnl?: number;
}

export interface BrokerAdapter {
  readonly name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  placeBracket(order: BracketOrder): Promise<BrokerOrderStatus>;
  cancelOrder(brokerOrderId: string): Promise<void>;
  cancelAll(): Promise<number>;

  getPositions(): Promise<Position[]>;
  getDailyPnl(): Promise<number>;
}
