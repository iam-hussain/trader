import { describe, it, expect, vi, beforeEach } from "vitest";

// ── prisma mock ──────────────────────────────────────────────────────────
const prismaMock = {
  signal: { findUnique: vi.fn(), update: vi.fn() },
  trade: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  setting: { findUnique: vi.fn() },
  ticker: { findMany: vi.fn() },
  $transaction: vi.fn(async (arg: unknown) => {
    if (typeof arg === "function") {
      return (arg as (tx: typeof prismaMock) => unknown)(prismaMock);
    }
    if (Array.isArray(arg)) return Promise.all(arg as Promise<unknown>[]);
    return arg;
  }),
};
vi.mock("@trader/db", () => ({
  prisma: prismaMock,
}));

// ── broker mock ──────────────────────────────────────────────────────────
const brokerMock = {
  name: "ibkr",
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  isConnected: vi.fn().mockReturnValue(true),
  placeBracket: vi.fn(),
  cancelOrder: vi.fn().mockResolvedValue(undefined),
  cancelAll: vi.fn().mockResolvedValue(0),
  getPositions: vi.fn().mockResolvedValue([]),
  getDailyPnl: vi.fn().mockResolvedValue(0),
  on: vi.fn(),
  off: vi.fn(),
};
vi.mock("@trader/brokers", () => ({
  getBrokerAdapter: vi.fn(() => brokerMock),
  resetBrokerAdapter: vi.fn(() => undefined),
}));

// ── pubsub mock ──────────────────────────────────────────────────────────
vi.mock("./order-events.js", () => ({
  publishOrderEvent: vi.fn().mockResolvedValue(undefined),
  publishPositionUpdate: vi.fn().mockResolvedValue(undefined),
}));

// ── journal mock ─────────────────────────────────────────────────────────
vi.mock("./journal-service.js", () => ({
  attachToTrade: vi.fn().mockResolvedValue(undefined),
}));

// ── risk-engine mock ─────────────────────────────────────────────────────
const checkRiskMock = vi.fn();
vi.mock("./risk-engine.js", () => ({
  aggregateRiskState: vi.fn().mockResolvedValue({
    accountSizeUsd: 25000,
    todayRealizedPnl: 0,
    tradesPlacedToday: 0,
    exposurePct: 0,
    openPositionsBySector: {},
  }),
  checkRisk: (...args: unknown[]) => checkRiskMock(...args),
  sizePosition: vi.fn(),
}));

// ── env mock ─────────────────────────────────────────────────────────────
vi.mock("../env.js", () => ({
  env: {
    IBKR_HOST: "127.0.0.1",
    IBKR_PORT: 7497,
    IBKR_CLIENT_ID: 42,
    IBKR_MODE: "paper",
  },
}));

import {
  stageOrder,
  confirmOrder,
  cancelOrder,
  flattenAll,
  mapSignalToBracket,
  BrokerError,
} from "./order-service.js";
import { RiskError } from "../middleware/risk-middleware.js";

const baseSignal = {
  id: "sig1",
  userId: "u1",
  briefId: null,
  ticker: "AAPL",
  direction: "long",
  instrument: "stock",
  entry: 200,
  target1: 215,
  target2: null,
  stop: 195,
  qty: 50,
  riskReward: 3,
  confidence: 0.6,
  holdPeriod: "swing",
  thesis: "Reclaim of 50dma with rising volume on supportive macro.",
  signals: [],
  catalysts: [],
  invalidation: null,
  optionLeg: null,
  llmProvider: "anthropic",
  llmModel: "claude",
  status: "proposed",
  createdAt: new Date(),
  expiresAt: null,
};

const baseTrade = {
  id: "t1",
  userId: "u1",
  signalId: "sig1",
  ticker: "AAPL",
  side: "buy",
  qty: 50,
  entryPrice: 200,
  exitPrice: null,
  stopPrice: 195,
  targetPrice: 215,
  brokerOrderId: null,
  brokerStatus: "staged",
  filledQty: 0,
  pnl: null,
  fees: null,
  notes: null,
  tags: [],
  openedAt: new Date(),
  closedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.setting.findUnique.mockResolvedValue({
    accountSizeUsd: 25000,
    maxRiskPerTradePct: 1.0,
    maxDailyLossPct: 3.0,
    maxTradesPerDay: 5,
    blackoutMacroEvents: false,
    blackoutMinutes: 30,
  });
  prismaMock.trade.findMany.mockResolvedValue([]);
  prismaMock.ticker.findMany.mockResolvedValue([]);
});

