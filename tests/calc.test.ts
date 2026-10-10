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

import { bucketValue, topGroup } from "../src/core/calc";

describe("Phase 2: top group by sum", () => {
  const g: GridConfig = { dataField: "Custom.G", columns: [
    { id: "team", name: "Team", type: "string" }, { id: "period", name: "Period", type: "date" },
    { id: "phase", name: "Phase", type: "string" }, { id: "tr", name: "Treatment", type: "string" }, { id: "h", name: "Hours", type: "number" }] };
  const R = (team: string, period: string, phase: string, tr: string, h: number | null) => normalizeRow({ team, period, phase, tr, h }, g);
  // Alpha 10+20=30, Beta 25+3=28, Gamma 5   |  by month: Jan 35, Feb 25, Apr 3  |  by phase: Build 35, SIT 25, UAT 3
  const rows = [
    R("Alpha", "2026-01-10", "Build", "Capitalizable", 10), R("Beta", "2026-01-20", "Build", "Expense", 25),
    R("Alpha", "2026-02-05", "SIT", "Capitalizable", 20), R("Gamma", "2026-02-07", "SIT", "Expense", 5),
    R("Beta", "2026-04-01", "UAT", "Capitalizable", 3)];
  const top = (o: Record<string, unknown> = {}, r = rows) => topGroup(r, { kind: "top", grid: "G", groupBy: "team", column: "h", aggregate: "sum", ...o } as never);
  it("returns the group with the greatest total, or its figure", () => {
    expect(top()).toBe("Alpha");
    expect(top({ return: "value" })).toBe(30);
    expect(top({ pick: "min" })).toBe("Gamma");
  });
  it("buckets dates into month / quarter / year", () => {
    expect(bucketValue("2026-02-05", "month")).toBe("2026-02");
    expect(bucketValue("2026-05-05", "quarter")).toBe("2026-Q2");
    expect(bucketValue("2026-05-05", "year")).toBe("2026");
    expect(bucketValue("2026-05-05", "day")).toBe("2026-05-05");
    expect(bucketValue("Build", "month")).toBe("Build");
    expect(top({ groupBy: "period", bucket: "month" })).toBe("2026-01");
    expect(top({ groupBy: "period", bucket: "month", return: "value" })).toBe(35);
    expect(top({ groupBy: "period", bucket: "quarter" })).toBe("2026-Q1");
  });
  it("applies filters first (peak team among Capitalizable only)", () => {
    expect(top({ where: [{ column: "tr", values: ["Expense"] }] })).toBe("Beta");        // Beta 25 vs Gamma 5
    expect(top({ groupBy: "phase", where: [{ column: "tr", values: ["Capitalizable"] }] })).toBe("SIT");   // SIT 20, Build 10, UAT 3
  });
  it("ties go to the alphabetically first group, regardless of row order", () => {
    const tie = [R("Zed", "2026-01-01", "", "", 5), R("Amy", "2026-01-01", "", "", 5)];
    expect(top({}, tie)).toBe("Amy"); expect(top({}, [...tie].reverse())).toBe("Amy");
  });
  it("blank when there is nothing to rank", () => {
    expect(top({}, [])).toBeNull();
    expect(top({}, [R("A", "2026-01-01", "", "", 0), R("B", "2026-01-01", "", "", null)])).toBeNull();   // max of 0 is no peak
    expect(top({ pick: "min" }, [R("A", "2026-01-01", "", "", 0)])).toBe("A");
    expect(top({ where: [{ column: "tr", values: ["Nope"] }] })).toBeNull();
    expect(top({ groupBy: "phase" }, [R("A", "2026-01-01", "", "", 4)])).toBeNull();                    // rows without a group value are ignored
  });
  it("end to end: text result written to a text field, cleared when data disappears", () => {
    const calc = mk({ id: "pt", name: "Peak Demand Team", formula: "Peak", resultField: "Custom.PeakDemandTeam", inputs: [
      { name: "Peak", source: { kind: "top", grid: "G", groupBy: "team", column: "h", aggregate: "sum" } }] });
    const f: Record<string, unknown> = { "Custom.G": serialize(rows), "Custom.PeakDemandTeam": "" };
    expect(evaluateCalculations([calc], "Epic", k => f[k], { G: g }).changes).toEqual({ "Custom.PeakDemandTeam": "Alpha" });
    f["Custom.PeakDemandTeam"] = "Alpha";
    expect(evaluateCalculations([calc], "Epic", k => f[k], { G: g }).changes).toEqual({});           // unchanged -> no write
    f["Custom.G"] = serialize([]);
    expect(evaluateCalculations([calc], "Epic", k => f[k], { G: g }).changes).toEqual({ "Custom.PeakDemandTeam": null });
  });
  it("works on a lookup-derived column (peak SDLC phase from activity)", () => {
    const g2: GridConfig = { dataField: "Custom.G", columns: [
      { id: "act", name: "Activity", type: "string" }, { id: "phase", name: "Phase", type: "string", lookup: { column: "act", map: { Coding: "Build", Testing: "SIT" } } }, { id: "h", name: "Hours", type: "number" }] };
    const r2 = [normalizeRow({ act: "Coding", h: 4 }, g2), normalizeRow({ act: "Testing", h: 9 }, g2)];
    expect(topGroup(r2, { kind: "top", grid: "G", groupBy: "phase", column: "h", aggregate: "sum" })).toBe("SIT");
  });
});

