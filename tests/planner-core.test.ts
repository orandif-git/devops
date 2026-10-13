import { describe, expect, it } from "vitest";
import { parseSource, spreadEffort, sumStats } from "../planner/src/core/parseGrid";
import { aggregate, bandOf, utilization } from "../planner/src/core/aggregate";
import { monthsOfPeriod } from "../planner/src/core/period";
import { buildWiql } from "../planner/src/core/wiql";
import { detectColumns } from "../planner/src/core/detect";
import { chunk, idsToFetch, mergeEpics, sinceDay } from "../planner/src/core/sync";
import { normalizeSettings, validateSettings } from "../planner/src/core/settings";
import { EpicRecord, GridSource } from "../planner/src/core/types";
import { newRow, recomputeAll, serialize } from "../src/core/gridModel";
import { defaultCalendar, registerCalendarBook, setCalendarBook } from "../src/core/schedule";
import { GridConfig } from "../src/core/types";

const src: GridSource = { id: "ts", name: "SDLC Timesheet", dataField: "Custom.Grid", columns: { resource: "res", start: "start", end: "end", effort: "effort", status: "status" }, excludedStatuses: [] };
const wrap = (rows: unknown[]) => JSON.stringify({ version: 1, rows });

describe("reading a grid", () => {
  it("takes the monthly hours the grid stored, per person", () => {
    const { bookings, stats } = parseSource(wrap([{ res: "Maya R. <CBQ\\mrao>", _months: { "2026-10": 40, "2026-11": 20.5 } }, { res: "Omar K. <okhan>", _months: { "2026-10": 8 } }]), src, 7);
    expect(bookings.map(b => [b.person, b.month, b.hours])).toEqual([["mrao", "2026-10", 40], ["mrao", "2026-11", 20.5], ["okhan", "2026-10", 8]]);
    expect(stats).toMatchObject({ rows: 2, counted: 2, unscheduled: 0 });
  });
  it("leaves out rows in an excluded status (optional) and rows without a person or with a failed schedule", () => {
    const s = { ...src, excludedStatuses: ["Rejected"] };
    const { bookings, stats } = parseSource(wrap([
      { res: "A <a>", status: "Rejected", _months: { "2026-10": 10 } }, { res: "B <b>", status: "Approved", _months: { "2026-10": 5 } },
      { res: "", _months: { "2026-10": 9 } }, { res: "C <c>", _schedErr: "No calendar", _months: { "2026-10": 9 } }]), s, 1);
    expect(bookings.map(b => b.person)).toEqual(["b"]);
    expect(stats).toMatchObject({ excluded: 1, noPerson: 1, errored: 1, counted: 1 });
    expect(parseSource(wrap([{ res: "A <a>", status: "Rejected", _months: { "2026-10": 10 } }]), src, 1).bookings).toHaveLength(1);       // nothing excluded by default
  });
  it("estimates unscheduled rows from start, end and effort (flagged) or reports them", () => {
    const row = { res: "A <a>", start: "2026-10-26", end: "2026-11-06", effort: 80 };
    const est = parseSource(wrap([row]), src, 1, true);
    expect(est.stats.estimated).toBe(1);
    expect(est.bookings.reduce((a, b) => a + b.hours, 0)).toBeCloseTo(80, 1);
    expect(est.bookings.every(b => b.estimated)).toBe(true);
    const off = parseSource(wrap([row]), src, 1, false);
    expect(off.bookings).toEqual([]); expect(off.stats.unscheduled).toBe(1);
    expect(spreadEffort("2026-10-26", "2026-10-26", 8)).toEqual({ "2026-10": 8 });
  });
  it("copes with rich-text wrappers, a bare array, empty and broken text", () => {
    expect(parseSource("<div>" + wrap([{ res: "A <a>", _months: { "2026-10": 1 } }]) + "</div>", src, 1).bookings).toHaveLength(1);
    expect(parseSource(JSON.stringify([{ res: "A <a>", _months: { "2026-10": 1 } }]), src, 1).bookings).toHaveLength(1);
    expect(parseSource("", src, 1).bookings).toEqual([]);
    expect(parseSource("not json at all", src, 1).stats.unreadable).toBe(true);
    expect(sumStats([parseSource(wrap([{ res: "A <a>", _months: { "2026-10": 1 } }]), src, 1).stats, parseSource(wrap([{ res: "" }]), src, 1).stats]).rows).toBe(2);
  });
});

