import { describe, expect, it } from "vitest";
import { dropDanglingColorRefs, renameColumn, renameInDerivedGrids } from "../src/core/columnOps";
import { validateConfig } from "../src/core/gridModel";
import { withReview } from "../src/core/review";
import { withSchedule } from "../src/core/schedule";
import { GridConfig } from "../src/core/types";

describe("column operations", () => {
  const g0: GridConfig = withReview(withSchedule({ columns: [
    { id: "act", name: "Activity", type: "string" },
    { id: "hrs", name: "Hours", type: "number", total: "sum" },
    { id: "dbl", name: "Double", type: "calculated", formula: "hrs * 2 + [hrs]" },
    { id: "ph", name: "Phase", type: "string", lookup: { column: "act", map: { A: "x" } } },
  ] }));
  const eff = g0.schedule!.effort;                      // withSchedule re-uses the existing number column
  g0.totals = [{ column: eff, aggregate: "sum", field: "Custom.X", where: { column: "act", values: ["A"] } }];
  g0.presets = [{ id: "p", name: "P", columns: ["act", eff], rows: [{ act: "A", [eff]: 1 }] }];
  it("renames a column and everything in the grid that points at it, keeping the grid valid", () => {
    const r = renameColumn(g0, "act", "activity");
    expect(r.columns.find(c => c.id === "ph")!.lookup!.column).toBe("activity");
    expect(r.totals![0].where!.column).toBe("activity");
    expect(r.presets![0].columns).toEqual(["activity", eff]);
    expect(r.presets![0].rows[0]).toEqual({ activity: "A", [eff]: 1 });
    expect(validateConfig(r).join("|")).toBe("");
    const e = renameColumn(g0, eff, "hoursworked");
    expect(e.schedule!.effort).toBe("hoursworked");
    expect(e.totals![0].column).toBe("hoursworked");
    expect(validateConfig(e).join("|")).toBe("");
    expect(renameColumn(g0, "hrs", "hours").columns.find(c => c.id === "dbl")!.formula).toBe("hours * 2 + [hours]");
  });
  it("refuses a rename onto an existing id or from a missing one", () => {
    expect(renameColumn(g0, "act", "hrs")).toBe(g0);
    expect(renameColumn(g0, "nope", "x")).toBe(g0);
  });
  it("derived grids keep reading the renamed source column", () => {
    const derived: GridConfig = { columns: [{ id: "h", name: "H", type: "number", derive: { role: "agg", source: "hrs" } }], derived: { source: "T" } };
    const out = renameInDerivedGrids({ T: g0, D: derived }, "T", "hrs", "hours");
    expect(out.D.columns[0].derive!.source).toBe("hours");
  });
  it("a row colour that points at a column that is no longer a status column is cleared", () => {
    const g: GridConfig = { rowColorBy: "st", columns: [{ id: "st", name: "St", type: "string" }, { id: "x", name: "X", type: "number", colorBy: "st" }] };
    const fixed = dropDanglingColorRefs(g);
    expect(fixed.rowColorBy).toBeUndefined();
    expect(fixed.columns[1].colorBy).toBeUndefined();
    expect(validateConfig(fixed)).toEqual([]);
    const ok: GridConfig = { rowColorBy: "st", columns: [{ id: "st", name: "St", type: "string", statusBands: { source: "x", ranges: [{ upTo: null, label: "a", color: "green" }] } }, { id: "x", name: "X", type: "number" }] };
    expect(dropDanglingColorRefs(ok)).toBe(ok);
  });
});