describe("mapSignalToBracket", () => {
  it("maps stock signal correctly", () => {
    const b = mapSignalToBracket(baseSignal as never);
    expect(b).toEqual({
      symbol: "AAPL",
      side: "buy",
      qty: 50,
      entryType: "limit",
      entryPrice: 200,
      takeProfit: 215,
      stopLoss: 195,
      tif: "DAY",
    });
  });

  it("maps option signal with right=C", () => {
    const opt = {
      ...baseSignal,
      instrument: "option",
      optionLeg: { type: "call", strike: 210, expiry: "2025-06-20" },
    };
    const b = mapSignalToBracket(opt as never);
    expect(b.option).toEqual({
      expiry: "2025-06-20",
      strike: 210,
      right: "C",
    });
  });
});

describe("stageOrder", () => {
  it("copies signal fields when signalId is given", async () => {
    prismaMock.signal.findUnique.mockResolvedValue(baseSignal);
    prismaMock.trade.create.mockResolvedValue(baseTrade);
    prismaMock.signal.update.mockResolvedValue(baseSignal);

    const trade = await stageOrder("u1", { signalId: "sig1" });

    expect(prismaMock.trade.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "u1",
        signalId: "sig1",
        ticker: "AAPL",
        side: "buy",
        qty: 50,
        entryPrice: 200,
        targetPrice: 215,
        stopPrice: 195,
        brokerStatus: "staged",
      }),
    });
    expect(prismaMock.signal.update).toHaveBeenCalledWith({
      where: { id: "sig1" },
      data: { status: "staged" },
    });
    expect(trade).toBe(baseTrade);
  });

  it("rejects when neither signalId nor raw fields supplied", async () => {
    await expect(stageOrder("u1", {} as never)).rejects.toBeTruthy();
  });
});

describe("confirmOrder", () => {
  it("throws RiskError when risk check returns allowed=false", async () => {
    prismaMock.trade.findUnique.mockResolvedValue(baseTrade);
    prismaMock.signal.findUnique.mockResolvedValue(baseSignal);
    checkRiskMock.mockReturnValue({
      allowed: false,
      reasons: ["max_trades_per_day"],
    });

    await expect(confirmOrder("u1", "t1")).rejects.toBeInstanceOf(RiskError);
    expect(brokerMock.placeBracket).not.toHaveBeenCalled();
  });

  it("calls broker.placeBracket with correct stock mapping", async () => {
    prismaMock.trade.findUnique.mockResolvedValue(baseTrade);
    prismaMock.signal.findUnique.mockResolvedValue(baseSignal);
    prismaMock.trade.update.mockResolvedValue({
      ...baseTrade,
      brokerOrderId: "1001",
      brokerStatus: "submitted",
    });
    prismaMock.signal.update.mockResolvedValue(baseSignal);
    checkRiskMock.mockReturnValue({ allowed: true, reasons: [] });
    brokerMock.placeBracket.mockResolvedValue({
      brokerOrderId: "1001",
      status: "submitted",
      filledQty: 0,
    });

    await confirmOrder("u1", "t1");

    expect(brokerMock.placeBracket).toHaveBeenCalledTimes(1);
    const arg = brokerMock.placeBracket.mock.calls[0]?.[0];
    expect(arg).toMatchObject({
      symbol: "AAPL",
      side: "buy",
      qty: 50,
      entryType: "limit",
      entryPrice: 200,
      takeProfit: 215,
      stopLoss: 195,
    });
    expect(arg.option).toBeUndefined();
    expect(prismaMock.trade.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: expect.objectContaining({
        brokerOrderId: "1001",
        brokerStatus: "submitted",
      }),
    });
  });

  it("calls broker.placeBracket with option leg mapping", async () => {
    const optSignal = {
      ...baseSignal,
      instrument: "option",
      entry: 2.0,
      target1: 4.0,
      stop: 1.0,
      optionLeg: { type: "call", strike: 500, expiry: "2025-06-20" },
    };
    const optTrade = {
      ...baseTrade,
      entryPrice: 2.0,
      targetPrice: 4.0,
      stopPrice: 1.0,
    };
    prismaMock.trade.findUnique.mockResolvedValue(optTrade);
    prismaMock.signal.findUnique.mockResolvedValue(optSignal);
    prismaMock.trade.update.mockResolvedValue(optTrade);
    prismaMock.signal.update.mockResolvedValue(optSignal);
    checkRiskMock.mockReturnValue({ allowed: true, reasons: [] });
    brokerMock.placeBracket.mockResolvedValue({
      brokerOrderId: "2002",
      status: "submitted",
      filledQty: 0,
    });

    await confirmOrder("u1", "t1");

    const arg = brokerMock.placeBracket.mock.calls[0]?.[0];
    expect(arg.option).toEqual({
      expiry: "2025-06-20",
      strike: 500,
      right: "C",
    });
    expect(arg.entryPrice).toBe(2.0);
    expect(arg.takeProfit).toBe(4.0);
    expect(arg.stopLoss).toBe(1.0);
  });

  it("rolls back to staged when broker placement fails", async () => {
    prismaMock.trade.findUnique.mockResolvedValue(baseTrade);
    prismaMock.signal.findUnique.mockResolvedValue(baseSignal);
    prismaMock.trade.update.mockResolvedValue(baseTrade);
    checkRiskMock.mockReturnValue({ allowed: true, reasons: [] });
    brokerMock.placeBracket.mockRejectedValue(new Error("TWS rejected"));

    await expect(confirmOrder("u1", "t1")).rejects.toBeInstanceOf(BrokerError);
    expect(prismaMock.trade.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { brokerStatus: "staged" },
    });
  });
});

