// @vitest-environment jsdom
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";
import { Grid } from "../src/grid/Grid";
import { AccessConfig, AccessWho } from "../src/core/access";
import { GridConfig, GridRow } from "../src/core/types";

vi.mock("../src/shared/ado", () => ({ listPeople: () => Promise.resolve([]) }));
vi.mock("azure-devops-extension-api/Identities", () => ({ IdentityServiceIds: { IdentityService: "x" } }));
vi.mock("azure-devops-extension-sdk", () => ({ getService: () => Promise.reject(new Error("no host")) }));

const cfg: GridConfig = { columns: [{ id: "act", name: "Activity", type: "string" }, { id: "owner", name: "Owner", type: "string" }, { id: "hrs", name: "Hours", type: "number" }] };
const me: AccessWho = { keys: ["ann@x.com"], key: "ann@x.com", name: "Ann A" };
const mk = (id: string, o: Partial<GridRow> = {}): GridRow => ({ _id: id, act: "", owner: "", hrs: null, ...o });
const presets = [{ id: "p1", name: "SDLC", count: 2 }];

function mount(initial: GridRow[], access?: AccessConfig, who: AccessWho | undefined = me, saved?: Map<string, GridRow>, extra: Partial<React.ComponentProps<typeof Grid>> = {}) {
  const host = document.createElement("div"); document.body.appendChild(host);
  let rows = initial; const changes: GridRow[][] = [];
  const render = () => ReactDOM.render(<Grid cfg={cfg} rows={rows} readOnly={false} projectId="p" busyChildren={false} status="" access={access ? { cfg: access, who, saved } : undefined}
    presetTools={{ presets, onLoad: () => [], canSave: false, onSave: () => undefined }} {...extra}
    onChange={r => { rows = r; changes.push(r); render(); }} onCreateChild={() => undefined} onCreateAllChildren={() => undefined} onImport={() => undefined} onExport={() => undefined} />, host);
  act(() => { render(); });
  return { host, get rows() { return rows; }, changes };
}
const btn = (host: HTMLElement, label: string) => host.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;
const text = (host: HTMLElement, label: string) => Array.from(host.querySelectorAll("button")).find(b => b.textContent?.trim().includes(label)) as HTMLButtonElement | undefined;
const input = (host: HTMLElement, rowIdx: number, colIdx: number) => host.querySelectorAll("tbody tr:not(.confirm)")[rowIdx].querySelectorAll("td")[colIdx + 1].querySelector("input,select") as HTMLInputElement;

describe("Deleting a row asks first", () => {
  it("the trash button opens a question that names the row; Cancel keeps it, Delete removes it", () => {
    const m = mount([mk("a", { act: "Requirements" }), mk("b", { act: "Design review" })], undefined);
    act(() => { Simulate.click(btn(m.host, "Delete row")!); });
    const ask = m.host.querySelector(".confirm [role=alertdialog]")!; expect(ask.textContent).toContain("Delete this row?"); expect(ask.textContent).toContain("“Requirements” will be removed from the grid."); expect(m.rows).toHaveLength(2);
    act(() => { Simulate.click(text(m.host, "Cancel")!); }); expect(m.host.querySelector(".confirm")).toBeNull(); expect(m.rows).toHaveLength(2);
    act(() => { Simulate.click(btn(m.host, "Delete row")!); }); act(() => { Simulate.click(text(m.host, "Delete")!); });
    expect(m.rows.map(r => r._id)).toEqual(["b"]); expect(m.host.querySelector(".confirm")).toBeNull();
  });
  it("Escape closes the question without deleting", () => {
    const m = mount([mk("a", { act: "x" })], undefined); act(() => { Simulate.click(btn(m.host, "Delete row")!); });
    act(() => { Simulate.keyDown(m.host.querySelector("[role=alertdialog]")!, { key: "Escape" }); }); expect(m.host.querySelector(".confirm")).toBeNull(); expect(m.rows).toHaveLength(1);
  });
  it("with “ask before deleting” off, the row goes at once", () => {
    const m = mount([mk("a", { act: "x" })], { confirmDelete: false }); act(() => { Simulate.click(btn(m.host, "Delete row")!); }); expect(m.rows).toHaveLength(0); expect(m.host.querySelector(".confirm")).toBeNull();
  });
  it("a row with nothing typed is still asked about, without a name", () => {
    const m = mount([mk("a")], undefined); act(() => { Simulate.click(btn(m.host, "Delete row")!); }); expect(m.host.querySelector("[role=alertdialog]")!.textContent).toContain("It will be removed from the grid.");
  });
});

