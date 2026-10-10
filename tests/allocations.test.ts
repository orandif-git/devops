import { describe, expect, it } from "vitest";
import { allocKey, AllocationDoc, buildOverview, entriesFromRows, sameEntries, sumAllocations } from "../src/core/allocations";
import { capacityTemplate, capacityAllocation, syncDerived } from "../src/core/derived";
import { emptyRegister, newRecord } from "../src/core/capacity";
import { normalizeRow } from "../src/core/gridModel";
import { GridConfig } from "../src/core/types";

const src: GridConfig = { columns: [{ id: "res", name: "R", type: "string" }, { id: "period", name: "P", type: "date" }, { id: "h", name: "H", type: "number" }] };
const dcfg: GridConfig = { derived: { source: "T" }, dataField: "Custom.Cap", allocation: capacityAllocation(), columns: capacityTemplate({ resource: "res", period: "period", hours: "h" }, { fromRegister: true }) };
const R = (res: string, period: string, h: number) => normalizeRow({ res, period, h }, src);
const reg = () => { const r = emptyRegister(); r.resources["ann@x.com"] = newRecord("Ann Lee <ann@x.com>", 160); r.resources["bob@x.com"] = newRecord("Bob <bob@x.com>", 100); return r; };

describe("allocation entries", () => {
  it("keys are email + month; entries sum hours per person and month and ignore blanks/zeros", () => {
    expect(allocKey("Ann Lee <ANN@x.com>", "2026-03-14")).toBe("ann@x.com|2026-03");
    const rows = [{ _id: "1", resource: "Ann Lee <ann@x.com>", period: "2026-03", hours: 40 }, { _id: "2", resource: "ann lee <ANN@X.COM>", period: "2026-03", hours: 20 },
      { _id: "3", resource: "", period: "2026-03", hours: 5 }, { _id: "4", resource: "Bob <bob@x.com>", period: "", hours: 5 }, { _id: "5", resource: "Bob <bob@x.com>", period: "2026-04", hours: 0 }];
    expect(entriesFromRows(rows, capacityAllocation())).toEqual({ "ann@x.com|2026-03": 60 });
  });
  it("sums other Epics, excluding the one being viewed", () => {
    const docs: AllocationDoc[] = [
      { workItemId: 1, updatedAt: "", entries: { "ann@x.com|2026-03": 100 } },
      { workItemId: 2, updatedAt: "", entries: { "ann@x.com|2026-03": 30, "bob@x.com|2026-03": 10 } },
      { workItemId: 3, updatedAt: "", entries: { "ann@x.com|2026-03": 5.5 } }];
    expect(sumAllocations(docs, 1)).toEqual({ "ann@x.com|2026-03": 35.5, "bob@x.com|2026-03": 10 });
    expect(sumAllocations(docs)["ann@x.com|2026-03"]).toBe(135.5);
    expect(sameEntries({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true); expect(sameEntries({ a: 1 }, { a: 2 })).toBe(false);
  });
});

describe("Utilization across all Epics vs. this Epic's share", () => {
  it("person split over two Epics: utilization counts both, this-Epic % only its own", () => {
    // Ann: capacity 160 in March. This Epic: 40h. Other Epics: 100h.  => total 140 (87.5%), this Epic 25%
    const d = syncDerived([R("Ann Lee <ann@x.com>", "2026-03-02", 40)], dcfg, [], reg(), { "ann@x.com|2026-03": 100 });
    expect(d[0]).toMatchObject({ hours: 40, otherhours: 100, totalhours: 140, capacity: 160, utilization: 87.5, epicshare: 25, overcapacity: "No" });
  });
  it("over capacity is decided on the TOTAL, even if this Epic alone is fine", () => {
    const d = syncDerived([R("Ann Lee <ann@x.com>", "2026-03-02", 40)], dcfg, [], reg(), { "ann@x.com|2026-03": 150 });
    expect(d[0]).toMatchObject({ totalhours: 190, utilization: 118.8, epicshare: 25, overcapacity: "Yes" });
  });
  it("no other Epics = 0 (not blank); store not loaded keeps the stored value", () => {
    const d = syncDerived([R("Ann Lee <ann@x.com>", "2026-03-02", 40)], dcfg, [], reg(), {});
    expect(d[0]).toMatchObject({ otherhours: 0, totalhours: 40, utilization: 25 });
    const before = syncDerived([R("Ann Lee <ann@x.com>", "2026-03-02", 40)], dcfg, [], reg(), { "ann@x.com|2026-03": 100 });
    expect(syncDerived([R("Ann Lee <ann@x.com>", "2026-03-02", 50)], dcfg, before, reg(), undefined)[0]).toMatchObject({ hours: 50, otherhours: 100, totalhours: 150 });
  });
  it("unregistered person: capacity-based columns stay blank but hours still add up", () => {
    const d = syncDerived([R("Cy <cy@x.com>", "2026-03-02", 10)], dcfg, [], reg(), { "cy@x.com|2026-03": 5 });
    expect(d[0]).toMatchObject({ totalhours: 15, capacity: null, utilization: null, overcapacity: null });
  });
});

describe("manager overview", () => {
  it("per person and month: capacity, allocated across Epics, utilization, over flag; includes unregistered people", () => {
    const records = Object.values(reg().resources);
    const docs: AllocationDoc[] = [{ workItemId: 1, updatedAt: "", entries: { "ann@x.com|2026-03": 100, "cy@x.com|2026-03": 8 } }, { workItemId: 2, updatedAt: "", entries: { "ann@x.com|2026-03": 70 } }];
    const rows = buildOverview(records, reg(), docs, ["2026-03", "2026-04"]);
    const ann = rows.find(r => r.key === "ann@x.com")!;
    expect(ann.cells[0]).toMatchObject({ capacity: 160, allocated: 170, utilization: 106.3, over: true });
    expect(ann.cells[1]).toMatchObject({ allocated: 0, utilization: 0, over: false });
    expect(rows.find(r => r.key === "cy@x.com")!.cells[0]).toMatchObject({ capacity: null, allocated: 8, utilization: null, over: false });
    expect(rows.map(r => r.key)).toEqual(["ann@x.com", "bob@x.com", "cy@x.com"]);
  });
});

import { makeCatalog, validateProject } from "../src/hub/validate";
import { emptyConfig } from "../src/core/types";
import { readFileSync } from "node:fs";
import { resolvedGrids } from "../src/core/sharedLookups";

describe("hub validation of publishing / other-Epics columns", () => {
  const cat = makeCatalog([], []);
  const project = (over: Partial<GridConfig> = {}) => {
    const x = emptyConfig();
    x.grids.T = { dataField: "Custom.T", columns: [{ id: "res", name: "R", type: "string" }, { id: "period", name: "P", type: "date" }, { id: "h", name: "H", type: "number" }] };
    x.grids.C = { ...dcfg, ...over };
    return x;
  };
  const msgs = (x: ReturnType<typeof project>) => validateProject(x, cat).map(i => `${i.level}:${i.message}`).join("|");
  it("the generated template validates", () => { expect(msgs(project())).toBe(""); });
  it("publishing needs existing key columns and a number for hours", () => {
    expect(msgs(project({ allocation: { resource: "nope", period: "period", hours: "hours" } }))).toMatch(/Publishing: pick the person column/);
    expect(msgs(project({ allocation: { resource: "team", period: "period", hours: "hours" } }))).not.toBe("");     // team is not a key
    expect(msgs(project({ allocation: { resource: "resource", period: "period", hours: "capacity" } }))).toBe("");
  });
  it("warns when other-Epics hours are shown but nobody publishes", () => {
    const x = project(); delete x.grids.C.allocation;
    expect(msgs(x)).toMatch(/no grid publishes its hours yet/);
  });
  it("warns when a non-derived grid has publishing on", () => {
    const x = project(); delete x.grids.C.derived;
    expect(msgs(x)).toMatch(/not derived, so nothing is published/);
  });
});

describe("shipped example, with all-Epics utilization", () => {
  it("validates and computes utilization across Epics", async () => {
    const ex = JSON.parse(readFileSync("examples/sdlc-timesheet.json", "utf8"));
    expect(validateProject(ex, makeCatalog([], [])).filter(i => i.level === "error")).toEqual([]);
    const grids = resolvedGrids(ex);
    const cap = grids["Resource Capacity"], ts = grids["SDLC Timesheet"];
    const rows = [normalizeRow({ sdlcactivity: "Unit testing", team: "Engineering", resource: "Ann Lee <ann@x.com>", period: "2026-03-02", Hours: 40 }, ts)];
    const d = syncDerived(rows, cap, [], reg(), { "ann@x.com|2026-03": 150 });
    expect(d[0]).toMatchObject({ hours: 40, otherhours: 150, totalhours: 190, capacity: 160, utilization: 118.8, epicshare: 25, overcapacity: "Yes" });
    const { evaluateCalculations } = await import("../src/core/calc");
    const { serialize } = await import("../src/core/gridModel");
    const f: Record<string, unknown> = { [ts.dataField!]: serialize(rows), [cap.dataField!]: serialize(d) };
    const out = evaluateCalculations(ex.calculations, "Epic", k => f[k], grids).changes;
    expect(out["Custom.PeakUtilization"]).toBe(118.8);
    expect(out["Custom.TotalPlannedCapacity"]).toBe(160);
    expect(out["Custom.OverallUtilization"]).toBe(25);          // this Epic's 40h / planned 160h, as defined for the Epic-level field
  });
});
