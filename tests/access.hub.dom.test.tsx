// @vitest-environment jsdom
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GridsTab } from "../src/hub/GridsTab";
import { Ctx } from "../src/hub/ui";
import { Calculation, GridConfig } from "../src/core/types";
import { makeCatalog, validateProject } from "../src/hub/validate";
import { emptyConfig } from "../src/core/types";

vi.mock("../src/shared/ado", () => ({ getProject: async () => ({ id: "p", name: "P" }), listPeople: async () => [] }));
vi.mock("../src/shared/capacityStore", () => ({ listTeams: async () => [{ id: "t1", name: "PMO" }] }));
vi.mock("azure-devops-extension-api/Identities", () => ({ IdentityServiceIds: { IdentityService: "x" } }));
vi.mock("azure-devops-extension-sdk", () => ({ getService: () => Promise.reject(new Error("no host")) }));

const wrap = (el: React.ReactElement) => <Ctx.Provider value={{ projectName: "P", types: [], fields: [], lookups: {}, setLookups: () => undefined }}>{el}</Ctx.Provider>;
const calc: Calculation = { id: "c1", name: "Total hours", enabled: true, workItemTypes: [], inputs: [{ name: "H", source: { kind: "grid", grid: "Resources", column: "hrs", aggregate: "sum" } }], formula: "H", resultField: "X", onEmpty: "blank", onDivZero: "blank", mode: "always" };
const grids = (): Record<string, GridConfig> => ({
  Resources: { dataField: "Custom.R", columns: [{ id: "act", name: "Activity", type: "string" }, { id: "hrs", name: "Hours", type: "number", total: "sum" }], totals: [{ column: "hrs", aggregate: "sum", field: "F", label: "Sum of Hours" }],
    presets: [{ id: "p1", name: "Standard SDLC", columns: ["act"], rows: [{ act: "a" }, { act: "b" }] }, { id: "p2", name: "Short", columns: ["act"], rows: [{ act: "c" }] }], access: { startPreset: "p1" } },
  Monthly: { dataField: "Custom.M", columns: [{ id: "h", name: "H", type: "number", derive: { role: "agg", source: "hrs", aggregate: "sum" } }], derived: { source: "Resources" } },
});
const hosts: HTMLElement[] = [];
afterEach(() => { for (const h of hosts) { ReactDOM.unmountComponentAtNode(h); h.remove(); } hosts.length = 0; });   // each test starts with a clean page
function mount(g: Record<string, GridConfig>, calcs: Calculation[] = [calc]) {
  const host = document.createElement("div"); document.body.appendChild(host); hosts.push(host); const calls: Record<string, GridConfig>[] = []; let cur = g;
  const render = () => ReactDOM.render(wrap(<GridsTab grids={cur} calcs={calcs} issues={[]} onChange={n => { calls.push(n); cur = n; act(() => { render(); }); }} />), host);
  act(() => { render(); });
  return { host, calls, get grids() { return cur; } };
}
const byText = (host: HTMLElement, t: string, root: ParentNode = document) => Array.from(root.querySelectorAll("button")).find(b => b.textContent?.trim() === t) as HTMLButtonElement | undefined;
const dialog = () => document.body.querySelector("[role=alertdialog]") as HTMLElement | null;

