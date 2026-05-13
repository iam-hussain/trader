import { api } from "./api";

export type ParamType = "number" | "integer" | "string" | "boolean" | "select";

export interface ParamSchema {
  type: ParamType;
  default?: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<string | number>;
  label?: string;
  description?: string;
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  params: Record<string, ParamSchema>;
}

export interface StrategiesResponse {
  strategies: Strategy[];
}

export interface BacktestKpis {
  totalReturnPct: number;
  annualizedReturnPct: number;
  sharpe: number;
  sortino: number;
  maxDrawdownPct: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  tradeCount: number;
  avgHoldDays: number;
  bestTradePct: number;
  worstTradePct: number;
}

export interface BacktestTrade {
  id?: string | number;
  entryDate: string;
  exitDate: string;
  side: "long" | "short" | string;
  qty: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPct: number;
  holdDays: number;
  exitReason?: string;
}

export interface EquityPoint {
  date: string;
  equity: number;
  drawdown?: number;
}

export interface BacktestResult {
  trades: BacktestTrade[];
  equity_curve: EquityPoint[];
  kpis: BacktestKpis;
}

export interface BacktestRun {
  id: string;
  strategy: string;
  symbol: string;
  status: "queued" | "running" | "done" | "failed" | string;
  createdAt: string;
  startDate?: string;
  endDate?: string;
  params?: Record<string, unknown>;
  kpis?: BacktestKpis;
  result?: BacktestResult;
  error?: string;
}

export interface RunsResponse {
  runs: BacktestRun[];
}

export interface RunBacktestInput {
  strategy: string;
  symbol: string;
  start: string;
  end: string;
  params?: Record<string, unknown>;
}

export interface RunBacktestResponse {
  runId: string;
  jobId: string;
}

export interface JobStatus {
  status: "queued" | "running" | "done" | "failed" | string;
  runId?: string;
  error?: string;
}

export function listStrategies() {
  return api<StrategiesResponse>("/api/backtest/strategies");
}

export function listRuns() {
  return api<RunsResponse>("/api/backtest");
}

export function getRun(id: string) {
  return api<BacktestRun>(`/api/backtest/${encodeURIComponent(id)}`);
}

export function runBacktest(input: RunBacktestInput) {
  return api<RunBacktestResponse>("/api/backtest/run", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getJob(jobId: string) {
  return api<JobStatus>(`/api/backtest/jobs/${encodeURIComponent(jobId)}`);
}

/**
 * Polls a job until status is `done` or `failed`, or until timeout.
 * Resolves with the final JobStatus.
 */
export async function pollJob(
  jobId: string,
  interval = 1500,
  timeoutMs = 300_000,
): Promise<JobStatus> {
  const start = Date.now();
  // Loop until terminal status or timeout.
  // Use a small jitter to avoid lockstep polling on the server.

  while (true) {
    const job = await getJob(jobId);
    if (job.status === "done" || job.status === "failed") return job;
    if (Date.now() - start > timeoutMs) {
      return { ...job, status: "failed", error: job.error ?? "Polling timed out" };
    }
    await new Promise((r) => setTimeout(r, interval));
  }
}

export interface MonteCarloPercentiles {
  p5: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

export interface MonteCarloResponse {
  finalReturnPct: MonteCarloPercentiles;
  maxDrawdownPct: MonteCarloPercentiles;
  iterations?: number;
}

export function runMonteCarlo(trades: BacktestTrade[], iterations = 1000) {
  return api<MonteCarloResponse>("/api/backtest/monte-carlo", {
    method: "POST",
    body: JSON.stringify({ trades, iterations }),
  });
}
