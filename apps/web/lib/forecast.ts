import { api } from "./api";

export interface ProphetPoint {
  date: string;
  close: number;
}

export interface ProphetForecastPoint {
  date: string;
  yhat: number;
  yhatLower: number;
  yhatUpper: number;
}

export interface ProphetForecast {
  symbol: string;
  asOf: string;
  horizonDays: number;
  history: ProphetPoint[];
  forecast: ProphetForecastPoint[];
  direction: "up" | "down" | "flat" | string;
  expectedReturnPct: number;
}

export interface GarchHistoryPoint {
  date: string;
  return: number;
  vol: number;
}

export interface GarchForecastPoint {
  date: string;
  meanReturn: number;
  vol: number;
  volAnnualized: number;
}

export interface GarchForecast {
  symbol?: string;
  asOf?: string;
  history: GarchHistoryPoint[];
  forecast: GarchForecastPoint[];
  currentVol: number;
  forecastVol: number;
}

export interface PatternEdge {
  winRate: number;
  meanReturnPct: number;
  n: number;
}

export interface PatternDetection {
  pattern: string;
  date: string;
  barClose: number;
  edge5d: PatternEdge;
}

export interface PatternForecast {
  symbol?: string;
  detections: PatternDetection[];
}

export type SubResult<T> = T | { error: string };

export interface ForecastBundle {
  symbol: string;
  prophet: SubResult<ProphetForecast>;
  garch: SubResult<GarchForecast>;
  patterns: SubResult<PatternForecast>;
}

export function isError<T>(v: SubResult<T> | undefined | null): v is { error: string } {
  return !!v && typeof v === "object" && "error" in (v as Record<string, unknown>);
}

export function getForecast(symbol: string) {
  return api<ForecastBundle>(`/api/forecast/${encodeURIComponent(symbol)}`);
}

export function getProphet(symbol: string, days = 7) {
  return api<ProphetForecast>(
    `/api/forecast/${encodeURIComponent(symbol)}/prophet?days=${days}`,
  );
}

export function getGarch(symbol: string, days = 5) {
  return api<GarchForecast>(
    `/api/forecast/${encodeURIComponent(symbol)}/garch?days=${days}`,
  );
}

export function getPatterns(symbol: string, lookback = 60) {
  return api<PatternForecast>(
    `/api/forecast/${encodeURIComponent(symbol)}/patterns?lookback=${lookback}`,
  );
}
