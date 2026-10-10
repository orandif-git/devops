import { describe, expect, it } from "vitest";
import { calcRefs, compute, evaluateCalculations, gridFigure, orderCalculations, undefinedVariables } from "../src/core/calc";
import { extractRefs, checkFormula } from "../src/core/expr";
import { newRow, normalizeRow, serialize } from "../src/core/gridModel";
import { Calculation, GridConfig } from "../src/core/types";

const mk = (over: Partial<Calculation> = {}): Calculation => ({
  id: "c1", name: "Capitalization %", enabled: true, workItemTypes: [], resultField: "Custom.CapPct",
  formula: "CapexHours / TotalHours * 100", onEmpty: "blank", onDivZero: "blank", mode: "always", decimals: 2,
  inputs: [
    { name: "CapexHours", source: { kind: "field", field: "Custom.Capex" } },
    { name: "TotalHours", source: { kind: "field", field: "Custom.Total" } },
  ], ...over,
});

describe("formula variables", () => {
  it("accepts bare identifiers and finds them", () => {
    expect(extractRefs("CapexHours / TotalHours * 100 + ROUND(x, 1) + [Some Col]").sort()).toEqual(["CapexHours", "Some Col", "TotalHours", "x"]);
    expect(checkFormula("A / B * 100")).toBeNull();
  });
  it("reports undefined variables", () => { expect(undefinedVariables(mk({ formula: "CapexHours / Nope" }))).toEqual(["Nope"]); });
});

describe("compute – blank vs zero", () => {
  it("calculates the example and rounds", () => {
    expect(compute(mk(), { CapexHours: 30, TotalHours: 120 }).value).toBe(25);
    expect(compute(mk(), { CapexHours: 1, TotalHours: 3 }).value).toBe(33.33);
    expect(compute(mk({ decimals: 0 }), { CapexHours: 1, TotalHours: 3 }).value).toBe(33);
  });
  it("blank input -> blank result by default, with a reason", () => {
    const r = compute(mk(), { CapexHours: null, TotalHours: 100 });
    expect(r.value).toBeNull(); expect(r.reason).toMatch(/CapexHours/);
  });
  it("treat-as-zero at calculation level and per input override", () => {
    expect(compute(mk({ onEmpty: "zero" }), { CapexHours: null, TotalHours: 100 }).value).toBe(0);
    const c = mk(); c.inputs[0].onEmpty = "zero";
    expect(compute(c, { CapexHours: null, TotalHours: 100 }).value).toBe(0);      // optional input counts as 0
    expect(compute(c, { CapexHours: 5, TotalHours: null }).value).toBeNull();     // denominator still blank
    const d = mk({ onEmpty: "zero" }); d.inputs[1].onEmpty = "blank";
    expect(compute(d, { CapexHours: null, TotalHours: null }).value).toBeNull();  // per-input override beats default
  });
  it("division by zero: blank (default) or 0", () => {
    expect(compute(mk(), { CapexHours: 5, TotalHours: 0 })).toMatchObject({ value: null, reason: "division by zero" });
    expect(compute(mk({ onDivZero: "zero" }), { CapexHours: 5, TotalHours: 0 }).value).toBe(0);
  });
  it("a real 0 numerator is 0%, not blank", () => { expect(compute(mk(), { CapexHours: 0, TotalHours: 40 }).value).toBe(0); });
  it("text results pass through", () => {
    expect(compute(mk({ formula: 'IF(CapexHours > 10, "High", "Low")' }), { CapexHours: 11, TotalHours: 1 }).value).toBe("High");
  });
});