describe("contract with the Grid & Rules grid", () => {
  it("reads what the current grid stores for a row scheduled by dates", () => {
    const cfg: GridConfig = { columns: [
      { id: "res", name: "Resource", type: "identity" }, { id: "start", name: "Start", type: "date" }, { id: "effort", name: "Effort", type: "number" },
      { id: "alloc", name: "Allocation", type: "number", defaultValue: 100 }, { id: "end", name: "End", type: "date" },
    ], schedule: { resource: "res", start: "start", effort: "effort", allocation: "alloc", end: "end" } };
    setCalendarBook(registerCalendarBook([{ key: "mrao", name: "Maya R. <mrao>", defaultHours: 160, overrides: {} }], defaultCalendar()));
    try {
      const rows = recomputeAll([{ ...newRow(cfg), res: "Maya R. <mrao>", start: "2026-10-26", effort: 80, alloc: 100 }], cfg);
      const text = serialize(rows);
      const { bookings, stats } = parseSource(text, { ...src, columns: { resource: "res", start: "start", end: "end", effort: "effort" } }, 1);
      expect(stats.counted).toBe(1);
      expect(bookings.reduce((a, b) => a + b.hours, 0)).toBeCloseTo(80, 2);
      expect(bookings.map(b => b.month)).toEqual(["2026-10", "2026-11"]);
      expect(bookings[0].person).toBe("mrao");
    } finally { setCalendarBook(undefined); }
  });
});

describe("hours, bands and periods", () => {
  it("adds hours per person and month and remembers which Epics they come from", () => {
    const b = [{ epicId: 1, sourceId: "a", person: "x", personName: "X", month: "2026-10", hours: 10 }, { epicId: 2, sourceId: "a", person: "x", personName: "X <x@c>", month: "2026-10", hours: 30 }, { epicId: 2, sourceId: "b", person: "x", personName: "X", month: "2026-11", hours: 5 }];
    const p = aggregate(b, ["2026-10"]).get("x")!;
    expect(p.months["2026-10"]).toEqual({ hours: 40, epics: { 1: 10, 2: 30 } });
    expect(p.months["2026-11"]).toBeUndefined();
    expect(p.name).toBe("X <x@c>");
  });
  it("bands follow the thresholds and over-booking without capacity is not hidden", () => {
    const t = { spare: 50, healthy: 85, full: 100 };
    expect(["spare", "healthy", "full", "over", "none"]).toEqual([bandOf(.3, t), bandOf(.85, t), bandOf(.95, t), bandOf(1.01, t), bandOf(null, t)]);
    expect(utilization(40, 160)).toBe(.25); expect(utilization(10, 0)).toBe(Infinity); expect(utilization(0, null)).toBeNull();
    expect(bandOf(utilization(10, 0), t)).toBe("over");
  });
  it("periods give the months", () => {
    const today = new Date("2026-10-13T00:00:00Z");
    expect(monthsOfPeriod({ kind: "year" }, today)).toHaveLength(12);
    expect(monthsOfPeriod({ kind: "quarter" }, today)).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(monthsOfPeriod({ kind: "last12" }, today)[0]).toBe("2025-11");
    expect(monthsOfPeriod({ kind: "next12" }, today)[11]).toBe("2027-09");
    expect(monthsOfPeriod({ kind: "custom", from: "2026-03", to: "2026-05" }, today)).toEqual(["2026-03", "2026-04", "2026-05"]);
  });
});

