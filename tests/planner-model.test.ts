import { describe, expect, it } from "vitest";
import { buildPeople, cellOf, groupByTeam, heatmapCsv, monthSummary, noFilters, NO_TEAM } from "../planner/src/core/model";
import { Booking, EpicRecord } from "../planner/src/core/types";

const T = { spare: 50, healthy: 85, full: 100 };
const epic = (id: number, state: string, extra: Record<string, string> = {}): EpicRecord => ({ id, title: "E" + id, state, type: "Epic", areaPath: "", iterationPath: "", changed: "", grids: {}, extra });
const b = (epicId: number, person: string, month: string, hours: number): Booking => ({ epicId, sourceId: "s", person, personName: person.toUpperCase() + " <" + person + ">", month, hours });
const cap: Record<string, Record<string, number>> = { ann: { "2026-10": 100, "2026-11": 100 }, bob: { "2026-10": 100 }, cy: { "2026-10": 100 } };
const teamOf: Record<string, string> = { ann: "NFR", bob: "NFR", cy: "InfoSec" };
const avail = {
  records: ["ann", "bob", "cy"].map(k => ({ key: k, name: k.toUpperCase() + " <" + k + ">" })),
  hours: (p: string, m: string) => cap[p]?.[m] ?? null, team: (p: string) => teamOf[p] ?? "",
};
const months = ["2026-10", "2026-11"];
const bookings = [b(1, "ann", "2026-10", 60), b(2, "ann", "2026-10", 50), b(1, "bob", "2026-10", 30), b(3, "dee", "2026-10", 20), b(1, "ann", "2026-12", 99)];
const epics = [epic(1, "Active", { "Custom.BU": "NFR" }), epic(2, "On hold", { "Custom.BU": "ETC" }), epic(3, "Active")];

describe("heatmap model", () => {
  it("builds one row per person with capacity, adds hours per month, keeps only the period and puts people without capacity last", () => {
    const rows = buildPeople(bookings, epics, avail, months, noFilters());
    expect(rows.map(r => r.key)).toEqual(["cy", "ann", "bob", "dee"]);                        // InfoSec, NFR, then people without team capacity
    const ann = rows.find(r => r.key === "ann")!;
    expect(ann.hours).toEqual({ "2026-10": 110 });                              // December is outside the period
    expect(ann.epics["2026-10"].map(e => e.epicId).sort()).toEqual([1, 2]);
    expect(rows.find(r => r.key === "dee")!.team).toBe(NO_TEAM);
    expect(groupByTeam(rows).map(g => g.team)).toEqual(["InfoSec", "NFR", NO_TEAM]);
  });
  it("applies team, state, extra-field, search and idle filters", () => {
    expect(buildPeople(bookings, epics, avail, months, { ...noFilters(), team: "NFR" }).map(r => r.key)).toEqual(["ann", "bob"]);
    expect(buildPeople(bookings, epics, avail, months, { ...noFilters(), states: ["Active"] }).find(r => r.key === "ann")!.hours["2026-10"]).toBe(60);
    expect(buildPeople(bookings, epics, avail, months, { ...noFilters(), extra: { "Custom.BU": ["ETC"] } }).find(r => r.key === "ann")!.hours["2026-10"]).toBe(50);
    expect(buildPeople(bookings, epics, avail, months, { ...noFilters(), search: "bo" }).map(r => r.key)).toEqual(["bob"]);
    expect(buildPeople(bookings, epics, avail, months, { ...noFilters(), showIdle: false }).map(r => r.key).sort()).toEqual(["ann", "bob", "dee"]);
  });
  it("gives each cell its ratio and band, flags hours without capacity, and treats capacity 0 with hours as over", () => {
    const rows = buildPeople(bookings, epics, avail, months, noFilters());
    const get = (k: string, m = "2026-10") => cellOf(rows.find(r => r.key === k)!, m, T);
    expect(get("ann")).toMatchObject({ hours: 110, available: 100, band: "over" });
    expect(get("bob")).toMatchObject({ band: "spare" });
    expect(get("cy")).toMatchObject({ hours: 0, band: "spare" });
    expect(get("dee")).toMatchObject({ noCapacity: true, band: "none" });
    expect(get("ann", "2026-11")).toMatchObject({ hours: 0, band: "spare" });
    const zero = cellOf({ key: "x", name: "x", team: "t", hours: { m: 5 }, available: { m: 0 }, epics: {} }, "m", T);
    expect(zero.band).toBe("over");
  });
  it("summarises a month: utilization, free hours, band counts, Epics", () => {
    const rows = buildPeople(bookings, epics, avail, months, noFilters());
    const s = monthSummary(rows, "2026-10", T);
    expect(s).toMatchObject({ hours: 160, available: 300, over: 1, epics: 3 });
    expect(s.utilization).toBeCloseTo(160 / 300);
    expect(s.counts).toEqual({ spare: 2, healthy: 0, full: 0, over: 1, none: 1 });
    expect(s.free).toBe(70 + 100);                                              // bob 70 free, cy 100 free, ann over
  });
  it("exports what is shown as CSV", () => {
    const csv = heatmapCsv(buildPeople(bookings, epics, avail, months, noFilters()), months, T);
    expect(csv.split("\r\n")[0]).toBe("Person,Team,Month,Booked hours,Available hours,Utilization %,Band");
    expect(csv).toContain("ANN,NFR,2026-10,110,100,110,Over capacity");
    expect(csv).toContain("DEE,No team capacity entered,2026-10,20,,,No capacity entered");
  });
});
