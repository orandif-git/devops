import { describe, expect, it } from "vitest";
import { makePeriod, normalizePeriod, parseDay, periodLabel, periodState, rangeOf } from "../planner/src/core/execPeriod";
import { normalizeSettings } from "../planner/src/core/settings";

const T = new Date("2026-10-28T10:00:00Z");
const d = (s: string) => parseDay(s);

describe("Executive Dashboard period", () => {
  it("counts the presets from today", () => {
    expect(rangeOf("thisQuarter", T)).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(rangeOf("nextQuarter", T)).toEqual({ from: "2027-01-01", to: "2027-03-31" });
    expect(rangeOf("thisYear", T)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(rangeOf("last12", T)).toEqual({ from: "2025-10-29", to: "2026-10-28" });
    expect(rangeOf("next6", T)).toEqual({ from: "2026-10-28", to: "2027-04-28" });
    expect(rangeOf("custom", T, { from: "2026-02-01", to: "2026-03-15" })).toEqual({ from: "2026-02-01", to: "2026-03-15" });
  });
  it("active: the start–go-live range overlaps the period; go-live only counts the go-live; created counts the created date", () => {
    const q4 = (basis: "active" | "golive" | "created" | "field") => makePeriod("thisQuarter", basis, false, T);
    expect(periodState(q4("active"), { start: d("2026-06-01"), goLive: d("2026-11-15") })).toBe("in");       // started earlier, lands inside
    expect(periodState(q4("active"), { start: d("2026-01-01"), goLive: d("2026-09-30") })).toBe("out");
    expect(periodState(q4("active"), { start: d("2026-12-31"), goLive: d("2027-03-01") })).toBe("in");      // starts on the last day
    expect(periodState(q4("active"), { goLive: d("2026-10-01") })).toBe("in");                              // only a go-live date: that day
    expect(periodState(q4("active"), {})).toBe("undated");
    expect(periodState(q4("golive"), { start: d("2026-06-01"), goLive: d("2027-01-10") })).toBe("out");
    expect(periodState(q4("golive"), { goLive: d("2026-12-31") })).toBe("in");
    expect(periodState(q4("golive"), { start: d("2026-11-01") })).toBe("undated");
    expect(periodState(q4("created"), { created: d("2026-10-02") })).toBe("in"); expect(periodState(q4("created"), {})).toBe("undated");
    expect(periodState(q4("field"), { field: d("2026-11-02") })).toBe("in");
  });
  it("names the period for the chip", () => {
    expect(periodLabel(makePeriod("thisQuarter", "active", false, T))).toBe("This quarter · active");
    expect(periodLabel(makePeriod("custom", "golive", false, T, { from: "2026-10-01", to: "2026-12-31" }))).toBe("1 Oct 2026 – 31 Dec 2026 · go-live");
    expect(periodLabel(makePeriod("thisYear", "field", false, T), "Business date")).toBe("This year · Business date");
  });
  it("reads a stored period: relative ones are counted from today again, nonsense gives none", () => {
    const old = { preset: "thisQuarter", basis: "golive", undated: true, from: "2020-01-01", to: "2020-03-31" };
    expect(normalizePeriod(old, T)).toEqual({ preset: "thisQuarter", basis: "golive", undated: true, from: "2026-10-01", to: "2026-12-31" });
    expect(normalizePeriod({ preset: "custom", from: "2026-03-01", to: "2026-02-01" }, T)).toBeUndefined();
    expect(normalizePeriod({ preset: "custom", from: "2026-02-01", to: "2026-03-01", basis: "weird" }, T)).toMatchObject({ basis: "active", from: "2026-02-01" });
    expect(normalizePeriod("x", T)).toBeUndefined(); expect(normalizePeriod({ preset: "nope" }, T)).toBeUndefined();
  });
  it("has settings for the default comparison, an own date field and a default period", () => {
    const s = normalizeSettings({ executive: { periodBasis: "golive", periodField: "Custom.BizDate", periodDefault: "thisYear" } });
    expect(s.executive).toMatchObject({ periodBasis: "golive", periodField: "Custom.BizDate", periodDefault: "thisYear" });
    expect(normalizeSettings({ executive: { periodBasis: "x", periodDefault: "y" } }).executive).toMatchObject({ periodBasis: "active", periodDefault: "" });
  });
});
