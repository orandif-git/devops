import { describe, expect, it } from "vitest";
import { createRequire } from "module";
import { compute } from "../src/core/calc";
import { evaluate, EvalAbort, FUNCTION_NAMES } from "../src/core/expr";
import { recomputeAll, validateConfig } from "../src/core/gridModel";
import { resolvedGrids } from "../src/core/sharedLookups";
import { Calculation, emptyConfig, GridConfig, GridRow, ProjectConfig } from "../src/core/types";
import { makeCatalog, validateProject } from "../src/hub/validate";

const { build, merge } = createRequire(import.meta.url)("../scripts/nfr-template.js") as { build(o?: unknown): { gridName: string; grid: GridConfig; lookups: ProjectConfig["lookups"]; calculations: Calculation[]; questions: { category: string; text: string; weight: number }[] }; merge(c: unknown, b: unknown): ProjectConfig };

describe("group totals in formulas", () => {
  const rows = [{ g: "A", v: 1 }, { g: "A", v: 2 }, { g: "B", v: 10 }, { g: "", v: 99 }];
  const cfg: GridConfig = { columns: [{ id: "g", name: "Group", type: "string" }, { id: "v", name: "Value", type: "number" }, { id: "t", name: "Total", type: "calculated", formula: "GROUPTOTAL(v, g)", onEmpty: "blank" }, { id: "s", name: "Share", type: "calculated", formula: "[Value] / GROUPTOTAL([Value], [Group]) * 100", decimals: 0, onDivZero: "blank" }, { id: "n", name: "Count", type: "calculated", formula: "GROUPCOUNT(v, g)" }] };
  const out = recomputeAll(rows.map((r, i) => ({ _id: String(i), ...r })) as GridRow[], cfg);
  it("totals a column over the rows that share this row's group value (by id or by [name])", () => {
    expect(out.map(r => r.t)).toEqual([3, 3, 10, null]);                           // an empty group has no group: blank
    expect(out.map(r => r.s)).toEqual([33, 67, 100, null]);
    expect(out.map(r => r.n)).toEqual([2, 2, 1, null]);
  });
  it("is a known function name and needs both columns", () => {
    expect(FUNCTION_NAMES).toContain("GROUPTOTAL");
    expect(() => evaluate("GROUPTOTAL(v)", () => 0)).toThrow();
    expect(() => evaluate("GROUPTOTAL(v, g)", () => { throw new EvalAbort("x"); })).toThrow(EvalAbort);
  });
});

