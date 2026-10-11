import { describe, expect, it } from "vitest";
import { defaultPresetColumns, mergePreset, presetApplies, presetFromRows, presetRows, upsertPreset } from "../src/core/presets";
import { GridConfig, GridPreset } from "../src/core/types";

const cfg: GridConfig = {
  columns: [
    { id: "act", name: "Activity", type: "dropdown", options: ["Design", "Build", "Test"] },
    { id: "phase", name: "Phase", type: "string", lookup: { column: "act", map: { Design: "D", Build: "B", Test: "T" } } },
    { id: "team", name: "Team", type: "dropdown", options: ["IT", "QA"] },
    { id: "res", name: "Resource", type: "identity" },
    { id: "start", name: "Start", type: "date" },
    { id: "alloc", name: "Allocation %", type: "number", defaultValue: 100 },
    { id: "effort", name: "Effort", type: "number" },
    { id: "end", name: "End", type: "date" },
  ],
  schedule: { resource: "res", start: "start", effort: "effort", allocation: "alloc", end: "end" },
};
const preset: GridPreset = {
  id: "p1", name: "Standard", columns: ["act", "team", "effort"],
  rows: [{ act: "Design", team: "IT", effort: 40 }, { act: "Build", team: "IT", effort: 80 }, { act: "Test", team: "QA", effort: 24 }],
};

describe("presets", () => {
  it("default kept columns: activity, team and effort (not people, dates, allocation or calculated ones)", () => {
    expect(defaultPresetColumns(cfg)).toEqual(["act", "team", "effort"]);
  });
  it("builds rows with calculated columns filled and the rest blank / default", () => {
    const rows = presetRows(preset, cfg);
    expect(rows.map(r => [r.act, r.phase, r.team, r.effort, r.res, r.start, r.alloc])).toEqual([
      ["Design", "D", "IT", 40, "", "", 100], ["Build", "B", "IT", 80, "", "", 100], ["Test", "T", "QA", 24, "", "", 100],
    ]);
    expect(new Set(rows.map(r => r._id)).size).toBe(3);
  });
  it("replace starts from the preset alone", () => {
    const existing = presetRows({ ...preset, rows: [{ act: "Test", team: "QA", effort: 1 }] }, cfg);
    const r = mergePreset(existing, preset, cfg, "replace");
    expect(r.rows).toHaveLength(3);
  });
  it("add skips rows that are already there, even after the user filled in more", () => {
    let rows = mergePreset([], preset, cfg, "add").rows;
    expect(rows).toHaveLength(3);
    rows = rows.map(r => (r.act === "Design" ? { ...r, res: "A <a@x.com>", start: "2026-11-02" } : r));
    const again = mergePreset(rows, preset, cfg, "add");
    expect(again.added).toBe(0);
    expect(again.skipped).toBe(3);
    expect(again.rows).toHaveLength(3);
  });
  it("add appends only the missing rows", () => {
    const first = mergePreset([], { ...preset, rows: preset.rows.slice(0, 1) }, cfg, "add").rows;
    const r = mergePreset(first, preset, cfg, "add");
    expect(r.added).toBe(2);
    expect(r.rows.map(x => x.act)).toEqual(["Design", "Build", "Test"]);
  });
  it("a preset may repeat a row on purpose", () => {
    const dup = { ...preset, rows: [preset.rows[0], preset.rows[0]] };
    expect(mergePreset([], dup, cfg, "add").rows).toHaveLength(2);
    expect(mergePreset(presetRows(dup, cfg).slice(0, 1), dup, cfg, "add").added).toBe(1);
  });
  it("rules: all conditions must match; no rule = always", () => {
    const get = (f: string) => ({ "Custom.ProjectType": "Implementation", "Custom.Customer": "Acme" } as Record<string, string>)[f];
    expect(presetApplies(preset, get)).toBe(true);
    expect(presetApplies({ ...preset, when: [{ field: "Custom.ProjectType", values: ["implementation", "Upgrade"] }] }, get)).toBe(true);
    expect(presetApplies({ ...preset, when: [{ field: "Custom.ProjectType", values: ["Upgrade"] }] }, get)).toBe(false);
    expect(presetApplies({ ...preset, when: [{ field: "Custom.ProjectType", values: ["Implementation"] }, { field: "Custom.Customer", values: ["Other"] }] }, get)).toBe(false);
  });
  it("saving rows as a preset keeps the chosen columns; saving again under the same name replaces it and keeps its rule", () => {
    const rows = presetRows(preset, cfg).map(r => ({ ...r, res: "A <a@x.com>" }));
    const made = presetFromRows(rows, cfg, "  Standard ");
    expect(made.name).toBe("Standard");
    expect(made.columns).toEqual(["act", "team", "effort"]);
    expect(made.rows[0]).toEqual({ act: "Design", team: "IT", effort: 40 });
    const list = upsertPreset([{ ...preset, when: [{ field: "F", values: ["x"] }] }], made);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("p1");
    expect(list[0].when).toEqual([{ field: "F", values: ["x"] }]);
    expect(upsertPreset(list, { ...made, name: "Other" })).toHaveLength(2);
  });
});
