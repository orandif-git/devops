import { describe, expect, it } from "vitest";
import { calendarFromTeams, dayCounter, workingDiff } from "../planner/src/core/workdays";
import { buildProgress, defaultProgress, normProgress } from "../src/core/progress";
import { evenStages } from "../planner/src/core/stages";

const D = (s: string) => Date.parse(s + "T00:00:00Z");
const qatar = { working: [0, 1, 2, 3, 4], off: [{ start: "2026-11-10", end: "2026-11-10" }] };

describe("working days", () => {
  it("counts from the start up to, not including, the end", () => {
    const f = workingDiff({ working: [1, 2, 3, 4, 5], off: [] });
    expect(f(D("2026-11-02"), D("2026-11-09"))).toBe(5);      // Mon to next Mon
    expect(f(D("2026-11-02"), D("2026-11-02"))).toBe(0);
    expect(f(D("2026-11-09"), D("2026-11-02"))).toBe(-5);
  });
  it("uses the team week (Fri/Sat weekend) and the days off", () => {
    const f = workingDiff(qatar);
    expect(f(D("2026-11-08"), D("2026-11-15"))).toBe(4);       // Sun..Sat: 5 working minus the day off
  });
  it("falls back to calendar days without a calendar", () => {
    const c = dayCounter("working", undefined);
    expect(c.working).toBe(false); expect(c.text(7)).toBe("7 days"); expect(c.short).toBe("d");
    expect(dayCounter("working", qatar).text(5)).toBe("5 working days");
  });
  it("reads the calendar of Azure DevOps teams", () => {
    expect(calendarFromTeams([{ workingDays: [0, 1], iterations: [{ teamDaysOff: [{ start: "2026-01-01", end: "2026-01-02" }] }] }])).toEqual({ working: [0, 1], off: [{ start: "2026-01-01", end: "2026-01-02" }] });
    expect(calendarFromTeams([])).toBeUndefined();
  });
});

describe("Delivery progress with working days", () => {
  const names = ["Development", "SIT", "UAT", "Deployment", "Live"];
  const dates = { enabled: true, fallback: true, consistency: true, track: true, late: true, lateDays: 7, delivered: "", stages: {
    Development: { startMode: "field", start: "S.Dev", endMode: "next" }, SIT: { startMode: "field", start: "S.SIT", endMode: "next" }, UAT: { startMode: "field", start: "S.UAT", endMode: "next" },
    Deployment: { startMode: "field", start: "S.Dep", endMode: "next" }, Live: { startMode: "field", start: "S.Live", endMode: "none" } } };
  const mk = (o: Record<string, unknown> = {}) => normProgress({ enabled: true, workItemType: "Epic", goLiveField: "G", stages: { source: "field", field: "DS", stages: evenStages(names), map: Object.fromEntries(names.map(n => [n, n])), dates }, ...o });
  const fields = { "System.WorkItemType": "Epic", "System.State": "Active", DS: "Development", "S.Dev": "2026-10-27", "S.SIT": "2026-12-02", G: "2026-11-16" };
  const today = Date.UTC(2026, 10, 2);   // Monday 2 Nov
  const cal = { working: [1, 2, 3, 4, 5], off: [] };
  it("shows calendar days by default and working days when switched", () => {
    const a = buildProgress({ settings: mk(), fields, today, calendar: cal }), b = buildProgress({ settings: mk({ dayCount: "working" }), fields, today, calendar: cal }), c = buildProgress({ settings: mk({ dayCount: "working" }), fields, today });
    if (a.kind !== "shown" || b.kind !== "shown" || c.kind !== "shown") throw new Error("hidden");
    expect(a.finish).toContain("14 days left");
    expect(b.finish).toContain("10 working days left");
    expect(c.finish).toContain("14 days left");   // no calendar: calendar days
  });
  it("keeps the default and cleans the value", () => { expect(defaultProgress().dayCount).toBe("calendar"); expect(normProgress({ dayCount: "working" }).dayCount).toBe("working"); expect(normProgress({ dayCount: "x" }).dayCount).toBe("calendar"); });
});

import { buildExec } from "../planner/src/core/executive";
import { defaultSettings } from "../planner/src/core/types";
describe("Executive Dashboard day counts", () => {
  it("counts the slip in working days and says so on the row", () => {
    const mk = (dayCount: "calendar" | "working") => {
      const s = defaultSettings(); s.executive = { ...s.executive, enabled: true, goLiveField: "G", dayCount, doneStates: ["Done"], notStartedStates: ["New"], holdStates: [], ignoreStates: [] };
      const epic = { id: 1, title: "E", state: "Active", areaPath: "P\\A", start: "2026-10-05", changed: "2026-10-01", extra: { G: "2026-11-16" } } as never;
      const avail = { records: [], report: [], hours: () => null, team: () => "", calendar: { working: [1, 2, 3, 4, 5], off: [] } } as never;
      return buildExec({ epics: [epic], gridDone: {}, bookings: [], avail, settings: s, today: new Date(2026, 10, 2) }).rows[0];
    };
    expect(mk("calendar").unit).toBe("d"); expect(mk("working").unit).toBe("wd");
    expect(mk("working").reasons.join(" ")).not.toMatch(/\d+ days/);
  });
});
