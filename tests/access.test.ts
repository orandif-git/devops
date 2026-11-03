import { describe, expect, it } from "vitest";
import { accessProblems, AccessConfig, startPresetFor, AccessWho, asksBeforeDelete, cellFixed, isAccessAdmin, isMine, mayAdd, mayDelete, mayImport, mayMove, normAccess, ownerLocked, withOwner, withoutPreset } from "../src/core/access";
import { columnImpact, gridImpact, presetImpact } from "../src/core/impact";
import { newRow, normalizeRow } from "../src/core/gridModel";
import { normalizeGrid } from "../src/core/normalize";
import { presetRows } from "../src/core/presets";
import { Calculation, GridConfig, GridRow } from "../src/core/types";

const cfg: GridConfig = { columns: [{ id: "act", name: "Activity", type: "string" }, { id: "owner", name: "Owner", type: "string" }, { id: "hrs", name: "Hours", type: "number", total: "sum" }, { id: "cost", name: "Cost", type: "number", formula: "[hrs]*10" }] };
const me: AccessWho = { keys: ["ann@x.com", "ann a", "id-ann"], key: "ann@x.com", name: "Ann A" };
const row = (o: Partial<GridRow> = {}): GridRow => ({ _id: "r1", act: "", owner: "", hrs: null, cost: null, ...o });

describe("Rows & access settings", () => {
  it("keep only what differs from the default, and nothing at all when it is all default", () => {
    expect(normAccess(undefined)).toBeUndefined(); expect(normAccess({ allowAdd: true, confirmDelete: true, lockCells: "never", rowOwner: false, startPreset: " " })).toBeUndefined();
    expect(normAccess({ startPreset: " p1 ", allowAdd: false, allowDelete: false, allowMove: false, allowImport: false, confirmDelete: false, lockCells: "filled", rowOwner: true, admins: { teams: [{ id: "t1", name: "PMO" }, 5], people: ["Bob <bob@x.com>", "", 3] } }))
      .toEqual({ startPreset: "p1", allowAdd: false, allowDelete: false, allowMove: false, allowImport: false, confirmDelete: false, lockCells: "filled", rowOwner: true, admins: { teams: [{ id: "t1", name: "PMO" }], people: ["Bob <bob@x.com>"] } });
    expect(normAccess({ lockCells: "bogus" })).toBeUndefined();
  });
  it("everything is allowed and asked about by default", () => { for (const f of [mayAdd, mayDelete, mayMove, mayImport, asksBeforeDelete]) { expect(f(undefined)).toBe(true); expect(f({})).toBe(true); } expect(mayAdd({ allowAdd: false })).toBe(false); expect(asksBeforeDelete({ confirmDelete: false })).toBe(false); });
  it("a grid keeps its settings through the configuration clean-up, and drops empty ones", () => {
    expect(normalizeGrid({ ...cfg, access: { rowOwner: true } }).access).toEqual({ rowOwner: true }); expect("access" in normalizeGrid({ ...cfg, access: {} })).toBe(false);
  });
});