describe("NFR Risk Assessment template", () => {
  const built = build();
  const cfg: ProjectConfig = { ...emptyConfig(), grids: { [built.gridName]: built.grid }, lookups: built.lookups };
  const grid = resolvedGrids(cfg)[built.gridName];
  const answers: Record<string, string> = {};
  built.questions.forEach((q, i) => { answers[q.text] = ["Yes", "Yes", "Yes", "NA", "High", "Yes", "No", "Yes", "NA", "Yes", "Yes"][i] ?? ""; });
  const rows = recomputeAll(built.questions.map((q, i) => ({ _id: String(i), classification: q.category, questions: q.text, answer: answers[q.text], justification: "" }) as GridRow), grid);
  const by = (cat: string) => rows.filter(r => r.classification === cat);

  it("has the 25 questions and the 285 total weight of the Excel template", () => {
    expect(built.questions).toHaveLength(25);
    expect(built.questions.reduce((a, q) => a + q.weight, 0)).toBe(285);
    expect(rows.reduce((a, r) => a + (r.weight as number), 0)).toBe(285);          // weights filled in from the mapping
  });
  it("scores Yes, Pending Validation and High with the question weight, NA and No with 0", () => {
    expect(by("Business Resilience").map(r => r.scored)).toEqual([5, 10, 20, 0]);
    expect(by("Customer Impact").map(r => r.scored)).toEqual([20, 15, 0, 15, 0, 15]);
    const pv = recomputeAll([{ _id: "1", classification: "Business Resilience", questions: built.questions[0].text, answer: "Pending Validation" }] as GridRow[], grid);
    expect(pv[0].scored).toBe(5);
  });
  it("rates every category like the spreadsheet: same label and colour on each row of the category", () => {
    expect(by("Business Resilience").map(r => r.categorypct)).toEqual([63.6, 63.6, 63.6, 63.6]);          // 35 of 55
    expect(by("Business Resilience").every(r => r.assessment === "Moderate High")).toBe(true);
    expect(by("Customer Impact").every(r => r.assessment === "Moderate High")).toBe(true);                // 65 of 85
    expect(by("Data Privacy / InfoSec").slice(0, 1).map(r => r.assessment)).toEqual(["Low"]);           // 20 of 80 answered so far
    const bands = grid.columns.find(c => c.id === "assessment")!.statusBands!.ranges;
    expect(bands.map(b => [b.upTo, b.label, b.color])).toEqual([[50, "Low", "green"], [62.5, "Moderate", "yellow"], [80, "Moderate High", "orange"], [null, "High", "red"]]);
  });
  it("is a valid grid and the project validates", () => {
    expect(validateConfig(grid)).toEqual([]);
    const withData = { ...cfg, grids: { [built.gridName]: { ...built.grid, dataField: "Custom.ProjectMaterialityRiskAssessment" } as GridConfig }, calculations: built.calculations };     // the data field comes from the existing grid when merged
    const issues = validateProject(withData, makeCatalog([], [], {}));
    expect(issues.filter(i => i.level === "error")).toEqual([]);
  });
  it("works out the overall score, rating and IFRM action", () => {
    const [pctCalc, rating, action] = built.calculations;
    const v = { ScoredWeight: 120, TotalWeight: 285 };
    expect(compute(pctCalc, v).value).toBe(42.1);
    expect(compute(rating, v).value).toBe("Low");
    expect(compute(rating, { ScoredWeight: 200, TotalWeight: 285 }).value).toBe("Moderate High");
    expect(compute(rating, { ScoredWeight: 250, TotalWeight: 285 }).value).toBe("High");
    expect(compute(action, { Rating: "Low" }).value).toBe("Out of NFR Scope");
    expect(compute(action, { Rating: "High" }).value).toBe("Full Risk Assessment");
    expect(compute(action, { Rating: "" }).value).toBe("");
  });
  it("can be given other Epic fields, limits and scoring answers", () => {
    const b = build({ fields: { rating: "Custom.Rating" }, limits: { low: 0.4 }, scoringAnswers: ["Yes"] });
    expect(b.calculations[1].resultField).toBe("Custom.Rating");
    expect(b.grid.columns.find(c => c.id === "scored")!.formula).toBe('IF(OR(answer = "Yes"), weight, 0)');
    expect(b.grid.columns.find(c => c.id === "assessment")!.statusBands!.ranges[0].upTo).toBe(40);
  });
});

describe("merging into an existing configuration", () => {
  const { grid } = build();
  const existing: ProjectConfig = {
    ...emptyConfig(),
    grids: {
      "SDLC Timesheet": { dataField: "Custom.ResourceAllocation", columns: [{ id: "hours", name: "Hours", type: "number" }], review: { statusColumn: "s" } } as unknown as GridConfig,
      "NFR Risk Assessment": { dataField: "Custom.ProjectMaterialityRiskAssessment", blockSave: true, columns: [{ id: "classification", name: "Material Classification", type: "dropdown", options: ["Business Resilience"] }, { id: "questions", name: "Q", type: "dropdown" }, { id: "answer", name: "Answer", type: "dropdown", options: ["Yes", "No", "NA"] }], totals: [] },
    },
    calculations: [{ id: "frztwbz5", name: "Capitalization%", enabled: true, workItemTypes: ["Epic"], inputs: [], formula: "1", resultField: "Custom.X" } as unknown as Calculation],
    rules: [{ id: "r1" } as never],
  };
  const merged = merge(existing, build());
  it("changes only the NFR grid, its mapping and its three calculations", () => {
    expect(merged.grids["SDLC Timesheet"]).toEqual(existing.grids["SDLC Timesheet"]);
    expect(merged.rules).toEqual(existing.rules);
    expect(merged.calculations.map(c => c.id)).toEqual(["frztwbz5", "nfr-score-pct", "nfr-rating", "nfr-action"]);
    expect(merged.calculations[0]).toEqual(existing.calculations[0]);
    expect(Object.keys(merged.lookups)).toEqual(["NFR question weights"]);
  });
  it("keeps the existing data field and settings and the existing column ids so filled-in rows stay valid", () => {
    const g = merged.grids["NFR Risk Assessment"] as GridConfig & { dataField: string };
    expect(g.dataField).toBe("Custom.ProjectMaterialityRiskAssessment"); expect(g.blockSave).toBe(true);
    expect(g.columns.slice(0, 3).map(c => c.id)).toEqual(["classification", "questions", "answer"]);
    expect(g.columns.map(c => c.id)).toEqual(grid.columns.map(c => c.id));
  });
  it("does not change its input and gives the same result when run twice", () => {
    const copy = JSON.parse(JSON.stringify(existing));
    merge(existing, build()); expect(existing).toEqual(copy);
    expect(merge(merged, build())).toEqual(merged);
  });
});