describe("queries and syncing", () => {
  it("escapes values, validates field names and builds the overlap and incremental clauses", () => {
    const w = buildWiql({ workItemType: "Epic", states: ["Active", "O'Brien"], areaPaths: ["Proj\\Team A"], fields: [{ field: "Custom.BU", values: ["NFR"] }], overlap: { startField: "Custom.Start", targetField: "Custom.Target", from: "2026-01-01", to: "2026-12-31" }, changedSince: "2026-10-12" });
    expect(w).toContain("[System.State] IN ('Active', 'O''Brien')");
    expect(w).toContain("[System.AreaPath] UNDER 'Proj\\Team A'");
    expect(w).toContain("[Custom.Start] = '' OR [Custom.Start] <= '2026-12-31'");
    expect(w).toContain("[System.ChangedDate] >= '2026-10-12'");
    expect(() => buildWiql({ workItemType: "Epic", fields: [{ field: "x] OR [1", values: ["a"] }] })).toThrow();
    expect(() => buildWiql({ workItemType: "Epic'; DROP" })).toThrow();
  });
  it("reads only new and changed Epics, drops removed ones and keeps the rest", () => {
    const e = (id: number, title: string): EpicRecord => ({ id, title, state: "Active", type: "Epic", areaPath: "", iterationPath: "", changed: "", grids: {}, extra: {} });
    const cached = [e(1, "old1"), e(2, "old2"), e(3, "gone")];
    expect(idsToFetch([1, 2, 4], cached, [2])).toEqual([2, 4]);
    expect(mergeEpics(cached, [e(2, "new2"), e(4, "new4")], [1, 2, 4]).map(x => x.title)).toEqual(["old1", "new2", "new4"]);
    expect(sinceDay("2026-10-13T08:00:00Z")).toBe("2026-10-12");
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe("settings and detection", () => {
  it("fills in defaults and reports what is missing", () => {
    const s = normalizeSettings({ sources: [{ name: "SDLC Timesheet", dataField: "Custom.Grid", columns: { resource: "res" }, excludedStatuses: ["Rejected", ""] }] });
    expect(s.workItemType).toBe("Epic"); expect(s.thresholds).toEqual({ spare: 50, healthy: 85, full: 100 }); expect(s.sources[0].excludedStatuses).toEqual(["Rejected"]);
    expect(validateSettings(s)).toEqual(["Excluded statuses need the status column."].map(m => `SDLC Timesheet: ${m[0].toLowerCase() + m.slice(1)}`));
    expect(validateSettings(normalizeSettings({}))[0]).toMatch(/at least one grid/);
    expect(validateSettings({ ...normalizeSettings({ sources: [{ name: "A", dataField: "bad field", columns: { resource: "r" } }] }), thresholds: { spare: 90, healthy: 80, full: 100 } }).join("|")).toMatch(/not a field reference name[\s\S]*Thresholds must increase/);
  });
  it("lists the columns of a sample Epic with what their values look like", () => {
    const r = detectColumns(wrap([{ res: "Maya R. <mrao>", start: "2026-10-01", effort: 40, task: "Design", _months: { "2026-10": 40 } }, { res: "Omar <o>", start: "2026-10-05", effort: "16", task: "Build" }])) as { columns: { key: string; kind: string }[]; scheduled: number };
    expect(Object.fromEntries(r.columns.map(c => [c.key, c.kind]))).toEqual({ res: "person", start: "date", effort: "number", task: "text" });
    expect(r.scheduled).toBe(1);
    expect("error" in (detectColumns("nope") as object)).toBe(true);
  });
});

describe("performance", () => {
  it("reads and adds up 800 Epics of 30 rows well within the budget", () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ res: `Person ${i % 150} <p${i % 150}>`, start: "2026-01-05", end: "2026-12-18", effort: 100, _months: Object.fromEntries(Array.from({ length: 12 }, (_, m) => [`2026-${String(m + 1).padStart(2, "0")}`, 8])) }));
    const text = wrap(rows);
    const t0 = Date.now();
    const all = [];
    for (let e = 0; e < 800; e++) all.push(...parseSource(text, src, e).bookings);
    const people = aggregate(all);
    const ms = Date.now() - t0;
    expect(all.length).toBe(800 * 30 * 12);
    expect(people.size).toBe(30);                                    // 30 distinct names in this synthetic set
    expect(ms).toBeLessThan(4000);
  });
});

import { httpError } from "../planner/src/core/httpError";
describe("error messages", () => {
  it("shows what Azure DevOps says is wrong, not just the status", () => {
    expect(httpError(400, "wit/workitemsbatch", JSON.stringify({ message: "TF51535: Cannot find field Custom.startdate." }))).toBe("HTTP 400 for wit/workitemsbatch: TF51535: Cannot find field Custom.startdate.");
    expect(httpError(403, "wit/wiql", "<html>forbidden</html>")).toBe("HTTP 403 for wit/wiql");
  });
});

import { autoMap } from "../planner/src/core/detect";
import { isDateType, isLongTextType } from "../planner/src/core/fieldTypes";
describe("automatic column mapping", () => {
  const rows = [
    { sdlcactivity: "Design", resource: "Maya R. <mrao>", startdate: "2026-10-01", enddate: "2026-10-30", Hours: 40, allocation: 50, reviewstatus: "Approved", _months: { "2026-10": 40 } },
    { sdlcactivity: "Build", resource: "Omar K. <okhan>", startdate: "2026-10-05", enddate: "2026-11-15", Hours: 80, allocation: 100, reviewstatus: "Rejected" },
  ];
  const guess = () => (detectColumns(JSON.stringify({ version: 1, rows })) as { columns: Parameters<typeof autoMap>[0] }).columns;
  it("picks person, dates, effort, allocation, status and task from the values and the ids", () => {
    expect(autoMap(guess())).toEqual({ resource: "resource", start: "startdate", end: "enddate", allocation: "allocation", effort: "Hours", status: "reviewstatus", task: "sdlcactivity" });
  });
  it("lists the status values so they can be ticked", () => {
    const status = guess().find(c => c.key === "reviewstatus")!;
    expect(status.values.sort()).toEqual(["Approved", "Rejected"]);
  });
  it("leaves a slot empty when nothing fits, and never uses a column twice", () => {
    const m = autoMap((detectColumns(JSON.stringify([{ c1: "x", c2: 5 }])) as { columns: Parameters<typeof autoMap>[0] }).columns);
    expect(m.resource).toBeUndefined();
    expect(new Set(Object.values(m)).size).toBe(Object.values(m).length);
    expect(m.effort).toBe("c2");
  });
  it("classifies field types", () => {
    expect([isDateType("dateTime"), isDateType("string"), isLongTextType("plainText"), isLongTextType("html"), isLongTextType("string")]).toEqual([true, false, true, true, false]);
  });
});
