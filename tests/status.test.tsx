// @vitest-environment jsdom
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";
import { bandFor, normalizeRow, recomputeAll, validateConfig } from "../src/core/gridModel";
import { CAPACITY_BANDS, CAPACITY_ROW_COLOR, capacityTemplate, syncDerived } from "../src/core/derived";
import { newRecord, emptyRegister } from "../src/core/capacity";
import { GridConfig } from "../src/core/types";
import { Grid } from "../src/grid/Grid";
import { makeCatalog, validateProject } from "../src/hub/validate";
import { emptyConfig } from "../src/core/types";
import { readFileSync } from "node:fs";

vi.mock("azure-devops-extension-api/Identities", () => ({ IdentityServiceIds: { IdentityService: "x" } }));
vi.mock("azure-devops-extension-sdk", () => ({ getService: () => Promise.reject(new Error("no host")) }));
vi.mock("../src/shared/ado", () => ({ listPeople: () => Promise.resolve([]) }));

describe("capacity status bands (0-70 Available, >70-90 Near, >90-100 Fully, >100 Over)", () => {
  const label = (v: unknown) => bandFor(v, CAPACITY_BANDS)?.label;
  it("uses the exact boundaries of the table", () => {
    expect([0, 12.5, 70].map(label)).toEqual(["Available", "Available", "Available"]);
    expect([70.1, 85, 90].map(label)).toEqual(["Near Capacity", "Near Capacity", "Near Capacity"]);
    expect([90.1, 99.9, 100].map(label)).toEqual(["Fully Allocated", "Fully Allocated", "Fully Allocated"]);
    expect([100.1, 118.8, 5000].map(label)).toEqual(["Overallocated", "Overallocated", "Overallocated"]);
  });
  it("has no status for empty or non-numeric values", () => { expect([null, undefined, "", "abc"].map(label)).toEqual([undefined, undefined, undefined, undefined]); });
  it("colours: green, yellow, orange, red", () => { expect(CAPACITY_BANDS.map(b => b.color)).toEqual(["green", "yellow", "orange", "red"]); });
});

describe("status column in a grid", () => {
  const cfg: GridConfig = { rowColorBy: "status", columns: [
    { id: "u", name: "Utilization %", type: "number", colorBy: "status" },
    { id: "status", name: "Capacity Status", type: "string", statusBands: { source: "u", ranges: CAPACITY_BANDS } }] };
  const rows = recomputeAll([60, 80, 95, 130, null].map(u => normalizeRow({ u }, cfg)), cfg);
  it("is filled automatically from the number, and blank when there is none", () => {
    expect(rows.map(r => r.status)).toEqual(["Available", "Near Capacity", "Fully Allocated", "Overallocated", ""]);
  });
  it("validates ranges: order, labels, source, row colour", () => {
    expect(validateConfig(cfg)).toEqual([]);
    expect(validateConfig({ columns: [{ id: "a", name: "a", type: "number" }, { id: "s", name: "s", type: "string", statusBands: { source: "a", ranges: [{ upTo: 90, label: "x", color: "red" }, { upTo: 70, label: "", color: "red" }] } }] }).join("|")).toMatch(/range 2 has no label[\s\S]*ranges must go up/);
    expect(validateConfig({ columns: cfg.columns, rowColorBy: "u" }).join()).toMatch(/not a status column/);
    expect(validateConfig({ columns: [{ id: "a", name: "a", type: "number", colorBy: "zzz" }] }).join()).toMatch(/not a status column/);
  });
  it("is rendered with row tint, status tint and right-aligned numbers", () => {
    const host = document.createElement("div");
    act(() => { ReactDOM.render(<Grid cfg={cfg} rows={rows} readOnly autoRows projectId="p" busyChildren={false} status="" onChange={() => undefined} onCreateChild={() => undefined} onCreateAllChildren={() => undefined} onImport={() => undefined} onExport={() => undefined} />, host); });
    const trs = Array.from(host.querySelectorAll("tbody tr"));
    expect(trs.map(t => t.className)).toEqual(["row-green", "row-yellow", "row-orange", "row-red", "row-none"]);
    expect(trs[3].querySelector("td.status")!.className).toContain("tint-red");
    expect(trs[3].querySelector("td.num")!.className).toContain("tint-red");           // the % cell follows the status colour
    const ths = Array.from(host.querySelectorAll("thead th"));
    expect(ths[1].className).toContain("num");                                          // number heading right-aligned like its figures
    expect(ths[2].className).not.toContain("num");
  });
});

describe("capacity template and example", () => {
  it("template adds Capacity Status after Utilization and the row colour is the status column", () => {
    const cols = capacityTemplate({ resource: "r", period: "p", hours: "h" }, { fromRegister: true });
    expect(cols.map(c => c.id).slice(-4)).toEqual(["utilization", "capacitystatus", "epicshare", "overcapacity"]);
    expect(cols.find(c => c.id === "utilization")!.colorBy).toBe("capacitystatus");
    expect(CAPACITY_ROW_COLOR).toBe("capacitystatus");
  });
  it("derived rows get the right status end to end", () => {
    const src: GridConfig = { columns: [{ id: "res", name: "R", type: "string" }, { id: "period", name: "P", type: "date" }, { id: "h", name: "H", type: "number" }] };
    const dcfg: GridConfig = { derived: { source: "T" }, rowColorBy: "capacitystatus", columns: capacityTemplate({ resource: "res", period: "period", hours: "h" }, { fromRegister: true }) };
    const reg = emptyRegister(); reg.resources["a@x.com"] = newRecord("A <a@x.com>", 100); reg.resources["b@x.com"] = newRecord("B <b@x.com>", 100); reg.resources["c@x.com"] = newRecord("C <c@x.com>", 100);
    const r = (n: string, h: number) => normalizeRow({ res: `${n} <${n.toLowerCase()}@x.com>`, period: "2026-03-01", h }, src);
    const d = syncDerived([r("A", 50), r("B", 95), r("C", 130)], dcfg, [], reg, {});
    expect(d.map(x => [x.utilization, x.capacitystatus])).toEqual([[50, "Available"], [95, "Fully Allocated"], [130, "Overallocated"]]);
  });
  it("shipped example validates and includes the status column", () => {
    const ex = JSON.parse(readFileSync("examples/sdlc-timesheet.json", "utf8"));
    expect(validateProject(ex, makeCatalog([], [])).filter(i => i.level === "error")).toEqual([]);
    expect(ex.grids["Resource Capacity"].rowColorBy).toBe("capacitystatus");
    expect(ex.grids["Resource Capacity"].columns.find((c: { id: string }) => c.id === "capacitystatus").statusBands.ranges).toHaveLength(4);
  });
  it("hub warns when the last range has a limit", () => {
    const x = emptyConfig();
    x.grids.G = { columns: [{ id: "u", name: "U", type: "number" }, { id: "s", name: "S", type: "string", statusBands: { source: "u", ranges: [{ upTo: 50, label: "ok", color: "green" }] } }] };
    expect(validateProject(x, makeCatalog([], [])).map(i => i.message).join()).toMatch(/last range has an upper limit/);
  });
});
