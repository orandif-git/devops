import { describe, expect, it } from "vitest";
import { barOf, buildGantt, categoryOf, layoutTasks, pct, visibleRange, windowOf } from "../planner/src/core/timeline";
import { parseSource } from "../planner/src/core/parseGrid";
import { EpicRecord, GridSource, Task } from "../planner/src/core/types";

const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"];
const w = windowOf(months);
const epic = (id: number, state: string, start?: string, target?: string, area = "P\\Team A"): EpicRecord => ({ id, title: "E" + id, state, type: "Epic", areaPath: area, iterationPath: "", changed: "", start, target, grids: {}, extra: {} });
const task = (start: string, end: string, person = "a"): Task => ({ epicId: 1, sourceId: "s", person, personName: person, start, end });

describe("timeline geometry", () => {
  it("windows cover whole months and place dates as percentages, clipped", () => {
    expect(w).toEqual({ start: "2026-01-01", end: "2026-12-31", days: 365 });
    expect(pct("2026-01-01", w)).toBe(0);
    expect(pct("2026-07-02", w)).toBeCloseTo(50, 0);
    expect(pct("2025-01-01", w)).toBe(0); expect(pct("2027-06-01", w)).toBe(100);
    const b = barOf("2025-11-01", "2026-02-28", w)!;
    expect(b.left).toBe(0); expect(b.clippedStart).toBe(true); expect(b.clippedEnd).toBe(false);
    expect(barOf("2027-01-01", "2027-02-01", w)).toBeNull();
  });
  it("stacks overlapping tasks of a person into lanes and reuses free lanes", () => {
    const { placed, lanes } = layoutTasks([task("2026-01-01", "2026-03-31"), task("2026-02-01", "2026-02-28"), task("2026-04-01", "2026-05-31"), task("2026-06-01", "2027-03-01"), task("2028-01-01", "2028-02-01")], w);
    expect(placed.map(p => p.lane)).toEqual([0, 1, 0, 0]);
    expect(lanes).toBe(2);
    expect(layoutTasks([], w)).toEqual({ placed: [], lanes: 1 });
  });
  it("groups Epic states into a few categories", () => {
    expect(["New", "Active", "On Hold", "Closed", "Resolved", "In Progress", "Proposed", "Weird"].map(x => categoryOf(x))).toEqual(["new", "active", "hold", "done", "done", "active", "new", "other"]);
  });
  it("keeps Delivery Committed active and Cancelled removed, and prefers the process state group", () => {
    expect(["Delivery Committed", "Cancelled", "Completed", "Not Started", "Deferred"].map(x => categoryOf(x))).toEqual(["active", "removed", "done", "new", "hold"]);
    const g = { "delivery committed": "inprogress", "on hold": "inprogress", cancelled: "removed", done: "complete", "not started": "proposed", weird: "inprogress" };
    expect(["Delivery Committed", "On Hold", "Cancelled", "Done", "Not Started", "Weird"].map(x => categoryOf(x, g))).toEqual(["active", "hold", "removed", "done", "new", "active"]);
  });
});

describe("Epic Gantt rows", () => {
  const bookings = [{ epicId: 3, person: "a", month: "2026-03", hours: 40 }, { epicId: 3, person: "b", month: "2026-05", hours: 10 }, { epicId: 4, person: "a", month: "2026-02", hours: 5 }];
  const input = (over = {}) => ({ epics: [epic(1, "Active", "2026-02-02", "2026-12-04"), epic(2, "Active", "2026-01-15", "2026-05-31"), epic(3, "Active"), epic(4, "Active", "2030-01-01", "2030-06-01"), epic(5, "Closed", "2026-01-05", "2026-03-30", "P\\Team B")], bookings, months, inView: new Set([1, 2, 3, 4, 5]), group: "area" as const, teamOf: (p: string) => (p === "a" ? "NFR" : "ETC"), today: "2026-10-13", ...over });
  it("uses the date fields, derives dates from the hours when they are empty, hides Epics outside the window and flags late ones", () => {
    const g = buildGantt(input());
    expect(g.map(x => x.name)).toEqual(["Team A", "Team B"]);
    const a = g[0].rows;
    expect(a.map(r => r.epic.id)).toEqual([2, 1, 3]);                                        // sorted by start
    expect(a.find(r => r.epic.id === 3)).toMatchObject({ derived: true, start: "2026-03-01", end: "2026-05-31", people: 2, hours: 50 });
    expect(a.find(r => r.epic.id === 2)!.late).toBe(true);                                  // target passed, still active
    expect(a.find(r => r.epic.id === 1)!.late).toBe(false);
    expect(g[1].rows[0].late).toBe(false);                                                  // closed is never late
    expect(g.flatMap(x => x.rows).some(r => r.epic.id === 4)).toBe(false);                  // 2030 is outside the window
  });
  it("groups by state or by the team with most hours, and respects the Epic filter", () => {
    expect(buildGantt(input({ group: "state" })).map(x => x.name)).toEqual(["Active", "Closed"]);
    expect(buildGantt(input({ group: "team" })).flatMap(x => x.rows.filter(r => r.epic.id === 3).map(() => x.name))).toEqual(["NFR"]);
    expect(buildGantt(input({ inView: new Set([1]) })).flatMap(x => x.rows).map(r => r.epic.id)).toEqual([1]);
  });
});

describe("tasks read from the grid", () => {
  const src: GridSource = { id: "s", name: "G", dataField: "F", columns: { resource: "r", start: "st", end: "en", effort: "h", allocation: "al", task: "t" }, excludedStatuses: [] };
  it("keeps each row's own dates, or falls back to the months with hours", () => {
    const text = JSON.stringify({ version: 1, rows: [
      { r: "A <a>", st: "2026-10-05", en: "2026-10-30", h: 40, al: 50, t: "Design", _months: { "2026-10": 40 } },
      { r: "B <b>", _months: { "2026-02": 8, "2026-04": 8 } }] });
    const { tasks } = parseSource(text, src, 9);
    expect(tasks[0]).toMatchObject({ epicId: 9, person: "a", start: "2026-10-05", end: "2026-10-30", effort: 40, allocation: 50, label: "Design" });
    expect(tasks[1]).toMatchObject({ person: "b", start: "2026-02-01", end: "2026-04-30" });
  });
});

describe("long lists", () => {
  it("finds the rows to draw for a scroll position", () => {
    const heights = Array.from({ length: 1000 }, () => 30);
    const v = visibleRange(heights, 3000, 3600, 2);
    expect(v.total).toBe(30000); expect(v.from).toBe(98); expect(v.to).toBe(122);
    expect(visibleRange([], 0, 100).total).toBe(0);
  });
});