describe("What people may do with rows", () => {
  it("by default: add, duplicate, move, delete, and load a preset", () => {
    const m = mount([mk("a", { act: "x" }), mk("b", { act: "y" })], undefined);
    expect(text(m.host, "Add row")).toBeDefined(); expect(btn(m.host, "Delete row")).not.toBeNull(); expect(btn(m.host, "Move up")).not.toBeNull(); expect(btn(m.host, "Duplicate row")).not.toBeNull(); expect(m.host.querySelector("select[title*=ready-made]")).not.toBeNull();
  });
  it("with Add, Delete, Move and Import off there are no such buttons, but the cells can still be filled in", () => {
    const m = mount([mk("a", { act: "x" })], { allowAdd: false, allowDelete: false, allowMove: false, allowImport: false });
    expect(text(m.host, "Add row")).toBeUndefined(); expect(btn(m.host, "Delete row")).toBeNull(); expect(btn(m.host, "Move up")).toBeNull(); expect(btn(m.host, "Duplicate row")).toBeNull(); expect(m.host.querySelector("select[title*=ready-made]")).toBeNull();
    act(() => { const i = input(m.host, 0, 1); Simulate.change(Object.assign(i, { value: "Sam" }), { target: i } as never); }); expect(m.rows[0].owner).toBe("Sam");
  });
  it("an empty grid that cannot get rows says so", () => { expect(mount([], { allowAdd: false }).host.textContent).toContain("No rows."); expect(mount([], { allowAdd: false }).host.textContent).not.toContain("click “Add row”"); });
  it("each switch is separate: only Delete off hides only the trash", () => {
    const m = mount([mk("a", { act: "x" })], { allowDelete: false }); expect(btn(m.host, "Delete row")).toBeNull(); expect(text(m.host, "Add row")).toBeDefined(); expect(btn(m.host, "Duplicate row")).not.toBeNull();
  });
});

describe("Fixed cells", () => {
  const preset = mk("a", { act: "Requirements", hrs: 16, _p: ["act", "hrs"] });
  it("cells the preset filled are disabled and grey; the others are editable", () => {
    const m = mount([preset], { lockCells: "preset" });
    expect(input(m.host, 0, 0).disabled).toBe(true); expect(input(m.host, 0, 0).className).toContain("fixed"); expect(input(m.host, 0, 2).disabled).toBe(true); expect(input(m.host, 0, 1).disabled).toBe(false); expect(input(m.host, 0, 1).className).not.toContain("fixed");
    expect(input(m.host, 0, 0).title).toBe("This value is fixed");
  });
  it("an administrator can change them", () => { expect(input(mount([preset], { lockCells: "preset" }, { ...me, isAdmin: true }).host, 0, 0).disabled).toBe(false); });
  it("“once it has a value”: a saved value is fixed, a typed one is not until it is saved", () => {
    const saved = new Map([["a", mk("a", { act: "Build" })]]);
    const m = mount([mk("a", { act: "Build", owner: "Sam" })], { lockCells: "filled" }, me, saved);
    expect(input(m.host, 0, 0).disabled).toBe(true); expect(input(m.host, 0, 1).disabled).toBe(false);
  });
  it("a fixed cell cannot be changed even by a direct change", () => {
    const m = mount([preset], { lockCells: "preset" }); act(() => { const i = input(m.host, 0, 0); i.disabled = false; Simulate.change(Object.assign(i, { value: "Hacked" }), { target: i } as never); }); expect(m.rows[0].act).toBe("Requirements");
  });
  it("nothing is fixed without the setting", () => { expect(input(mount([preset], {}).host, 0, 0).disabled).toBe(false); expect(input(mount([preset], undefined).host, 0, 0).disabled).toBe(false); });
});

