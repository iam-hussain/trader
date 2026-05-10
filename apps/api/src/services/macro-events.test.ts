import { describe, it, expect } from "vitest";
import {
  MACRO_CALENDAR,
  getUpcomingMacroEvents,
  isInBlackout,
  type MacroEvent,
} from "./macro-events.js";

describe("isInBlackout", () => {
  const events: MacroEvent[] = [
    { kind: "FOMC", whenUtc: new Date("2025-06-18T18:00:00Z"), description: "FOMC + SEP" },
    { kind: "CPI", whenUtc: new Date("2025-06-11T12:30:00Z"), description: "CPI" },
  ];

  it("returns true within ±30 minutes of an event", () => {
    const now = new Date("2025-06-18T18:15:00Z"); // 15 min after FOMC
    const r = isInBlackout(now, 30, events);
    expect(r.inBlackout).toBe(true);
    expect(r.event?.kind).toBe("FOMC");
    expect(r.minutesUntil).toBe(-15);
  });

  it("returns true 25 min before an event", () => {
    const now = new Date("2025-06-18T17:35:00Z");
    const r = isInBlackout(now, 30, events);
    expect(r.inBlackout).toBe(true);
    expect(r.minutesUntil).toBe(25);
  });

  it("returns false 31 min away from any event", () => {
    const now = new Date("2025-06-18T17:29:00Z"); // 31 min before
    const r = isInBlackout(now, 30, events);
    expect(r.inBlackout).toBe(false);
  });

  it("returns false on a quiet day", () => {
    const now = new Date("2025-06-15T16:00:00Z");
    const r = isInBlackout(now, 30, events);
    expect(r.inBlackout).toBe(false);
  });

  it("picks the closest event when multiple are in window", () => {
    const overlap: MacroEvent[] = [
      { kind: "CPI", whenUtc: new Date("2025-06-18T17:50:00Z"), description: "phantom CPI" },
      { kind: "FOMC", whenUtc: new Date("2025-06-18T18:00:00Z"), description: "FOMC" },
    ];
    const now = new Date("2025-06-18T17:58:00Z");
    const r = isInBlackout(now, 30, overlap);
    expect(r.inBlackout).toBe(true);
    expect(r.event?.kind).toBe("FOMC"); // 2 min away beats 8 min away
  });
});

describe("getUpcomingMacroEvents", () => {
  it("returns events sorted ascending", () => {
    const now = new Date("2025-05-01T00:00:00Z");
    const events = getUpcomingMacroEvents(now);
    expect(events.length).toBeGreaterThan(0);
    for (let i = 1; i < events.length; i++) {
      expect(events[i]!.whenUtc.getTime()).toBeGreaterThanOrEqual(
        events[i - 1]!.whenUtc.getTime()
      );
    }
  });

  it("only includes events within the next 14 days", () => {
    const now = new Date("2025-05-01T00:00:00Z");
    const horizon = now.getTime() + 14 * 24 * 60 * 60 * 1000;
    const events = getUpcomingMacroEvents(now);
    for (const e of events) {
      expect(e.whenUtc.getTime()).toBeGreaterThanOrEqual(now.getTime());
      expect(e.whenUtc.getTime()).toBeLessThan(horizon);
    }
  });

  it("excludes past events", () => {
    const now = new Date("2025-12-31T23:59:00Z");
    const events = getUpcomingMacroEvents(now);
    for (const e of events) {
      expect(e.whenUtc.getTime()).toBeGreaterThanOrEqual(now.getTime());
    }
  });

  it("MACRO_CALENDAR contains entries for 2024-2026", () => {
    const years = new Set(MACRO_CALENDAR.map((e) => e.whenUtc.getUTCFullYear()));
    expect(years.has(2024)).toBe(true);
    expect(years.has(2025)).toBe(true);
    expect(years.has(2026)).toBe(true);
  });
});