describe("grid figures with several conditions", () => {
  const g: GridConfig = { columns: [
    { id: "tr", name: "Treatment", type: "string" }, { id: "rt", name: "Resource type", type: "string" }, { id: "h", name: "Hours", type: "number" }] };
  const rows = [
    normalizeRow({ tr: "Capitalizable", rt: "Internal", h: 10 }, g), normalizeRow({ tr: "Capitalizable", rt: "Vendor", h: 6 }, g),
    normalizeRow({ tr: "capitalizable", rt: "Contractor", h: 4 }, g), normalizeRow({ tr: "Expense", rt: "Internal", h: 20 }, g)];
  it("ANDs the conditions, case-insensitively, any-of within a condition", () => {
    const f = (where: { column: string; values: string[] }[], aggregate: "sum" | "avg" | "count" = "sum") => gridFigure(rows, { kind: "grid", grid: "G", column: "h", aggregate, where });
    expect(f([{ column: "tr", values: ["Capitalizable"] }])).toBe(20);
    expect(f([{ column: "tr", values: ["Capitalizable"] }, { column: "rt", values: ["Internal"] }])).toBe(10);
    expect(f([{ column: "tr", values: ["Capitalizable"] }, { column: "rt", values: ["Vendor", "Contractor"] }])).toBe(10);
    expect(f([{ column: "tr", values: ["Nothing"] }])).toBe(0);
    expect(f([{ column: "tr", values: ["Nothing"] }], "avg")).toBeNull();
    expect(f([])).toBe(40);
  });
  it("end to end: capitalization % from a grid stored in a field", () => {
    const calc = mk({ resultField: "Custom.CapPct", formula: "Capex / Total * 100", inputs: [
      { name: "Capex", source: { kind: "grid", grid: "G", column: "h", aggregate: "sum", where: [{ column: "tr", values: ["Capitalizable"] }] } },
      { name: "Total", source: { kind: "grid", grid: "G", column: "h", aggregate: "sum" } }] });
    const fields: Record<string, unknown> = { "Custom.GridData": serialize(rows), "Custom.CapPct": null };
    const out = evaluateCalculations([calc], "Epic", f => fields[f], { G: { ...g, dataField: "Custom.GridData" } });
    expect(out.changes).toEqual({ "Custom.CapPct": 50 });       // 20 of 40
    expect(calcRefs([calc], { G: { ...g, dataField: "Custom.GridData" } }).sort()).toEqual(["Custom.CapPct", "Custom.GridData"]);
    void newRow;
  });
});

describe("evaluateCalculations", () => {
  const fields = (o: Record<string, unknown>) => (f: string) => o[f];
  it("returns only changed values (no endless write loop)", () => {
    const f = { "Custom.Capex": 30, "Custom.Total": 120, "Custom.CapPct": 25 };
    expect(evaluateCalculations([mk()], "Epic", fields(f), {}).changes).toEqual({});
    expect(evaluateCalculations([mk()], "Epic", fields({ ...f, "Custom.CapPct": "" }), {}).changes).toEqual({ "Custom.CapPct": 25 });
    expect(evaluateCalculations([mk()], "Epic", fields({ ...f, "Custom.CapPct": 99 }), {}).changes).toEqual({ "Custom.CapPct": 25 });
  });
  it("clears the result when inputs become blank", () => {
    expect(evaluateCalculations([mk()], "Epic", fields({ "Custom.Capex": 5, "Custom.Total": "", "Custom.CapPct": 12 }), {}).changes).toEqual({ "Custom.CapPct": null });
    expect(evaluateCalculations([mk()], "Epic", fields({ "Custom.Capex": 5, "Custom.Total": "", "Custom.CapPct": "" }), {}).changes).toEqual({});
  });
  it("whenEmpty mode never touches a filled field", () => {
    const f = { "Custom.Capex": 30, "Custom.Total": 120, "Custom.CapPct": 80 };
    expect(evaluateCalculations([mk({ mode: "whenEmpty" })], "Epic", fields(f), {}).changes).toEqual({});
    expect(evaluateCalculations([mk({ mode: "whenEmpty" })], "Epic", fields({ ...f, "Custom.CapPct": null }), {}).changes).toEqual({ "Custom.CapPct": 25 });
  });
  it("respects work item type and enabled flag", () => {
    const f = { "Custom.Capex": 30, "Custom.Total": 120, "Custom.CapPct": null };
    expect(evaluateCalculations([mk({ workItemTypes: ["Bug"] })], "Epic", fields(f), {}).changes).toEqual({});
    expect(evaluateCalculations([mk({ enabled: false })], "Epic", fields(f), {}).changes).toEqual({});
  });
  it("chains calculations in dependency order", () => {
    const a = mk({ id: "a", name: "A", resultField: "Custom.A", formula: "X * 2", inputs: [{ name: "X", source: { kind: "field", field: "Custom.X" } }] });
    const b = mk({ id: "b", name: "B", resultField: "Custom.B", formula: "A + 1", inputs: [{ name: "A", source: { kind: "field", field: "Custom.A" } }] });
    const out = evaluateCalculations([b, a], "Epic", fields({ "Custom.X": 5 }), {});      // listed in the wrong order on purpose
    expect(out.changes).toEqual({ "Custom.A": 10, "Custom.B": 11 });
  });
  it("detects cycles and skips them", () => {
    const a = mk({ id: "a", resultField: "Custom.A", formula: "B", inputs: [{ name: "B", source: { kind: "field", field: "Custom.B" } }] });
    const b = mk({ id: "b", resultField: "Custom.B", formula: "A", inputs: [{ name: "A", source: { kind: "field", field: "Custom.A" } }] });
    expect(orderCalculations([a, b]).cyclic.length).toBeGreaterThan(0);
    expect(evaluateCalculations([a, b], "Epic", fields({}), {}).changes).toEqual({});
    const self = mk({ resultField: "Custom.S", formula: "S + 1", inputs: [{ name: "S", source: { kind: "field", field: "Custom.S" } }] });
    expect(orderCalculations([self]).cyclic).toHaveLength(1);
  });
  it("numeric strings from fields are numbers", () => {
    expect(evaluateCalculations([mk()], "Epic", fields({ "Custom.Capex": "30", "Custom.Total": "1,200", "Custom.CapPct": null }), {}).changes).toEqual({ "Custom.CapPct": 2.5 });
  });
});