describe("Deleting in the settings asks first", () => {
  it("a grid: the dialog names what goes and what uses it; Cancel keeps it; Delete grid removes it", () => {
    const m = mount(grids());
    act(() => { Simulate.click(byText(m.host, "Delete")!); });
    const d = dialog()!; expect(d.textContent).toContain("Delete grid “Resources”?"); expect(d.textContent).toContain("Data already saved on work items is not deleted."); expect(d.textContent).toContain("2 columns"); expect(d.textContent).toContain("2 presets");
    expect(d.textContent).toContain("derived grid “Monthly”"); expect(d.textContent).toContain("calculation “Total hours”"); expect(m.calls).toHaveLength(0);
    act(() => { Simulate.click(byText(m.host, "Cancel", d)!); }); expect(dialog()).toBeNull(); expect(m.calls).toHaveLength(0);
    act(() => { Simulate.click(byText(m.host, "Delete")!); }); act(() => { Simulate.click(byText(m.host, "Delete grid", dialog()!)!); });
    expect(dialog()).toBeNull(); expect(Object.keys(m.calls[0])).toEqual(["Monthly"]);
  });
  it("Escape closes the question", () => { const m = mount(grids()); act(() => { Simulate.click(byText(m.host, "Delete")!); }); act(() => { Simulate.keyDown(dialog()!.parentElement!, { key: "Escape" }); }); expect(dialog()).toBeNull(); expect(m.calls).toHaveLength(0); });
  it("a column: names what uses it, and nothing is removed until Delete column", () => {
    const m = mount(grids());
    const del = Array.from(m.host.querySelectorAll("button[title='Delete column']"))[1] as HTMLButtonElement;   // Hours
    act(() => { Simulate.click(del); }); const d = dialog()!;
    expect(d.textContent).toContain("Delete column “Hours”?"); expect(d.textContent).toContain("the total “Sum of Hours”"); expect(d.textContent).toContain("derived grid “Monthly”"); expect(d.textContent).toContain("the calculation “Total hours”"); expect(m.calls).toHaveLength(0);
    act(() => { Simulate.click(byText(m.host, "Delete column", d)!); }); expect(m.calls[0].Resources.columns.map(c => c.id)).toEqual(["act"]);
  });
  it("a column nothing uses says nothing about use, and Cancel keeps it", () => {
    const m = mount(grids(), []); act(() => { Simulate.click(Array.from(m.host.querySelectorAll("button[title='Delete column']"))[0] as HTMLButtonElement); });
    expect(dialog()!.textContent).not.toContain("Used by"); act(() => { Simulate.click(byText(m.host, "Cancel", dialog()!)!); }); expect(m.calls).toHaveLength(0);
  });
  it("a preset: its rows, and a warning when the grid starts with it; deleting it makes the grid start blank", () => {
    const m = mount(grids()); window.dispatchEvent(new CustomEvent("wig-section", { detail: "presets" }));
    const del = byText(m.host, "Delete preset")!; act(() => { Simulate.click(del); });
    const d = dialog()!; expect(d.textContent).toContain("Delete preset “Standard SDLC”?"); expect(d.textContent).toContain("2 rows"); expect(d.textContent).toContain("the starting preset of this grid"); expect(m.calls).toHaveLength(0);
    act(() => { Simulate.click(byText(m.host, "Delete preset", d)!); });
    expect(m.calls[0].Resources.presets!.map(p => p.id)).toEqual(["p2"]); expect(m.calls[0].Resources.access).toBeUndefined();
  });
});

describe("Rows & access settings", () => {
  const open = (m: ReturnType<typeof mount>) => { window.dispatchEvent(new CustomEvent("wig-section", { detail: "access" })); return m.host.querySelector("#sect-access")!; };
  it("shows the six questions in plain words, and what is set in the header", () => {
    const m = mount(grids()); const sec = open(m);
    for (const t of ["Starting rows", "People can", "Fixed cells", "Row owner", "Administrators", "Delete confirmation"]) expect(sec.textContent).toContain(t);
    expect(sec.textContent).toContain("Applies to every work item whose grid is empty, new or existing."); expect(sec.textContent).toContain("starts with “Standard SDLC”");
  });
  it("switches: Add and Delete off, fixed cells, row owner, and the delete question are saved, and defaults are not stored", () => {
    const m = mount({ Resources: { ...grids().Resources, access: undefined } }); const sec = open(m);
    const box = (label: string) => Array.from(sec.querySelectorAll("label")).find(l => l.textContent?.includes(label))!.querySelector("input")! as HTMLInputElement;
    act(() => { Simulate.change(Object.assign(box("Add rows"), { checked: false }), { target: box("Add rows") } as never); }); expect(m.grids.Resources.access).toEqual({ allowAdd: false });
    act(() => { Simulate.change(Object.assign(box("Delete rows"), { checked: false }), { target: box("Delete rows") } as never); }); expect(m.grids.Resources.access).toEqual({ allowAdd: false, allowDelete: false });
    act(() => { Simulate.change(Object.assign(box("Add rows"), { checked: true }), { target: box("Add rows") } as never); }); expect(m.grids.Resources.access).toEqual({ allowDelete: false });
    const sel = sec.querySelector("select[aria-label='Fixed cells']") as HTMLSelectElement; act(() => { Simulate.change(Object.assign(sel, { value: "filled" }), { target: sel } as never); }); expect(m.grids.Resources.access).toEqual({ allowDelete: false, lockCells: "filled" });
    act(() => { Simulate.change(Object.assign(box("Only the person who added"), { checked: true }), { target: box("Only the person who added") } as never); }); expect(m.grids.Resources.access).toMatchObject({ rowOwner: true });
    act(() => { Simulate.change(Object.assign(box("Ask before deleting a row"), { checked: false }), { target: box("Ask before deleting a row") } as never); }); expect(m.grids.Resources.access).toMatchObject({ confirmDelete: false });
    act(() => { Simulate.change(Object.assign(sel, { value: "never" }), { target: sel } as never); }); expect(m.grids.Resources.access!.lockCells).toBeUndefined();
  });
  it("a tick lets the rules bind administrators too, and says why", () => {
    const m = mount({ Resources: { ...grids().Resources, access: { lockCells: "preset" } } }); const sec = open(m);
    const box = Array.from(sec.querySelectorAll("label")).find(l => l.textContent?.includes("Administrators can change fixed cells"))!.querySelector("input") as HTMLInputElement;
    expect(box.checked).toBe(true); expect(sec.textContent).toContain("If you test as an administrator, nothing looks fixed");
    act(() => { Simulate.change(Object.assign(box, { checked: false }), { target: box } as never); }); expect(m.grids.Resources.access).toEqual({ lockCells: "preset", adminsBypass: false }); expect(sec.textContent).toContain("Nobody can");
  });
  it("choosing a starting preset: the first preset is picked, another can be chosen, and Blank clears it", () => {
    const m = mount({ Resources: { ...grids().Resources, access: undefined } }); const sec = open(m);
    const radios = Array.from(sec.querySelectorAll("input[type=radio]")) as HTMLInputElement[];
    act(() => { Simulate.change(radios[1], { target: radios[1] } as never); }); expect(m.grids.Resources.access).toEqual({ startPreset: "p1" });
    const sel = sec.querySelector("select[aria-label='Starting preset']") as HTMLSelectElement; act(() => { Simulate.change(Object.assign(sel, { value: "p2" }), { target: sel } as never); }); expect(m.grids.Resources.access).toEqual({ startPreset: "p2" });
    act(() => { Simulate.change(radios[0], { target: radios[0] } as never); }); expect(m.grids.Resources.access).toBeUndefined();
  });
  it("without a preset the automatic choice is not offered", () => {
    const m = mount({ R: { ...grids().Resources, presets: undefined, access: undefined } }); const sec = open(m); expect((sec.querySelectorAll("input[type=radio]")[1] as HTMLInputElement).disabled).toBe(true); expect(sec.textContent).toContain("Create a preset first");
  });
  it("is not offered for a derived grid", () => { const m = mount(grids()); act(() => { Simulate.click(m.host.querySelectorAll(".list .item")[1]); }); expect(m.host.querySelector("#sect-access")).toBeNull(); });
});