describe("Row owner", () => {
  const a: AccessConfig = { rowOwner: true };
  it("a row somebody else added is fixed for me; mine, and rows with no owner, are not", () => {
    expect(ownerLocked(row({ _by: "sam@x.com" }), a, me)).toBe(true); expect(ownerLocked(row({ _by: "Ann@X.com" }), a, me)).toBe(false); expect(ownerLocked(row(), a, me)).toBe(false);
    expect(isMine(row({ _by: "ann@x.com" }), me)).toBe(true); expect(isMine(row(), me)).toBe(false);
  });
  it("administrators can change every row, and the setting must be on", () => {
    expect(ownerLocked(row({ _by: "sam@x.com" }), a, { ...me, isAdmin: true })).toBe(false); expect(ownerLocked(row({ _by: "sam@x.com" }), {}, me)).toBe(false); expect(ownerLocked(row({ _by: "sam@x.com" }), undefined, me)).toBe(false);
  });
  it("until it is known who is looking, a row somebody added stays fixed", () => { expect(ownerLocked(row({ _by: "sam@x.com" }), a, undefined)).toBe(true); expect(ownerLocked(row(), a, undefined)).toBe(false); });
  it("a new row gets its owner and the time, only when the setting is on", () => {
    const t = new Date("2026-11-03T10:00:00Z");
    expect(withOwner(row(), a, me, t)).toMatchObject({ _by: "ann@x.com", _byName: "Ann A", _at: "2026-11-03T10:00:00.000Z" }); expect(withOwner(row(), {}, me, t)._by).toBeUndefined(); expect(withOwner(row(), a, undefined, t)._by).toBeUndefined();
  });
  it("the owner is kept when the rows are saved and read back", () => {
    const back = normalizeRow(JSON.parse(JSON.stringify(withOwner(newRow(cfg), a, me))), cfg); expect(back._by).toBe("ann@x.com"); expect(back._byName).toBe("Ann A"); expect(typeof back._at).toBe("string");
    expect(normalizeRow({ _by: 5, act: "x" }, cfg)._by).toBeUndefined();
  });
  it("administrators are the configured people and the members of the configured teams", () => {
    const adm: AccessConfig = { admins: { teams: [{ id: "t1", name: "PMO" }], people: ["Ann A <ann@x.com>"] } };
    expect(isAccessAdmin(adm, { keys: ["ann@x.com"], teamIds: [] })).toBe(true); expect(isAccessAdmin(adm, { keys: ["bob@x.com"], teamIds: ["t1"] })).toBe(true); expect(isAccessAdmin(adm, { keys: ["bob@x.com"], teamIds: [] })).toBe(false); expect(isAccessAdmin(undefined, { keys: ["ann@x.com"], teamIds: [] })).toBe(false);
  });
});

describe("Fixed cells", () => {
  const preset = (id = "p") => ({ id, name: "SDLC", columns: ["act", "hrs"], rows: [{ act: "Requirements", hrs: 16, owner: "ignored" }, { act: "Design" }] });
  it("a preset marks the cells it filled, and only those", () => {
    const rows = presetRows(preset(), cfg);
    expect(rows[0]._p).toEqual(["act", "hrs"]); expect(rows[0].owner).toBe(""); expect(rows[1]._p).toEqual(["act"]);   // owner is not a preset column; hours was not given for the second row
    expect(rows[0]._by).toBeUndefined();   // preset rows have no owner: everyone may fill them in
  });
  it("“cells the preset filled”: those cells are fixed, the blank ones are not", () => {
    const r = presetRows(preset(), cfg)[0], a: AccessConfig = { lockCells: "preset" };
    expect(cellFixed(r, "act", a, me)).toBe(true); expect(cellFixed(r, "hrs", a, me)).toBe(true); expect(cellFixed(r, "owner", a, me)).toBe(false);
    expect(cellFixed({ ...r, act: "" }, "act", a, me)).toBe(false);   // a cell that is empty is never fixed
  });
  it("“once it has a value”: a saved value is fixed, a value still being typed is not, and the preset's cells are fixed too", () => {
    const a: AccessConfig = { lockCells: "filled" }, saved = row({ act: "Build", owner: "" }), now = row({ act: "Build", owner: "Sam", hrs: 8 });
    expect(cellFixed(now, "act", a, me, saved)).toBe(true); expect(cellFixed(now, "owner", a, me, saved)).toBe(false); expect(cellFixed(now, "hrs", a, me, saved)).toBe(false);
    expect(cellFixed(now, "act", a, me, undefined)).toBe(false);                                   // no saved copy yet: nothing is fixed because of it
    expect(cellFixed({ ...now, _p: ["owner"] }, "owner", a, me, saved)).toBe(true);                // …but a preset cell is
    expect(cellFixed({ ...now, act: "" }, "act", a, me, saved)).toBe(false);                       // the value was cleared by an administrator earlier: blank cells are editable
  });
  it("never fixes anything by default, and administrators can always change", () => {
    const r = presetRows(preset(), cfg)[0];
    expect(cellFixed(r, "act", undefined, me)).toBe(false); expect(cellFixed(r, "act", { lockCells: "never" }, me)).toBe(false); expect(cellFixed(r, "act", { lockCells: "preset" }, { ...me, isAdmin: true })).toBe(false);
  });
  it("a copy of a row is a new row: it has none of the preset's cells", () => { expect(withoutPreset(presetRows(preset(), cfg)[0])._p).toBeUndefined(); });
  it("the preset's cell list survives saving and reading, and is ignored when it is not a list", () => {
    expect(normalizeRow(JSON.parse(JSON.stringify(presetRows(preset(), cfg)[0])), cfg)._p).toEqual(["act", "hrs"]); expect(normalizeRow({ _p: "act" }, cfg)._p).toBeUndefined();
  });
});