import { makeCatalog, validateProject } from "../src/hub/validate";
import { emptyConfig } from "../src/core/types";

describe("calculation validation in the hub", () => {
  const cat = makeCatalog([
    { referenceName: "Custom.Capex", name: "Capex", type: "double", readOnly: false },
    { referenceName: "Custom.Total", name: "Total", type: "double", readOnly: false },
    { referenceName: "Custom.CapPct", name: "Cap %", type: "double", readOnly: false },
    { referenceName: "Custom.Note", name: "Note", type: "html", readOnly: false },
  ], ["Epic"]);
  const cfgWith = (...c: Calculation[]) => { const x = emptyConfig(); x.calculations = c; return x; };
  const msgs = (c: Calculation[]) => validateProject(cfgWith(...c), cat).map(i => `${i.level}:${i.message}`).join("|");
  const base = (o: Partial<Calculation> = {}): Calculation => ({
    id: "1", name: "Cap %", enabled: true, workItemTypes: [], formula: "CapexHours / TotalHours * 100", resultField: "Custom.CapPct",
    onEmpty: "blank", onDivZero: "blank", mode: "always", inputs: [
      { name: "CapexHours", source: { kind: "field", field: "Custom.Capex" } }, { name: "TotalHours", source: { kind: "field", field: "Custom.Total" } }], ...o });
  it("accepts a correct calculation", () => { expect(msgs([base()])).toBe(""); });
  it("flags undefined variables, unknown / unsuitable fields, empty formula", () => {
    expect(msgs([base({ formula: "CapexHours / Nope" })])).toMatch(/'Nope', which is not defined/);
    expect(msgs([base({ resultField: "Custom.Missing" })])).toMatch(/does not exist/);
    expect(msgs([base({ resultField: "Custom.Note" })])).toMatch(/cannot hold a calculated result/);
    expect(msgs([base({ formula: "" })])).toMatch(/formula is empty/);
    expect(msgs([base({ formula: "CapexHours /" })])).toMatch(/Formula:/);
  });
  it("flags duplicate / reserved / unused inputs", () => {
    const c = base(); c.inputs.push({ name: "capexhours", source: { kind: "field", field: "Custom.Capex" } });
    expect(msgs([c])).toMatch(/used twice/);
    const r = base(); r.inputs[0].name = "ROUND";
    expect(msgs([r])).toMatch(/reserved function name/);
    expect(msgs([base({ formula: "CapexHours * 2" })])).toMatch(/'TotalHours' is not used/);
  });
  it("flags duplicate result targets, grid-total clashes and cycles", () => {
    expect(msgs([base(), base({ id: "2", name: "Other" })])).toMatch(/also written by calculation/);
    const x = cfgWith(base()); x.grids.G = { columns: [{ id: "h", name: "H", type: "number" }], totals: [{ column: "h", aggregate: "sum", field: "Custom.CapPct" }] };
    expect(validateProject(x, cat).map(i => i.message).join("|")).toMatch(/also written by a grid total/);
    const a = base({ id: "a", name: "A", resultField: "Custom.Total", formula: "CapexHours", inputs: [{ name: "CapexHours", source: { kind: "field", field: "Custom.CapPct" } }] });
    expect(msgs([base(), a])).toMatch(/Circular dependency/);
  });
  it("validates grid inputs", () => {
    const g = base({ formula: "Cap", inputs: [{ name: "Cap", source: { kind: "grid", grid: "Nope", column: "h", aggregate: "sum" } }] });
    expect(msgs([g])).toMatch(/grid 'Nope', which does not exist/);
    const x = cfgWith(base({ formula: "Cap", inputs: [{ name: "Cap", source: { kind: "grid", grid: "G", column: "h", aggregate: "sum", where: [{ column: "tr", values: ["Capital"] }] } }] }));
    x.grids.G = { dataField: "Custom.Note", columns: [{ id: "h", name: "H", type: "number" }, { id: "tr", name: "Treatment", type: "dropdown", options: ["Capitalizable", "Expense"] }] };
    expect(validateProject(x, cat).map(i => i.message).join("|")).toMatch(/'Capital' is not a value of 'Treatment'/);
  });
});
