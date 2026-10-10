import { describe, expect, it } from "vitest";
import { addHistory, capacityFor, emptyRegister, exportCapacityCsv, importMatrix, monthKey, monthsOf, newRecord, parseCapacityCsv } from "../src/core/capacity";
import { keyNorm } from "../src/core/keys";
import { syncDerived, capacityTemplate } from "../src/core/derived";
import { normalizeRow } from "../src/core/gridModel";
import { GridConfig } from "../src/core/types";

const reg = () => {
  const r = emptyRegister(); r.projectDefault = 140;
  r.resources["ann@x.com"] = { ...newRecord("Ann Lee <ann@x.com>", 160), overrides: { "2026-03": 80 } };
  r.resources["bob@x.com"] = newRecord("Bob <bob@x.com>", null);
  return r;
};

describe("capacity resolution", () => {
  it("exception > person default > project default; unregistered = none", () => {
    const r = reg();
    expect(capacityFor(r, "Ann Lee <ANN@x.com>", "2026-03")).toBe(80);        // exception wins
    expect(capacityFor(r, "Ann Lee <ann@x.com>", "2026-04")).toBe(160);       // person default
    expect(capacityFor(r, "Bob <bob@x.com>", "2026-04")).toBe(140);           // project default
    expect(capacityFor(r, "Cy <cy@x.com>", "2026-04")).toBeNull();            // not registered
    expect(capacityFor({ ...r, projectDefault: null }, "Bob <bob@x.com>", "2026-04")).toBeNull();
  });
  it("month keys", () => {
    expect(monthKey("2026-03-14")).toBe("2026-03"); expect(monthKey("2026-03")).toBe("2026-03"); expect(monthKey("x")).toBe("");
    expect(monthsOf(2026)).toHaveLength(12);
    expect(keyNorm("Ann <A@X.com>")).toBe("a@x.com");
  });
  it("audit trail keeps newest first and is capped", () => {
    let rec = newRecord("A <a@x.com>", 160);
    for (let i = 0; i < 40; i++) rec = addHistory(rec, "mgr", `change ${i}`, `2026-01-01T00:00:${String(i).padStart(2, "0")}Z`);
    expect(rec.history).toHaveLength(30); expect(rec.history![0].what).toBe("change 39"); expect(rec.updatedBy).toBe("mgr");
  });
});

describe("import / export", () => {
  const existing = [{ ...newRecord("Ann Lee <ann@x.com>", 160), overrides: { "2026-03": 80 } }];
  it("round trips through CSV", () => {
    const csv = exportCapacityCsv(existing, 2026);
    const res = parseCapacityCsv(csv, []);
    expect(res.created).toBe(1);
    expect(res.records[0].defaultHours).toBe(160); expect(res.records[0].overrides).toEqual({ "2026-03": 80 });
  });
  it("merges: blanks keep values, numbers update, unknown people are created, bad numbers are skipped", () => {
    const sheet = [["Resource", "Default hours", "2026-03", "2026-04"],
      ["Ann Lee <ann@x.com>", "", "", 100], ["New Person <new@x.com>", 120, "", ""], ["Bad <bad@x.com>", "abc", "", ""]];
    const r = importMatrix(sheet, existing);
    expect(r).toMatchObject({ created: 1, updated: 1 });
    const ann = r.records.find(x => x.key === "ann@x.com")!;
    expect(ann.defaultHours).toBe(160); expect(ann.overrides).toEqual({ "2026-03": 80, "2026-04": 100 });
    expect(r.records.find(x => x.key === "new@x.com")!.defaultHours).toBe(120);
    expect(r.skipped.join()).toMatch(/Row 4 \(Bad/);
  });
  it("requires a Resource column", () => { expect(importMatrix([["x", "y"], ["a", 1]], []).skipped[0]).toMatch(/Resource/); });
});

describe("derived grid takes Available Capacity from the register", () => {
  const src: GridConfig = { columns: [{ id: "res", name: "R", type: "string" }, { id: "period", name: "P", type: "date" }, { id: "h", name: "H", type: "number" }] };
  const dcfg: GridConfig = { derived: { source: "T" }, columns: capacityTemplate({ resource: "res", period: "period", hours: "h" }, { fromRegister: true }) };
  const rows = [normalizeRow({ res: "Ann Lee <ann@x.com>", period: "2026-03-02", h: 40 }, src), normalizeRow({ res: "Cy <cy@x.com>", period: "2026-03-09", h: 10 }, src), normalizeRow({ res: "Ann Lee <ann@x.com>", period: "2026-04-02", h: 80 }, src)];
  it("looks capacity up per resource and month; unregistered stays blank and calculations stay blank", () => {
    const d = syncDerived(rows, dcfg, [], reg());
    const pick = (n: string, m: string) => d.find(r => String(r.resource).startsWith(n) && r.period === m)!;
    expect(pick("Ann", "2026-03").capacity).toBe(80); expect(pick("Ann", "2026-03").epicshare).toBe(50);
    expect(pick("Ann", "2026-04").capacity).toBe(160); expect(pick("Ann", "2026-04").epicshare).toBe(50);
    expect(pick("Cy", "2026-03").capacity).toBeNull(); expect(pick("Cy", "2026-03").epicshare).toBeNull(); expect(pick("Cy", "2026-03").overcapacity).toBeNull();
  });
  it("updates when the register changes and keeps stored values if the register could not be loaded", () => {
    const d1 = syncDerived(rows, dcfg, [], reg());
    const r2 = reg(); r2.resources["ann@x.com"].overrides["2026-03"] = 40;
    expect(syncDerived(rows, dcfg, d1, r2).find(r => String(r.resource).startsWith("Ann") && r.period === "2026-03")!.capacity).toBe(40);
    expect(syncDerived(rows, dcfg, d1, undefined).find(r => String(r.resource).startsWith("Ann") && r.period === "2026-03")!.capacity).toBe(80);
  });
  it("capacity cells are read-only auto columns (rows with only register data are not 'manual')", () => {
    const d = syncDerived(rows, dcfg, [], reg());
    const gone = syncDerived([rows[0]], dcfg, d, reg());
    expect(gone.map(r => r.period)).toEqual(["2026-03"]);           // other rows dropped: capacity is not a manual entry any more
  });
});

import * as React from "react";
import * as ReactDOM from "react-dom";
import { CapacityRecord } from "../src/core/capacity";

describe("shipped example uses the register", () => {
  it("capacity column is looked up, not typed", async () => {
    const { readFileSync } = await import("node:fs");
    const ex = JSON.parse(readFileSync("examples/sdlc-timesheet.json", "utf8"));
    const cap = ex.grids["Resource Capacity"].columns.find((c: { id: string }) => c.id === "capacity");
    expect(cap.capacity).toEqual({ resource: "resource", period: "period" });
    const { validateProject, makeCatalog } = await import("../src/hub/validate");
    expect(validateProject(ex, makeCatalog([], [])).filter(i => i.level === "error")).toEqual([]);
  });
});
void React; void ReactDOM; void ({} as CapacityRecord);