describe("Row owner", () => {
  const mine = mk("a", { act: "Test plan", _by: "ann@x.com", _byName: "Ann A" }), theirs = mk("b", { act: "API tests", _by: "sam@x.com", _byName: "Sam" }), open = mk("c", { act: "Old row" });
  it("rows somebody else added are read-only with their name; mine and rows with no owner are editable", () => {
    const m = mount([mine, theirs, open], { rowOwner: true });
    expect(input(m.host, 0, 0).disabled).toBe(false); expect(input(m.host, 1, 0).disabled).toBe(true); expect(input(m.host, 1, 2).disabled).toBe(true); expect(input(m.host, 2, 0).disabled).toBe(false);
    const badges = Array.from(m.host.querySelectorAll(".badge.own")).map(b => b.textContent); expect(badges).toEqual(["You added this", "Added by Sam"]);
  });
  it("another person's row has no move, copy or delete buttons; mine has", () => {
    const rows = Array.from(mount([mine, theirs], { rowOwner: true }).host.querySelectorAll("tbody tr")).map(tr => ({ del: !!tr.querySelector("button[aria-label='Delete row']"), dup: !!tr.querySelector("button[aria-label='Duplicate row']"), up: !!tr.querySelector("button[aria-label='Move up']") }));
    expect(rows).toEqual([{ del: true, dup: true, up: true }, { del: false, dup: false, up: false }]);
  });
  it("an administrator can change everything", () => { const m = mount([theirs], { rowOwner: true }, { ...me, isAdmin: true }); expect(input(m.host, 0, 0).disabled).toBe(false); expect(btn(m.host, "Delete row")).not.toBeNull(); });
  it("a new row is stamped with who added it and shows “You added this”", () => {
    const m = mount([], { rowOwner: true }); act(() => { Simulate.click(text(m.host, "Add row")!); });
    expect(m.rows[0]).toMatchObject({ _by: "ann@x.com", _byName: "Ann A" }); expect(m.host.querySelector(".badge.own")!.textContent).toBe("You added this");
  });
  it("a copy of my row is mine; a copy of a preset row has no preset cells", () => {
    const m = mount([mk("a", { act: "x", _by: "ann@x.com", _byName: "Ann A", _p: ["act"] })], { rowOwner: true }); act(() => { Simulate.click(btn(m.host, "Duplicate row")!); });
    expect(m.rows).toHaveLength(2); expect(m.rows[1]._by).toBe("ann@x.com"); expect(m.rows[1]._p).toBeUndefined(); expect(m.rows[1]._id).not.toBe("a");
  });
  it("no row owner without the setting: nothing is stamped or labelled", () => {
    const m = mount([], {}); act(() => { Simulate.click(text(m.host, "Add row")!); }); expect(m.rows[0]._by).toBeUndefined(); expect(m.host.querySelector(".badge.own")).toBeNull();
  });
  it("until it is known who is looking, other people's rows stay fixed", () => { expect(input(mount([theirs], { rowOwner: true }, undefined).host, 0, 0).disabled).toBe(true); });
});

describe("Hiding the figures under the grid", () => {
  const withTotals = (extra: Partial<GridConfig> = {}): GridConfig => ({ ...cfg, totals: [{ column: "hrs", aggregate: "sum", field: "F1", label: "Sum of Score" }, { column: "hrs", aggregate: "max", field: "F2", label: "Biggest" }], breakdowns: [{ by: "act", column: "hrs", aggregate: "sum", label: "Hours by activity" }], ...extra });
  const render = (c: GridConfig) => { const host = document.createElement("div"); document.body.appendChild(host); act(() => { ReactDOM.render(<Grid cfg={c} rows={[mk("a", { act: "A", hrs: 3 }), mk("b", { act: "B", hrs: 5 })]} readOnly={false} projectId="p" busyChildren={false} status="" onChange={() => undefined} onCreateChild={() => undefined} onCreateAllChildren={() => undefined} onImport={() => undefined} onExport={() => undefined} />, host); }); return host; };
  it("shows every total and breakdown by default", () => { const h = render(withTotals()); expect(Array.from(h.querySelectorAll(".sum")).map(x => x.textContent)).toEqual(["Sum of Score 8", "Biggest 5", "Hours by activity: A 3B 5"]); });
  it("hides one total or one breakdown on its own", () => {
    const h = render(withTotals({ totals: [{ column: "hrs", aggregate: "sum", field: "F1", label: "Sum of Score", hidden: true }, { column: "hrs", aggregate: "max", field: "F2", label: "Biggest" }], breakdowns: [{ by: "act", column: "hrs", aggregate: "sum", label: "Hours by activity", hidden: true }] }));
    expect(Array.from(h.querySelectorAll(".sum")).map(x => x.textContent)).toEqual(["Biggest 5"]);
  });
  it("the grid switch hides all of them and the area under the grid disappears", () => { const h = render(withTotals({ hideFigures: true })); expect(h.querySelector(".sums")).toBeNull(); });
  it("hiding does not stop them being calculated and written: the values are still produced for their fields", async () => {
    const { mappedTotals } = await import("../src/core/gridModel");
    expect(mappedTotals([mk("a", { hrs: 3 }), mk("b", { hrs: 5 })], withTotals({ hideFigures: true }))).toEqual({ F1: 8, F2: 5 });
  });
});