describe("Rows & access: checks that make no sense together", () => {
  it("tells when the starting preset is gone, when nothing could ever be added, and when fixed cells are set on a derived grid", () => {
    const g = (access: AccessConfig, over: Partial<GridConfig> = {}): GridConfig => ({ ...cfg, presets: [{ id: "p1", name: "SDLC", columns: [], rows: [] }], access, ...over });
    expect(accessProblems(g({ startPreset: "p1" }))).toEqual([]); expect(accessProblems(g({ startPreset: "gone" }))[0]).toMatch(/no longer exists/);
    expect(accessProblems(g({ allowAdd: false }))[0]).toMatch(/always be empty/); expect(accessProblems(g({ allowAdd: false, startPreset: "p1" }))).toEqual([]);
    expect(accessProblems(g({ lockCells: "preset" }, { derived: { source: "A" } }))[0]).toMatch(/source grids only/); expect(accessProblems({ ...cfg })).toEqual([]);
  });
});

describe("What deleting takes with it", () => {
  const calc = (grid: string, column: string): Calculation => ({ id: "c1", name: "Total hours", enabled: true, workItemTypes: [], inputs: [{ name: "H", source: { kind: "grid", grid, column, aggregate: "sum" } }], formula: "H", resultField: "X", onEmpty: "blank", onDivZero: "blank", mode: "always" });
  const grids: Record<string, GridConfig> = {
    Resources: { ...cfg, presets: [{ id: "p1", name: "SDLC", columns: ["act"], rows: [{ act: "a" }, { act: "b" }] }, { id: "p2", name: "Other", columns: [], rows: [] }], access: { startPreset: "p1" }, totals: [{ column: "hrs", aggregate: "sum", field: "F", label: "Sum of Hours" }], breakdowns: [{ by: "owner", column: "hrs", aggregate: "sum", label: "Hours by owner" }] },
    Monthly: { columns: [{ id: "h", name: "H", type: "number", derive: { role: "agg", source: "hrs", aggregate: "sum" } }], derived: { source: "Resources" } },
  };
  it("a grid: its columns and presets, the derived grids and calculations that use it", () => {
    expect(gridImpact({ grids, calculations: [calc("Resources", "hrs")] }, "Resources")).toEqual({ counts: ["4 columns", "2 presets"], usedBy: ["derived grid “Monthly”", "calculation “Total hours”"] });
    expect(gridImpact({ grids, calculations: [] }, "Monthly")).toEqual({ counts: ["1 column"], usedBy: [] });
  });
  it("a preset: its rows, and whether the grid starts with it", () => { expect(presetImpact(grids.Resources, "p1")).toEqual({ rows: 2, isStart: true }); expect(presetImpact(grids.Resources, "p2")).toEqual({ rows: 0, isStart: false }); });
  it("a column: the totals, breakdowns, formulas, derived grids and calculations that use it", () => {
    const hrs = grids.Resources.columns[2];
    expect(columnImpact({ grids, calculations: [calc("Resources", "Hours")] }, "Resources", hrs)).toEqual(["the total “Sum of Hours”", "the breakdown “Hours by owner”", "the formula in “Cost”", "the column “H” of derived grid “Monthly”", "the calculation “Total hours”"]);
    expect(columnImpact({ grids, calculations: [] }, "Resources", grids.Resources.columns[0])).toEqual([]);
  });
});

describe("The preset an empty grid starts with", () => {
  const st = { rows: 0, readOnly: false, derived: false, commentOnly: false, offered: [{ id: "p1" }] };
  it("is the chosen preset on an empty grid, new or existing work item", () => { expect(startPresetFor({ startPreset: "p1" }, st)).toBe("p1"); });
  it("is nothing when none is chosen, the grid has rows, it is read-only or derived, the person may only comment, or the preset is not offered on this work item", () => {
    expect(startPresetFor(undefined, st)).toBeUndefined(); expect(startPresetFor({}, st)).toBeUndefined();
    for (const over of [{ rows: 2 }, { readOnly: true }, { derived: true }, { commentOnly: true }, { offered: [{ id: "other" }] }, { offered: [] }]) expect(startPresetFor({ startPreset: "p1" }, { ...st, ...over })).toBeUndefined();
  });
});