describe("Rows & access in the checks", () => {
  it("a missing starting preset, and a grid that can never get rows, are reported against Rows & access", () => {
    const base = { ...emptyConfig(), grids: { G: { dataField: "Custom.G", columns: [{ id: "a", name: "A", type: "string" as const }], presets: [], access: { startPreset: "gone" } } } };
    const cat = makeCatalog([], []), issues = validateProject(base, cat); expect(issues.some(i => /Grid “G” › access/.test(i.where) && /no longer exists/.test(i.message))).toBe(true);
    const never = validateProject({ ...base, grids: { G: { ...base.grids.G, access: { allowAdd: false } } } }, cat); expect(never.some(i => /always be empty/.test(i.message))).toBe(true);
  });
});

describe("Hiding the figures: the settings", () => {
  it("a grid switch and a tick on each total and breakdown, saved as hideFigures and hidden", () => {
    const g: Record<string, GridConfig> = { R: { dataField: "Custom.R", columns: [{ id: "act", name: "Activity", type: "string" }, { id: "hrs", name: "Hours", type: "number" }], totals: [{ column: "hrs", aggregate: "sum", field: "F1" }], breakdowns: [{ by: "act", column: "hrs", aggregate: "sum" }] } };
    const m = mount(g, []); act(() => { window.dispatchEvent(new CustomEvent("wig-section", { detail: "totals" })); });
    const sec = m.host.querySelector("#sect-totals")!; const tick = (label: string, i = 0) => (Array.from(sec.querySelectorAll("label")).filter(l => l.textContent?.includes(label))[i].querySelector("input")) as HTMLInputElement;
    const set = (el: HTMLInputElement, v: boolean) => act(() => { Simulate.change(Object.assign(el, { checked: v }), { target: el } as never); });
    expect(tick("Show the totals and grouped totals").checked).toBe(true); expect(tick("Show under the grid", 0).checked).toBe(true);
    set(tick("Show under the grid", 0), false); expect(m.grids.R.totals![0].hidden).toBe(true); set(tick("Show under the grid", 0), true); expect(m.grids.R.totals![0].hidden).toBeUndefined();
    set(tick("Show under the grid", 1), false); expect(m.grids.R.breakdowns![0].hidden).toBe(true);
    set(tick("Show the totals and grouped totals"), false); expect(m.grids.R.hideFigures).toBe(true); expect(tick("Show under the grid", 0).disabled).toBe(true);
    set(tick("Show the totals and grouped totals"), true); expect(m.grids.R.hideFigures).toBeUndefined();
  });
});
