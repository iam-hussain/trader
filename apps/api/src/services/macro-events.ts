/**
 * Macro event blackout calendar.
 *
 * Phase 3 ships with a hardcoded fallback calendar of high-impact US macro
 * releases (FOMC, CPI, PCE, NFP). A scraper-backed calendar is planned for
 * Phase 3-stretch — until then, the times below are used to enforce the
 * `blackoutMacroEvents` risk rule.
 *
 * Times are stored in UTC. Conventions:
 *   FOMC statement: Wed 14:00 ET (19:00 UTC during EDT, 19:00 UTC during EST
 *     after DST normalization isn't critical at ±30 min granularity).
 *   CPI:  ~mid-month, 08:30 ET → 12:30 UTC (EDT) / 13:30 UTC (EST).
 *   PCE:  last Friday, 08:30 ET.
 *   NFP:  first Friday, 08:30 ET.
 *
 * A small drift from real schedules is acceptable since the blackout window
 * is ±30min by default — wider than any DST/scheduling jitter.
 */

export interface MacroEvent {
  kind: "FOMC" | "CPI" | "PCE" | "NFP";
  whenUtc: Date;
  description: string;
}

/** Build a Date from a UTC ISO string for readability. */
const u = (iso: string): Date => new Date(iso);

export const MACRO_CALENDAR: readonly MacroEvent[] = [
  // 2024 FOMC (8 meetings)
  { kind: "FOMC", whenUtc: u("2024-01-31T19:00:00Z"), description: "FOMC statement" },
  { kind: "FOMC", whenUtc: u("2024-03-20T18:00:00Z"), description: "FOMC + SEP" },
  { kind: "FOMC", whenUtc: u("2024-05-01T18:00:00Z"), description: "FOMC statement" },
  { kind: "FOMC", whenUtc: u("2024-06-12T18:00:00Z"), description: "FOMC + SEP" },
  { kind: "FOMC", whenUtc: u("2024-07-31T18:00:00Z"), description: "FOMC statement" },
  { kind: "FOMC", whenUtc: u("2024-09-18T18:00:00Z"), description: "FOMC + SEP" },
  { kind: "FOMC", whenUtc: u("2024-11-07T19:00:00Z"), description: "FOMC statement" },
  { kind: "FOMC", whenUtc: u("2024-12-18T19:00:00Z"), description: "FOMC + SEP" },
  // 2024 CPI
  { kind: "CPI", whenUtc: u("2024-01-11T13:30:00Z"), description: "CPI Dec 2023" },
  { kind: "CPI", whenUtc: u("2024-02-13T13:30:00Z"), description: "CPI Jan 2024" },
  { kind: "CPI", whenUtc: u("2024-03-12T12:30:00Z"), description: "CPI Feb 2024" },
  { kind: "CPI", whenUtc: u("2024-04-10T12:30:00Z"), description: "CPI Mar 2024" },
  { kind: "CPI", whenUtc: u("2024-05-15T12:30:00Z"), description: "CPI Apr 2024" },
  { kind: "CPI", whenUtc: u("2024-06-12T12:30:00Z"), description: "CPI May 2024" },
  { kind: "CPI", whenUtc: u("2024-07-11T12:30:00Z"), description: "CPI Jun 2024" },
  { kind: "CPI", whenUtc: u("2024-08-14T12:30:00Z"), description: "CPI Jul 2024" },
  { kind: "CPI", whenUtc: u("2024-09-11T12:30:00Z"), description: "CPI Aug 2024" },
  { kind: "CPI", whenUtc: u("2024-10-10T12:30:00Z"), description: "CPI Sep 2024" },
  { kind: "CPI", whenUtc: u("2024-11-13T13:30:00Z"), description: "CPI Oct 2024" },
  { kind: "CPI", whenUtc: u("2024-12-11T13:30:00Z"), description: "CPI Nov 2024" },
  // 2024 NFP (first Friday)
  { kind: "NFP", whenUtc: u("2024-01-05T13:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "NFP", whenUtc: u("2024-02-02T13:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "NFP", whenUtc: u("2024-03-08T13:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "NFP", whenUtc: u("2024-04-05T12:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "NFP", whenUtc: u("2024-05-03T12:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "NFP", whenUtc: u("2024-06-07T12:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "NFP", whenUtc: u("2024-07-05T12:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "NFP", whenUtc: u("2024-08-02T12:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "NFP", whenUtc: u("2024-09-06T12:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "NFP", whenUtc: u("2024-10-04T12:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "NFP", whenUtc: u("2024-11-01T12:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "NFP", whenUtc: u("2024-12-06T13:30:00Z"), description: "Nonfarm Payrolls" },
  // 2024 PCE (last Friday)
  { kind: "PCE", whenUtc: u("2024-01-26T13:30:00Z"), description: "Core PCE" },
  { kind: "PCE", whenUtc: u("2024-02-29T13:30:00Z"), description: "Core PCE" },
  { kind: "PCE", whenUtc: u("2024-03-29T12:30:00Z"), description: "Core PCE" },
  { kind: "PCE", whenUtc: u("2024-04-26T12:30:00Z"), description: "Core PCE" },
  { kind: "PCE", whenUtc: u("2024-05-31T12:30:00Z"), description: "Core PCE" },
  { kind: "PCE", whenUtc: u("2024-06-28T12:30:00Z"), description: "Core PCE" },
  { kind: "PCE", whenUtc: u("2024-07-26T12:30:00Z"), description: "Core PCE" },
  { kind: "PCE", whenUtc: u("2024-08-30T12:30:00Z"), description: "Core PCE" },
  { kind: "PCE", whenUtc: u("2024-09-27T12:30:00Z"), description: "Core PCE" },
  { kind: "PCE", whenUtc: u("2024-10-31T12:30:00Z"), description: "Core PCE" },
  { kind: "PCE", whenUtc: u("2024-11-27T13:30:00Z"), description: "Core PCE" },
  { kind: "PCE", whenUtc: u("2024-12-20T13:30:00Z"), description: "Core PCE" },
  // 2025 FOMC
  { kind: "FOMC", whenUtc: u("2025-01-29T19:00:00Z"), description: "FOMC statement" },
  { kind: "FOMC", whenUtc: u("2025-03-19T18:00:00Z"), description: "FOMC + SEP" },
  { kind: "FOMC", whenUtc: u("2025-05-07T18:00:00Z"), description: "FOMC statement" },
  { kind: "FOMC", whenUtc: u("2025-06-18T18:00:00Z"), description: "FOMC + SEP" },
  { kind: "FOMC", whenUtc: u("2025-07-30T18:00:00Z"), description: "FOMC statement" },
  { kind: "FOMC", whenUtc: u("2025-09-17T18:00:00Z"), description: "FOMC + SEP" },
  { kind: "FOMC", whenUtc: u("2025-10-29T18:00:00Z"), description: "FOMC statement" },
  { kind: "FOMC", whenUtc: u("2025-12-10T19:00:00Z"), description: "FOMC + SEP" },
  // 2025 CPI / NFP / PCE (representative months)
  { kind: "CPI", whenUtc: u("2025-01-15T13:30:00Z"), description: "CPI Dec 2024" },
  { kind: "CPI", whenUtc: u("2025-02-12T13:30:00Z"), description: "CPI Jan 2025" },
  { kind: "CPI", whenUtc: u("2025-03-12T12:30:00Z"), description: "CPI Feb 2025" },
  { kind: "CPI", whenUtc: u("2025-04-10T12:30:00Z"), description: "CPI Mar 2025" },
  { kind: "CPI", whenUtc: u("2025-05-13T12:30:00Z"), description: "CPI Apr 2025" },
  { kind: "CPI", whenUtc: u("2025-06-11T12:30:00Z"), description: "CPI May 2025" },
  { kind: "CPI", whenUtc: u("2025-07-15T12:30:00Z"), description: "CPI Jun 2025" },
  { kind: "CPI", whenUtc: u("2025-08-12T12:30:00Z"), description: "CPI Jul 2025" },
  { kind: "CPI", whenUtc: u("2025-09-11T12:30:00Z"), description: "CPI Aug 2025" },
  { kind: "CPI", whenUtc: u("2025-10-15T12:30:00Z"), description: "CPI Sep 2025" },
  { kind: "CPI", whenUtc: u("2025-11-13T13:30:00Z"), description: "CPI Oct 2025" },
  { kind: "CPI", whenUtc: u("2025-12-10T13:30:00Z"), description: "CPI Nov 2025" },
  { kind: "NFP", whenUtc: u("2025-01-10T13:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "NFP", whenUtc: u("2025-02-07T13:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "NFP", whenUtc: u("2025-03-07T13:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "NFP", whenUtc: u("2025-04-04T12:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "NFP", whenUtc: u("2025-05-02T12:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "NFP", whenUtc: u("2025-06-06T12:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "NFP", whenUtc: u("2025-07-03T12:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "NFP", whenUtc: u("2025-08-01T12:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "NFP", whenUtc: u("2025-09-05T12:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "NFP", whenUtc: u("2025-10-03T12:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "NFP", whenUtc: u("2025-11-07T13:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "NFP", whenUtc: u("2025-12-05T13:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "PCE", whenUtc: u("2025-01-31T13:30:00Z"), description: "Core PCE" },
  { kind: "PCE", whenUtc: u("2025-02-28T13:30:00Z"), description: "Core PCE" },
  { kind: "PCE", whenUtc: u("2025-03-28T12:30:00Z"), description: "Core PCE" },
  { kind: "PCE", whenUtc: u("2025-04-30T12:30:00Z"), description: "Core PCE" },
  { kind: "PCE", whenUtc: u("2025-05-30T12:30:00Z"), description: "Core PCE" },
  { kind: "PCE", whenUtc: u("2025-06-27T12:30:00Z"), description: "Core PCE" },
  { kind: "PCE", whenUtc: u("2025-07-31T12:30:00Z"), description: "Core PCE" },
  { kind: "PCE", whenUtc: u("2025-08-29T12:30:00Z"), description: "Core PCE" },
  { kind: "PCE", whenUtc: u("2025-09-26T12:30:00Z"), description: "Core PCE" },
  { kind: "PCE", whenUtc: u("2025-10-31T12:30:00Z"), description: "Core PCE" },
  { kind: "PCE", whenUtc: u("2025-11-26T13:30:00Z"), description: "Core PCE" },
  { kind: "PCE", whenUtc: u("2025-12-19T13:30:00Z"), description: "Core PCE" },
  // 2026 FOMC (plausible Wed schedule)
  { kind: "FOMC", whenUtc: u("2026-01-28T19:00:00Z"), description: "FOMC statement" },
  { kind: "FOMC", whenUtc: u("2026-03-18T18:00:00Z"), description: "FOMC + SEP" },
  { kind: "FOMC", whenUtc: u("2026-04-29T18:00:00Z"), description: "FOMC statement" },
  { kind: "FOMC", whenUtc: u("2026-06-17T18:00:00Z"), description: "FOMC + SEP" },
  { kind: "FOMC", whenUtc: u("2026-07-29T18:00:00Z"), description: "FOMC statement" },
  { kind: "FOMC", whenUtc: u("2026-09-16T18:00:00Z"), description: "FOMC + SEP" },
  { kind: "FOMC", whenUtc: u("2026-10-28T18:00:00Z"), description: "FOMC statement" },
  { kind: "FOMC", whenUtc: u("2026-12-09T19:00:00Z"), description: "FOMC + SEP" },
  // 2026 CPI / NFP / PCE
  { kind: "CPI", whenUtc: u("2026-01-14T13:30:00Z"), description: "CPI Dec 2025" },
  { kind: "CPI", whenUtc: u("2026-02-11T13:30:00Z"), description: "CPI Jan 2026" },
  { kind: "CPI", whenUtc: u("2026-03-11T12:30:00Z"), description: "CPI Feb 2026" },
  { kind: "CPI", whenUtc: u("2026-04-14T12:30:00Z"), description: "CPI Mar 2026" },
  { kind: "CPI", whenUtc: u("2026-05-13T12:30:00Z"), description: "CPI Apr 2026" },
  { kind: "CPI", whenUtc: u("2026-06-10T12:30:00Z"), description: "CPI May 2026" },
  { kind: "CPI", whenUtc: u("2026-07-15T12:30:00Z"), description: "CPI Jun 2026" },
  { kind: "CPI", whenUtc: u("2026-08-12T12:30:00Z"), description: "CPI Jul 2026" },
  { kind: "CPI", whenUtc: u("2026-09-10T12:30:00Z"), description: "CPI Aug 2026" },
  { kind: "CPI", whenUtc: u("2026-10-14T12:30:00Z"), description: "CPI Sep 2026" },
  { kind: "CPI", whenUtc: u("2026-11-12T13:30:00Z"), description: "CPI Oct 2026" },
  { kind: "CPI", whenUtc: u("2026-12-10T13:30:00Z"), description: "CPI Nov 2026" },
  { kind: "NFP", whenUtc: u("2026-01-02T13:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "NFP", whenUtc: u("2026-02-06T13:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "NFP", whenUtc: u("2026-03-06T13:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "NFP", whenUtc: u("2026-04-03T12:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "NFP", whenUtc: u("2026-05-01T12:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "NFP", whenUtc: u("2026-06-05T12:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "NFP", whenUtc: u("2026-07-02T12:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "NFP", whenUtc: u("2026-08-07T12:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "NFP", whenUtc: u("2026-09-04T12:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "NFP", whenUtc: u("2026-10-02T12:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "NFP", whenUtc: u("2026-11-06T13:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "NFP", whenUtc: u("2026-12-04T13:30:00Z"), description: "Nonfarm Payrolls" },
  { kind: "PCE", whenUtc: u("2026-01-30T13:30:00Z"), description: "Core PCE" },
  { kind: "PCE", whenUtc: u("2026-02-27T13:30:00Z"), description: "Core PCE" },
  { kind: "PCE", whenUtc: u("2026-03-27T12:30:00Z"), description: "Core PCE" },
  { kind: "PCE", whenUtc: u("2026-04-30T12:30:00Z"), description: "Core PCE" },
  { kind: "PCE", whenUtc: u("2026-05-29T12:30:00Z"), description: "Core PCE" },
  { kind: "PCE", whenUtc: u("2026-06-26T12:30:00Z"), description: "Core PCE" },
  { kind: "PCE", whenUtc: u("2026-07-31T12:30:00Z"), description: "Core PCE" },
  { kind: "PCE", whenUtc: u("2026-08-28T12:30:00Z"), description: "Core PCE" },
  { kind: "PCE", whenUtc: u("2026-09-25T12:30:00Z"), description: "Core PCE" },
  { kind: "PCE", whenUtc: u("2026-10-30T12:30:00Z"), description: "Core PCE" },
  { kind: "PCE", whenUtc: u("2026-11-25T13:30:00Z"), description: "Core PCE" },
  { kind: "PCE", whenUtc: u("2026-12-18T13:30:00Z"), description: "Core PCE" },
] as const;

const MS_PER_MIN = 60_000;
const HORIZON_DAYS = 14;

/** Events occurring in [now, now + 14 days), sorted ascending by whenUtc. */
export function getUpcomingMacroEvents(now: Date = new Date()): MacroEvent[] {
  const start = now.getTime();
  const end = start + HORIZON_DAYS * 24 * 60 * MS_PER_MIN;
  return MACRO_CALENDAR.filter((e) => {
    const t = e.whenUtc.getTime();
    return t >= start && t < end;
  })
    .slice()
    .sort((a, b) => a.whenUtc.getTime() - b.whenUtc.getTime());
}

export interface BlackoutResult {
  inBlackout: boolean;
  event?: MacroEvent;
  minutesUntil?: number;
}

/** True iff `now` is within ±blackoutMinutes of any event in `events`. */
export function isInBlackout(
  now: Date,
  blackoutMinutes: number,
  events: readonly MacroEvent[] = MACRO_CALENDAR
): BlackoutResult {
  const nowMs = now.getTime();
  const windowMs = blackoutMinutes * MS_PER_MIN;
  let best: { event: MacroEvent; absDeltaMs: number; signedMinutes: number } | undefined;
  for (const e of events) {
    const deltaMs = e.whenUtc.getTime() - nowMs;
    const absDelta = Math.abs(deltaMs);
    if (absDelta <= windowMs) {
      if (!best || absDelta < best.absDeltaMs) {
        best = { event: e, absDeltaMs: absDelta, signedMinutes: Math.round(deltaMs / MS_PER_MIN) };
      }
    }
  }
  if (!best) return { inBlackout: false };
  return { inBlackout: true, event: best.event, minutesUntil: best.signedMinutes };
}
