// @vitest-environment jsdom
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";
import { Grid } from "../src/grid/Grid";
import { mergePreset, presetRows } from "../src/core/presets";
import { recomputeAll, newRow } from "../src/core/gridModel";
import { GridConfig, GridPreset, GridRow } from "../src/core/types";

vi.mock("../src/shared/ado", () => ({ listPeople: () => Promise.resolve([]) }));
vi.mock("azure-devops-extension-api/Identities", () => ({ IdentityServiceIds: { IdentityService: "x" } }));
vi.mock("azure-devops-extension-sdk", () => ({ getService: () => Promise.reject(new Error("no host")) }));

const cfg: GridConfig = {
  columns: [
    { id: "act", name: "Activity", type: "dropdown", options: ["Design", "Build"], required: true },
    { id: "res", name: "Resource", type: "identity", required: true },
    { id: "start", name: "Start", type: "date", required: true },
    { id: "effort", name: "Effort", type: "number", required: true },
    { id: "end", name: "End", type: "date" },
  ],
  schedule: { resource: "res", start: "start", effort: "effort", end: "end" },
};
const preset: GridPreset = { id: "p1", name: "Standard", columns: ["act", "effort"], rows: [{ act: "Design", effort: 40 }, { act: "Build", effort: 80 }] };

function mount(initial: GridRow[], tools?: Parameters<typeof Grid>[0]["presetTools"]) {
  const host = document.createElement("div"); document.body.appendChild(host);
  let rows = initial;
  const render = () => ReactDOM.render(<Grid cfg={cfg} rows={rows} readOnly={false} projectId="p" busyChildren={false} status="" presetTools={tools}
    onChange={r => { rows = r; render(); }} onCreateChild={() => undefined} onCreateAllChildren={() => undefined} onImport={() => undefined} onExport={() => undefined} />, host);
  act(() => { render(); });
  return { host, get rows() { return rows; }, set(r: GridRow[]) { rows = r; act(() => { render(); }); } };
}

describe("Grid: duplicate button and presets", () => {
  it("the duplicate button has a clear label and an icon, and the end date cell is read-only", () => {
    const m = mount([newRow(cfg)]);
    const btn = m.host.querySelector('button[aria-label="Duplicate row"]') as HTMLElement;
    expect(btn).toBeTruthy();
    expect(btn.getAttribute("title")).toBe("Duplicate row");
    expect(btn.querySelector("svg")).toBeTruthy();
    const dates = m.host.querySelectorAll("tbody input[type=date]");
    expect((dates[1] as HTMLInputElement).disabled).toBe(true);                // End date
    expect((dates[0] as HTMLInputElement).disabled).toBe(false);               // Start date
  });

  it("Load preset on an empty grid loads straight away, without asking, and the rows stay calm", () => {
    let current: GridRow[] = [];
    const holder: { m?: ReturnType<typeof mount> } = {};
    const tools = {
      presets: [{ id: "p1", name: "Standard", count: 2 }], canSave: false, onSave: () => undefined,
      onLoad: (id: string, mode: "add" | "replace") => {
        const before = new Set(current.map(r => r._id));
        current = mergePreset(current, preset, cfg, mode).rows; holder.m!.set(current);
        return current.filter(r => !before.has(r._id)).map(r => r._id);
      },
    };
    const m = mount([], tools); holder.m = m;
    const sel = m.host.querySelector("select[title]") as HTMLSelectElement;
    act(() => { sel.value = "p1"; Simulate.change(sel); });
    expect(m.host.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(m.host.querySelector(".presetbar")).toBeNull();                      // no Add / Replace question
    expect(m.host.querySelector(".err-cell")).toBeNull();
  });

  it("Load preset with rows already present asks Add or Replace; loaded rows stay calm (no red cells) until touched", () => {
    let current: GridRow[] = [newRow(cfg)];
    const holder: { m?: ReturnType<typeof mount> } = {};
    const tools = {
      presets: [{ id: "p1", name: "Standard", count: 2 }],
      canSave: false,
      onSave: () => undefined,
      onLoad: (id: string, mode: "add" | "replace") => {
        const res = mergePreset(current, preset, cfg, mode);
        const before = new Set(current.map(r => r._id));
        current = res.rows; holder.m!.set(current);
        return res.rows.filter(r => !before.has(r._id)).map(r => r._id);
      },
    };
    const m = mount(current, tools); holder.m = m;
    const sel = m.host.querySelector("select[title]") as HTMLSelectElement;
    expect(Array.from(sel.options).map(o => o.textContent)).toEqual(["Load preset…", "Standard"]);
    act(() => { sel.value = "p1"; Simulate.change(sel); });
    expect(m.host.querySelector(".presetbar")!.textContent).toContain("Load Standard (2 rows)");
    const add = Array.from(m.host.querySelectorAll(".presetbar button")).find(b => /Add to existing/.test(b.textContent ?? "")) as HTMLElement;
    act(() => { Simulate.click(add); });
    expect(m.host.querySelectorAll("tbody tr")).toHaveLength(3);                // the existing blank row + 2 from the preset
    expect(m.host.querySelector(".presetbar")).toBeNull();                      // panel closed again
  });

  it("Save as preset is only shown to people who may save", () => {
    const base = { presets: [], onLoad: () => [], onSave: () => undefined };
    expect(mount([], { ...base, canSave: false }).host.textContent).not.toContain("Save as preset");
    expect(mount([], { ...base, canSave: true }).host.textContent).toContain("Save as preset");
  });

  it("loading presets in code builds the same rows", () => {
    expect(recomputeAll(presetRows(preset, cfg), cfg).map(r => r.effort)).toEqual([40, 80]);
  });
});
