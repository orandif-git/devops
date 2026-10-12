import { describe, expect, it } from "vitest";
import { capacityAllocation, capacityTemplate, keyNorm, sameRows, syncDerived } from "../src/core/derived";
import { newRecord } from "../src/core/capacity";
import { normalizeRow, parseStored, recomputeAll, serialize, validateConfig } from "../src/core/gridModel";
import { checkFormula, extractRefs } from "../src/core/expr";
import { GridConfig, GridRow } from "../src/core/types";

describe("Step A: calculated columns", () => {
  const cfg: GridConfig = { columns: [
    { id: "qty", name: "Qty", type: "number" }, { id: "price", name: "Price", type: "number" },
    { id: "amount", name: "Amount", type: "calculated", formula: "qty * price", decimals: 2 },
    { id: "share", name: "Share %", type: "calculated", formula: "amount / TOTAL(amount) * 100", decimals: 1 },
    { id: "avg", name: "Per unit", type: "calculated", formula: "amount / qty", decimals: 2, onDivZero: "zero" },
    { id: "flag", name: "Big?", type: "calculated", formula: 'IF(amount > 50, "Yes", "No")' }] };
  const rows = (...r: Record<string, unknown>[]) => recomputeAll(r.map(x => normalizeRow(x, cfg)), cfg);

  it("calculates numbers and text results with rounding", () => {
    const [a] = rows({ qty: 3, price: 1.2345 });
    expect(a.amount).toBe(3.7);                       // 3.7035 -> 2 decimals
    expect(rows({ qty: 2, price: 30 })[0].flag).toBe("Yes");
  });
  it("blank when an input is empty (default) and when dividing by zero", () => {
    const [a] = rows({ qty: 2, price: null });
    expect(a.amount).toBeNull(); expect(a.flag).toBeNull();
    const [b] = rows({ qty: 0, price: 5 });
    expect(b.amount).toBe(0); expect(b.avg).toBe(0);  // onDivZero: zero
    expect(b.share).toBeNull();                       // TOTAL is 0 -> division by zero -> blank (default)
  });
  it("onEmpty: zero counts empty inputs as 0", () => {
    const c2: GridConfig = { columns: [{ id: "a", name: "A", type: "number" }, { id: "r", name: "R", type: "calculated", formula: "a + 1", onEmpty: "zero" }] };
    expect(recomputeAll([normalizeRow({ a: null }, c2)], c2)[0].r).toBe(1);
  });
  it("whole-column functions see all rows and update every row", () => {
    const r = rows({ qty: 1, price: 30 }, { qty: 1, price: 70 });
    expect(r.map(x => x.share)).toEqual([30, 70]);
    const r2 = recomputeAll([...r.map(x => ({ ...x })), normalizeRow({ qty: 1, price: 100 }, cfg)], cfg);
    expect(r2.map(x => x.share)).toEqual([15, 35, 50]);
  });
  it("stored values round trip and recompute on load", () => {
    const stored = serialize(rows({ qty: 2, price: 10 }, { qty: 2, price: 30 }));
    expect(parseStored(stored, cfg).map(x => x.share)).toEqual([25, 75]);
  });
  it("function refs and validation", () => {
    expect(extractRefs("amount / TOTAL(amount) * 100").sort()).toEqual(["amount"]);
    expect(extractRefs("x / TOTAL([Row hours])").sort()).toEqual(["Row hours", "x"]);
    expect(checkFormula("a / TOTAL(b)")).toBeNull();
    expect(validateConfig({ columns: [{ id: "c", name: "C", type: "calculated" }] }).join()).toMatch(/has no formula/);
  });
});