describe("cancelOrder", () => {
  it("calls broker.cancelOrder and updates Trade row", async () => {
    prismaMock.trade.findUnique.mockResolvedValue({
      ...baseTrade,
      brokerOrderId: "1001",
      brokerStatus: "submitted",
    });
    prismaMock.trade.update.mockResolvedValue(baseTrade);

    await cancelOrder("u1", "t1");

    expect(brokerMock.cancelOrder).toHaveBeenCalledWith("1001");
    expect(prismaMock.trade.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: expect.objectContaining({ brokerStatus: "cancelled" }),
    });
  });

  it("marks staged trades cancelled without calling broker", async () => {
    prismaMock.trade.findUnique.mockResolvedValue({
      ...baseTrade,
      brokerOrderId: null,
      brokerStatus: "staged",
    });
    prismaMock.trade.update.mockResolvedValue(baseTrade);

    await cancelOrder("u1", "t1");
    expect(brokerMock.cancelOrder).not.toHaveBeenCalled();
  });
});

describe("flattenAll", () => {
  it("submits opposite-side market orders for each open position", async () => {
    brokerMock.getPositions.mockResolvedValue([
      { symbol: "AAPL", qty: 100, avgCost: 200 },
      { symbol: "TSLA", qty: -50, avgCost: 240 },
    ]);
    brokerMock.placeBracket.mockResolvedValue({
      brokerOrderId: "x",
      status: "submitted",
      filledQty: 0,
    });
    prismaMock.trade.findMany.mockResolvedValue([]);
    prismaMock.trade.update.mockResolvedValue(baseTrade);

    const result = await flattenAll("u1");

    expect(brokerMock.placeBracket).toHaveBeenCalledTimes(2);
    const calls = brokerMock.placeBracket.mock.calls.map((c) => c[0]);
    const aapl = calls.find((c) => c.symbol === "AAPL");
    const tsla = calls.find((c) => c.symbol === "TSLA");
    expect(aapl?.side).toBe("sell");
    expect(aapl?.qty).toBe(100);
    expect(aapl?.entryType).toBe("market");
    expect(tsla?.side).toBe("buy");
    expect(tsla?.qty).toBe(50);
    expect(tsla?.entryType).toBe("market");
    expect(result.closed).toBe(2);
  });
});
