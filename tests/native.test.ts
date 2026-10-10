import { describe, expect, it } from "vitest";
import { normalizeWorkingDays, recordsFromNative, reportNative, toIsoDate, NativeTeam } from "../src/core/nativeCapacity";
import { capacityFor, emptyRegister } from "../src/core/capacity";

const MON_FRI = [1, 2, 3, 4, 5];
const team = (over: Partial<NativeTeam["iterations"][0]> = {}, workingDays = MON_FRI): NativeTeam => ({
  teamName: "Delivery", workingDays,
  iterations: [{ name: "Capacity 2026", start: "2026-01-01", finish: "2026-12-31", teamDaysOff: [], members: [{ name: "Ann Lee <ann@x.com>", capacityPerDay: 8, daysOff: [] }], ...over }],
});

describe("monthly capacity from Azure DevOps team capacity", () => {
  it("counts working days × hours per day for each month of a yearly iteration", () => {
    const [ann] = recordsFromNative([team()]);
    // March 2026 has 22 weekdays, February 20, April 22
    expect(ann.overrides["2026-03"]).toBe(176); expect(ann.overrides["2026-02"]).toBe(160); expect(ann.overrides["2026-04"]).toBe(176);
    expect(Object.keys(ann.overrides)).toHaveLength(12);
    expect(ann.key).toBe("ann@x.com");
  });
  it("subtracts the person's days off (leave) and team days off (holidays)", () => {
    const t = team({ teamDaysOff: [{ start: "2026-03-02", end: "2026-03-02" }], members: [{ name: "Ann Lee <ann@x.com>", capacityPerDay: 8, daysOff: [{ start: "2026-03-09", end: "2026-03-13" }] }] });
    expect(recordsFromNative([t])[0].overrides["2026-03"]).toBe(176 - 8 - 40);        // one holiday, one week of leave
  });
  it("leave on a weekend or a day outside working days costs nothing", () => {
    const t = team({ members: [{ name: "Ann Lee <ann@x.com>", capacityPerDay: 8, daysOff: [{ start: "2026-03-07", end: "2026-03-08" }] }] });   // Sat+Sun
    expect(recordsFromNative([t])[0].overrides["2026-03"]).toBe(176);
  });
  it("respects the team's working days (e.g. Sun–Thu) and part-time hours per day", () => {
    const t = team({ members: [{ name: "Ann Lee <ann@x.com>", capacityPerDay: 4.5, daysOff: [] }] }, [0, 1, 2, 3, 4]);
    expect(recordsFromNative([t])[0].overrides["2026-03"]).toBe(23 * 4.5);              // 23 Sun-Thu days in March 2026 (it starts on a Sunday)
  });
  it("a month fully off is 0 (a real value); months outside the iteration have no value", () => {
    const t = team({ start: "2026-03-01", finish: "2026-04-30", members: [{ name: "Ann Lee <ann@x.com>", capacityPerDay: 8, daysOff: [{ start: "2026-04-01", end: "2026-04-30" }] }] });
    const [ann] = recordsFromNative([t]);
    expect(ann.overrides["2026-04"]).toBe(0); expect(ann.overrides["2026-05"]).toBeUndefined();
    const reg = emptyRegister(); reg.resources[ann.key] = ann;
    expect(capacityFor(reg, "Ann Lee <ann@x.com>", "2026-04")).toBe(0);
    expect(capacityFor(reg, "Ann Lee <ann@x.com>", "2026-05")).toBeNull();
  });
  it("sums the same person across teams and sorts by name; sums activities already in capacityPerDay", () => {
    const a = team(), b = team({ members: [{ name: "ann lee <ANN@x.com>", capacityPerDay: 2, daysOff: [] }, { name: "Bob <bob@x.com>", capacityPerDay: 8, daysOff: [] }] });
    const recs = recordsFromNative([a, b]);
    expect(recs.map(r => r.key)).toEqual(["ann@x.com", "bob@x.com"]);
    expect(recs[0].overrides["2026-03"]).toBe(176 + 44);
  });
  it("ignores iterations without dates", () => { expect(recordsFromNative([team({ start: "", finish: "" })])).toEqual([]); });
  it("normalizes working days and dates from the API", () => {
    expect(normalizeWorkingDays(["monday", "Tuesday", 3, "sunday", "xyz"])).toEqual([1, 2, 3, 0]);
    expect(toIsoDate("2026-01-01T00:00:00Z")).toBe("2026-01-01"); expect(toIsoDate(new Date(Date.UTC(2026, 11, 31)))).toBe("2026-12-31"); expect(toIsoDate("nope")).toBe("");
  });
  it("reports what is missing", () => {
    expect(reportNative([{ teamName: "T", workingDays: [], iterations: [] }])[0].messages.join(" ")).toMatch(/no iterations[\s\S]*no working days/);
    expect(reportNative([team({ members: [] })])[0].messages[0]).toMatch(/no capacity entered/);
    expect(reportNative([team({ members: [{ name: "Z <z@x.com>", capacityPerDay: 0, daysOff: [] }] })])[0].messages[0]).toMatch(/no hours per day for Z/);
    expect(reportNative([team()])[0]).toMatchObject({ iterations: 1, members: 1, messages: [] });
  });
});

import { syncDerived, capacityTemplate } from "../src/core/derived";
import { normalizeRow } from "../src/core/gridModel";
import { GridConfig } from "../src/core/types";

describe("end to end: yearly capacity iteration → Epic utilization", () => {
  it("leave reduces capacity and changes the status of that month", () => {
    // Ann: 8 h/day, 2 weeks of leave in March 2026 -> 176 - 80 = 96 h available
    const recs = recordsFromNative([{ teamName: "Delivery", workingDays: MON_FRI, iterations: [{ name: "Capacity 2026", start: "2026-01-01", finish: "2026-12-31", teamDaysOff: [],
      members: [{ name: "Ann Lee <ann@x.com>", capacityPerDay: 8, daysOff: [{ start: "2026-03-02", end: "2026-03-13" }] }] }] }]);
    const reg = emptyRegister(); for (const r of recs) reg.resources[r.key] = r;
    const src: GridConfig = { columns: [{ id: "res", name: "R", type: "string" }, { id: "period", name: "P", type: "date" }, { id: "h", name: "H", type: "number" }] };
    const dcfg: GridConfig = { derived: { source: "T" }, columns: capacityTemplate({ resource: "res", period: "period", hours: "h" }, { fromRegister: true }) };
    const row = (period: string, h: number) => normalizeRow({ res: "Ann Lee <ann@x.com>", period, h }, src);
    const d = syncDerived([row("2026-03-10", 96), row("2026-04-10", 96)], dcfg, [], reg, { "ann@x.com|2026-04": 40 });
    const march = d.find(r => r.period === "2026-03")!, april = d.find(r => r.period === "2026-04")!;
    expect(march).toMatchObject({ capacity: 96, utilization: 100, capacitystatus: "Fully Allocated" });      // 96 of 96
    expect(april).toMatchObject({ capacity: 176, otherhours: 40, totalhours: 136, utilization: 77.3, capacitystatus: "Near Capacity" });
  });
});