describe("Step B: derived Resource Capacity grid", () => {
  const src: GridConfig = { columns: [
    { id: "res", name: "Resource", type: "identity" }, { id: "period", name: "Period", type: "date" },
    { id: "team", name: "Team", type: "string" }, { id: "h", name: "Hours", type: "number" }] };
  const R = (res: string, period: string, team: string, h: number): GridRow => normalizeRow({ res, period, team, h }, src);
  const derivedCfg: GridConfig = { derived: { source: "Timesheet" }, dataField: "Custom.Cap", columns: capacityTemplate({ resource: "res", period: "period", hours: "h", team: "team" }) };
  const sourceRows = [
    R("Ann Lee <ann@x.com>", "2026-03-02", "Eng", 40), R("Ann Lee <ann@x.com>", "2026-03-20", "Eng", 60),
    R("Ben Ray <ben@x.com>", "2026-03-05", "Vendor", 80), R("Ann Lee <ann@x.com>", "2026-04-01", "Eng", 10)];

  it("one row per resource + month, hours summed, team carried", () => {
    const d = syncDerived(sourceRows, derivedCfg, []);
    expect(d.map(r => `${String(r.resource).split(" <")[0]}|${r.period}|${r.team}|${r.hours}`)).toEqual(["Ann Lee|2026-03|Eng|100", "Ann Lee|2026-04|Eng|10", "Ben Ray|2026-03|Vendor|80"]);
  });
  it("same person typed two ways (name only vs name+email) is not merged unless the key matches", () => {
    expect(keyNorm("Ann Lee <ANN@x.com>")).toBe("ann@x.com");
    const rows = [R("Ann Lee <ann@x.com>", "2026-03-01", "", 5), R("ann lee <ANN@X.COM>", "2026-03-09", "", 7)];
    const d = syncDerived(rows, derivedCfg, []);
    expect(d).toHaveLength(1); expect(d[0].hours).toBe(12);
  });
  it("calculates this-Epic percent and over-capacity from the manual capacity", () => {
    const d = syncDerived(sourceRows, derivedCfg, []);
    expect(d[0].capacity).toBe(160);                  // template default
    expect(d[0].epicshare).toBe(62.5);              // 100 / 160
    expect(d[0].overcapacity).toBe("No");
    d[0].capacity = 80;
    const again = syncDerived(sourceRows, derivedCfg, d);
    expect(again[0].epicshare).toBe(125); expect(again[0].overcapacity).toBe("Yes");
    again[0].capacity = 0;
    const zero = syncDerived(sourceRows, derivedCfg, again);
    expect(zero[0].epicshare).toBeNull(); expect(zero[0].overcapacity).toBe("Yes");      // no hours available but hours booked: the percentage is blank, over capacity is not
  });
  it("keeps manual capacity when source rows change, and is idempotent", () => {
    let d = syncDerived(sourceRows, derivedCfg, []);
    d[2].capacity = 120;
    const more = [...sourceRows, R("Ben Ray <ben@x.com>", "2026-03-30", "Vendor", 20)];
    d = syncDerived(more, derivedCfg, d);
    const ben = d.find(r => String(r.resource).startsWith("Ben"))!;
    expect(ben.hours).toBe(100); expect(ben.capacity).toBe(120); expect(ben.epicshare).toBe(83.3);
    expect(sameRows(d, syncDerived(more, derivedCfg, d))).toBe(true);
  });
  it("rows disappear when the source no longer has them, unless the manager entered capacity", () => {
    let d = syncDerived(sourceRows, derivedCfg, []);
    d.find(r => String(r.resource).startsWith("Ben"))!.capacity = 120;               // manual, but equal to nothing special: 120 != default 160
    const withoutBenAndApril = [sourceRows[0], sourceRows[1]];
    d = syncDerived(withoutBenAndApril, derivedCfg, d);
    expect(d.map(r => `${String(r.resource).split(" <")[0]}|${r.period}|${r.hours}|${r.capacity}`)).toEqual(["Ann Lee|2026-03|100|160", "Ben Ray|2026-03|0|120"]);
  });
  it("ignores source rows with no key value; unchanged config without keys returns existing", () => {
    expect(syncDerived([R("", "", "", 5)], derivedCfg, [])).toEqual([]);
    expect(syncDerived(sourceRows, { columns: [] }, [])).toEqual([]);
  });
  it("template columns validate cleanly", () => {
    expect(validateConfig(derivedCfg)).toEqual([]);
  });
});

import { makeCatalog, validateProject } from "../src/hub/validate";
import { emptyConfig } from "../src/core/types";