describe("Phase 2 validation", () => {
  const cat = makeCatalog([
    { referenceName: "Custom.G", name: "G", type: "plainText", readOnly: false },
    { referenceName: "Custom.PeakTeam", name: "Peak team", type: "string", readOnly: false },
    { referenceName: "Custom.PeakNum", name: "Peak num", type: "double", readOnly: false },
  ], []);
  const proj = (source: Record<string, unknown>, resultField: string) => {
    const x = emptyConfig();
    x.grids.G = { dataField: "Custom.G", columns: [{ id: "team", name: "Team", type: "string" }, { id: "p", name: "Period", type: "date" }, { id: "h", name: "Hours", type: "number" }, { id: "n", name: "Note", type: "string" }] };
    x.calculations = [{ id: "1", name: "Peak", enabled: true, workItemTypes: [], formula: "Peak", resultField, onEmpty: "blank", onDivZero: "blank", mode: "always",
      inputs: [{ name: "Peak", source: { kind: "top", grid: "G", groupBy: "team", column: "h", aggregate: "sum", ...source } as never }] }];
    return validateProject(x, cat).map(i => `${i.level}:${i.message}`).join("|");
  };
  it("accepts a good peak-team calculation", () => { expect(proj({}, "Custom.PeakTeam")).toBe(""); });
  it("rejects a text result into a numeric field, but not the figure", () => {
    expect(proj({}, "Custom.PeakNum")).toMatch(/returns a group name \(text\) but Custom.PeakNum is numeric/);
    expect(proj({ return: "value" }, "Custom.PeakNum")).toBe("");
  });
  it("flags missing group column, non-number value column, month bucket on non-date", () => {
    expect(proj({ groupBy: "" }, "Custom.PeakTeam")).toMatch(/pick the column to group by/);
    expect(proj({ column: "n" }, "Custom.PeakTeam")).toMatch(/'Note' is not a number column/);
    expect(proj({ bucket: "month" }, "Custom.PeakTeam")).toMatch(/only applies to date columns/);
    expect(proj({ groupBy: "p", bucket: "month" }, "Custom.PeakTeam")).toBe("");
  });
});

describe("calculation on a grid without a saved data field", () => {
  it("is reported as an error, not a warning", () => {
    const x = emptyConfig();
    x.grids.T = { columns: [{ id: "h", name: "H", type: "number" }] };            // no dataField in the definition
    x.calculations = [{ id: "1", name: "Total", enabled: true, workItemTypes: [], formula: "S", resultField: "Custom.R", onEmpty: "blank", onDivZero: "blank", mode: "always",
      inputs: [{ name: "S", source: { kind: "grid", grid: "T", column: "h", aggregate: "sum" } }] }];
    const issues = validateProject(x, makeCatalog([], []));
    expect(issues.find(i => /no data field saved/.test(i.message))?.level).toBe("error");
  });
});

import { explainCalculation } from "../src/core/calc";

describe("explainCalculation (hub: try on a real work item)", () => {
  const g: GridConfig = { dataField: "Custom.GridData", columns: [{ id: "tr", name: "T", type: "string" }, { id: "h", name: "H", type: "number" }] };
  const calc = mk({ formula: "Capex / Total * 100", resultField: "Custom.Pct", inputs: [
    { name: "Capex", source: { kind: "grid", grid: "G", column: "h", aggregate: "sum", where: [{ column: "tr", values: ["Capitalizable"] }] } },
    { name: "Total", source: { kind: "grid", grid: "G", column: "h", aggregate: "sum" } }] });
  const rows = serialize([normalizeRow({ tr: "Capitalizable", h: 30 }, g), normalizeRow({ tr: "Expense", h: 90 }, g)]);

  it("shows rows read, each input and the result", () => {
    const ex = explainCalculation(calc, f => ({ "Custom.GridData": rows, "Custom.Pct": "" } as Record<string, unknown>)[f], { G: g });
    expect(ex.grids[0]).toMatchObject({ name: "G", dataField: "Custom.GridData", rows: 2, raw: "ok" });
    expect(ex.inputs.map(i => [i.name, i.value])).toEqual([["Capex", 30], ["Total", 120]]);
    expect(ex.inputs[0].source).toMatch(/sum of h in G where tr in \[Capitalizable\]/);
    expect(ex.result.value).toBe(25);
  });
  it("explains the three classic failures", () => {
    const empty = explainCalculation(calc, () => undefined, { G: g });                     // rows not saved on this work item
    expect(empty.grids[0].raw).toBe("empty"); expect(empty.result).toMatchObject({ value: null, reason: "division by zero" });
    const junk = explainCalculation(calc, f => (f === "Custom.GridData" ? "hello" : undefined), { G: g });
    expect(junk.grids[0].raw).toBe("unreadable");
    const noField = explainCalculation(calc, () => rows, { G: { columns: g.columns } });   // data field missing in the saved grid definition
    expect(noField.grids[0]).toMatchObject({ dataField: undefined, rows: 0, raw: "empty" }); expect(noField.result.value).toBeNull();
  });
});