describe("hub validation of derived grids and calculated columns", () => {
  const cat = makeCatalog([{ referenceName: "Custom.TS", name: "TS", type: "plainText", readOnly: false }, { referenceName: "Custom.Cap", name: "Cap", type: "plainText", readOnly: false }], []);
  const project = (over: Partial<GridConfig> = {}) => {
    const x = emptyConfig();
    x.grids.Timesheet = { dataField: "Custom.TS", columns: [{ id: "res", name: "Resource", type: "identity" }, { id: "period", name: "Period", type: "date" }, { id: "h", name: "Hours", type: "number" }] };
    x.grids.Capacity = { derived: { source: "Timesheet" }, dataField: "Custom.Cap", allocation: capacityAllocation(), columns: capacityTemplate({ resource: "res", period: "period", hours: "h" }), ...over };
    return x;
  };
  const msgs = (x: ReturnType<typeof project>) => validateProject(x, cat).map(i => `${i.level}:${i.message}`).join("|");
  it("a good capacity grid has no issues", () => { expect(msgs(project())).toBe(""); });
  it("needs a data field, different from the source's, and a key", () => {
    expect(msgs(project({ dataField: undefined }))).toMatch(/needs its own data field/);
    expect(msgs(project({ dataField: "Custom.TS" }))).toMatch(/different data field/);
    const noKey = project(); noKey.grids.Capacity.columns = noKey.grids.Capacity.columns.map(c => (c.derive?.role === "key" ? { ...c, derive: undefined } : c));
    expect(msgs(noKey)).toMatch(/at least one column as a KEY/);
  });
  it("checks source grid and source columns", () => {
    expect(msgs(project({ derived: { source: "Nope" } }))).toMatch(/Source grid 'Nope' does not exist/);
    const bad = project(); bad.grids.Capacity.columns[0].derive!.source = "zzz";
    expect(msgs(bad)).toMatch(/'zzz' is not a column of 'Timesheet'/);
    const chain = project(); chain.grids.Timesheet.derived = { source: "Capacity" };
    expect(msgs(chain)).toMatch(/itself derived/);
  });
  it("checks calculated formulas: unknown columns and self reference", () => {
    const x = project(); x.grids.Capacity.columns.push({ id: "bad", name: "Bad", type: "calculated", formula: "hours / nope" }, { id: "self", name: "Self", type: "calculated", formula: "self + 1" });
    const m = msgs(x);
    expect(m).toMatch(/uses 'nope', which is not a column/); expect(m).toMatch(/refers to itself/);
  });
  it("warns when source settings are on a non-derived grid", () => {
    const x = project(); delete x.grids.Capacity.derived;
    expect(msgs(x)).toMatch(/not derived, so (it is|they are|nothing)|is ignored|are ignored|ignored/);
  });
});

import { readFileSync } from "node:fs";
import { resolvedGrids } from "../src/core/sharedLookups";

describe("shipped example", () => {
  const ex = JSON.parse(readFileSync("examples/sdlc-timesheet.json", "utf8"));
  it("validates structurally (no errors; field existence is checked live in the hub)", () => {
    const issues = validateProject(ex, makeCatalog([], []));
    expect(issues.filter(i => i.level === "error").map(i => `${i.where}: ${i.message}`)).toEqual([]);
  });
  it("end to end: timesheet rows -> resource capacity rows -> capacity calculations", async () => {
    const { evaluateCalculations } = await import("../src/core/calc");
    const grids = resolvedGrids(ex);
    const ts = grids["SDLC Timesheet"], cap = grids["Resource Capacity"];
    const rows = [
      normalizeRow({ sdlcactivity: "Development and coding", team: "Engineering", resource: "Ann Lee <ann@x.com>", period: "2026-03-02", Hours: 100 }, ts),
      normalizeRow({ sdlcactivity: "Unit testing", team: "Engineering", resource: "Ann Lee <ann@x.com>", period: "2026-03-20", Hours: 80 }, ts),
      normalizeRow({ sdlcactivity: "Feasibility study", team: "Vendor", resource: "Vic Ray <vic@x.com>", period: "2026-03-05", Hours: 100 }, ts)];
    const register = { projectDefault: null, resources: { "ann@x.com": newRecord("Ann Lee <ann@x.com>", 160), "vic@x.com": newRecord("Vic Ray <vic@x.com>", 160) } };
    const derived = syncDerived(rows, cap, [], register);
    expect(derived.map(r => [String(r.resource).split(" <")[0], r.period, r.hours, r.capacity, r.epicshare, r.resourcetype])).toEqual([
      ["Ann Lee", "2026-03", 180, 160, 112.5, "Internal"], ["Vic Ray", "2026-03", 100, 160, 62.5, "External"]]);
    expect(derived[0].overcapacity).toBe("Yes"); expect(derived[1].overcapacity).toBe("No");
    const fields: Record<string, unknown> = { [ts.dataField!]: serialize(rows), [cap.dataField!]: serialize(derived) };
    const out = evaluateCalculations(ex.calculations, "Epic", f => fields[f], grids).changes;
    expect(out["Custom.TotalPlannedCapacity"]).toBe(320);
    expect(out["Custom.OverallUtilization"]).toBe(87.5);        // 280 / 320
    expect(out["Custom.PeakUtilization"]).toBe(112.5);
  });
});
