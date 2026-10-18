// @vitest-environment jsdom
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";
import { Grid } from "../src/grid/Grid";
import { newRow, normalizeRow, recomputeAll, validateConfig } from "../src/core/gridModel";
import { GridConfig, GridRow } from "../src/core/types";

vi.mock("../src/shared/ado", () => ({ listPeople: () => Promise.resolve([{ displayName: "Ann", uniqueName: "ann@x.com", text: "Ann <ann@x.com>" }]) }));
vi.mock("azure-devops-extension-api/Identities", () => ({ IdentityServiceIds: { IdentityService: "x" } }));
vi.mock("azure-devops-extension-sdk", () => ({ getService: () => Promise.reject(new Error("no host")) }));

const cfg: GridConfig = {
  columns: [
    { id: "qty", name: "Qty", type: "number", defaultValue: 1, total: "sum" },
    { id: "price", name: "Price", type: "number" },
    { id: "amt", name: "Amount", type: "number", formula: "[qty]*[price]", total: "sum" },
    { id: "cat", name: "Cat", type: "dropdown", options: ["HW", "SW"] },
    { id: "item", name: "Item", type: "dropdown", dependsOn: { column: "cat", map: { HW: ["Laptop"], SW: ["IDE"] } } },
    { id: "who", name: "Who", type: "identity" },
  ],
};

function mount(initial: GridRow[]) {
  const host = document.createElement("div"); document.body.appendChild(host);
  let rows = initial;
  const render = () => ReactDOM.render(<Grid cfg={cfg} rows={rows} readOnly={false} projectId="p" busyChildren={false} status=""
    onChange={r => { rows = r; render(); }} onCreateChild={() => undefined} onCreateAllChildren={() => undefined} onImport={() => undefined} onExport={() => undefined} />, host);
  act(() => { render(); });
  return { host, get rows() { return rows; } };
}

describe("Grid component", () => {
  it("adds rows, recalculates formulas/totals and filters dependent options", () => {
    const m = mount([normalizeRow({ qty: 2, price: 5, cat: "HW", item: "Laptop" }, cfg)]);
    expect(m.host.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(m.host.querySelector("tfoot")!.textContent).toContain("10");           // Σ amount
    const selects = m.host.querySelectorAll("tbody select");
    const itemOpts = Array.from(selects[1].querySelectorAll("option")).map(o => o.textContent);
    expect(itemOpts).toEqual(["", "Laptop"]);                                     // only HW items offered
    act(() => { const s = selects[0] as HTMLSelectElement; s.value = "SW"; Simulate.change(s); });
    expect(m.rows[0].item).toBe("IDE");                                           // old value cleared, single option auto-selected
    const price = m.host.querySelectorAll("tbody input[type=number]")[1] as HTMLInputElement;
    act(() => { price.value = "7"; Simulate.change(price); });
    expect(m.rows[0].amt).toBe(14);
    act(() => { Simulate.click(m.host.querySelector("button.primary")!); });
    expect(m.rows).toHaveLength(2);
    expect(m.host.querySelector("tfoot")!.textContent).toBe("Σ 3Σ 14");           // qty 2+1, amount 14+0
    expect(newRow(cfg).qty).toBe(1);
  });
});

import { IdentityInput } from "../src/grid/IdentityInput";
import { identityLabel } from "../src/shared/identity";

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

describe("pristine rows", () => {
  it("do not show red cells until edited", () => {
    const req: GridConfig = { columns: [{ id: "a", name: "A", type: "string", required: true }, { id: "b", name: "B", type: "string", required: true }] };
    const host = document.createElement("div"); document.body.appendChild(host);
    let rows: GridRow[] = [];
    const render = () => ReactDOM.render(<Grid cfg={req} rows={rows} readOnly={false} projectId="p" busyChildren={false} status=""
      onChange={r => { rows = r; render(); }} onCreateChild={() => undefined} onCreateAllChildren={() => undefined} onImport={() => undefined} onExport={() => undefined} />, host);
    act(() => { render(); });
    act(() => { Simulate.click(host.querySelector("button.primary")!); });
    expect(host.querySelectorAll(".err-cell")).toHaveLength(0);                   // fresh row: calm
    expect(host.textContent).not.toContain("need attention");
    const a = host.querySelector("tbody input[type=text]") as HTMLInputElement;
    act(() => { a.value = "x"; Simulate.change(a); });
    expect(host.querySelectorAll(".err-cell")).toHaveLength(1);                   // edited row: remaining required cell flagged
  });
});

describe("IdentityInput", () => {
  it("searches the directory and picks a group or user", async () => {
    const host = document.createElement("div"); document.body.appendChild(host);
    const calls: string[] = []; let value = "";
    const search = async (q: string, groups: boolean) => { calls.push(`${q}|${groups}`); return [
      { text: "Ann Lee <ann@x.com>", displayName: "Ann Lee", detail: "ann@x.com", kind: "user" as const },
      { text: "[Corp]\\Finance Team", displayName: "Finance Team", detail: "Corp", kind: "group" as const }]; };
    const render = () => ReactDOM.render(<IdentityInput value={value} includeGroups projectId="p" search={search} onChange={v => { value = v; render(); }} />, host);
    act(() => { render(); });
    const input = host.querySelector("input") as HTMLInputElement;
    await act(async () => { input.value = "fin"; Simulate.change(input); await tick(300); });
    expect(calls).toEqual(["fin|true"]);
    const items = Array.from(document.querySelectorAll(".idpop li"));
    expect(items.map(i => i.textContent)).toEqual(["👤Ann Leeann@x.com", "👥Finance TeamCorp"]);
    await act(async () => { Simulate.mouseDown(items[1]); });
    expect(value).toBe("[Corp]\\Finance Team");
  });
  it("formats users and groups the way work item fields accept them", () => {
    expect(identityLabel({ displayName: "Ann", signInAddress: "ann@x.com", entityType: "User" })!.text).toBe("Ann <ann@x.com>");
    expect(identityLabel({ displayName: "Dev", principalName: "[Proj]\\Dev", entityType: "Group" })!.kind).toBe("group");
  });
});

describe("Import button", () => {
  const render = (c: GridConfig) => {
    const host = document.createElement("div");
    act(() => { ReactDOM.render(<Grid cfg={c} rows={[]} readOnly={false} projectId="p" busyChildren={false} status="" onChange={() => undefined} onCreateChild={() => undefined} onCreateAllChildren={() => undefined} onImport={() => undefined} onExport={() => undefined} />, host); });
    return Array.from(host.querySelectorAll("button")).map(b => b.textContent);
  };
  it("is hidden by default (export stays) and shown only when the grid allows it", () => {
    expect(render(cfg)).not.toContain("Import");
    expect(render(cfg)).toEqual(expect.arrayContaining(["CSV", "Excel", "+ Add row"]));
    expect(render({ ...cfg, allowImport: true })).toContain("Import");
  });
});

describe("hidden columns", () => {
  it("are not drawn (heading, cells, footer) but are still calculated and used by other columns", () => {
    const hcfg: GridConfig = { columns: [
      { id: "w", name: "Weight", type: "number", defaultValue: 5, total: "sum", hidden: true },
      { id: "s", name: "Scored", type: "calculated", formula: "w * 2", hidden: true },
      { id: "p", name: "Percent", type: "calculated", formula: "TOTAL(s) / TOTAL(w) * 100", decimals: 0 },
      { id: "a", name: "Assessment", type: "string", statusBands: { source: "p", ranges: [{ upTo: 150, label: "Low", color: "green" }, { upTo: null, label: "High", color: "red" }] } },
    ] };
    const host = document.createElement("div"); document.body.appendChild(host);
    let rows: GridRow[] = recomputeAll([normalizeRow({}, hcfg)], hcfg);
    const render = () => ReactDOM.render(<Grid cfg={hcfg} rows={rows} readOnly={false} projectId="p" busyChildren={false} status="" onChange={r => { rows = r; render(); }} onCreateChild={() => undefined} onCreateAllChildren={() => undefined} onImport={() => undefined} onExport={() => undefined} />, host);
    act(() => { render(); });
    const heads = Array.from(host.querySelectorAll("thead th")).map(h => h.textContent);
    expect(heads.join("|")).toContain("Percent"); expect(heads.join("|")).toContain("Assessment"); expect(heads.join("|")).not.toContain("Weight"); expect(heads.join("|")).not.toContain("Scored");
    expect(host.querySelectorAll("tbody tr:first-child td")).toHaveLength(4);                         // row number + the two shown columns + the row buttons
    expect(rows[0]).toMatchObject({ w: 5, s: 10, p: 200, a: "High" });                                  // hidden columns are still stored and feed the percent (10 / 5 * 100) and the status
    expect(host.querySelector("tbody")!.innerHTML).toMatch(/200/); expect(host.querySelector("tbody")!.innerHTML).toMatch(/High/);
  });
  it("a required hidden column that nobody can fill is reported", () => {
    expect(validateConfig({ columns: [{ id: "x", name: "X", type: "string", required: true, hidden: true }] })).toEqual(["Column 'x' is required but hidden, so nobody can fill it in"]);
    expect(validateConfig({ columns: [{ id: "x", name: "X", type: "number", hidden: true }] })).toEqual([]);
  });
});

describe("detail lines under a row", () => {
  it("open and close with the row expander, all at once, and the filter finds them", () => {
    const rows = [normalizeRow({ qty: 1, cat: "HW" }, cfg), normalizeRow({ qty: 2, cat: "SW" }, cfg)];
    const opened: number[] = [];
    const host = document.createElement("div"); document.body.appendChild(host);
    act(() => { ReactDOM.render(<Grid cfg={cfg} rows={rows} readOnly={false} projectId="p" busyChildren={false} status="" onChange={() => undefined} onCreateChild={() => undefined} onCreateAllChildren={() => undefined} onImport={() => undefined} onExport={() => undefined}
      details={{ label: "Other Epics this month", onOpen: id => opened.push(id), lines: r => (r.qty === 1 ? [{ id: 7, title: "Alpha launch", hours: 40, share: 27 }, { id: 9, title: "Beta", hours: 16, share: 11 }] : []) }} />, host); });
    const xp = host.querySelectorAll("button.xp");
    expect(xp).toHaveLength(1);                                                    // only the row that has other Epics
    expect(host.querySelector("tr.detail")).toBeNull();
    act(() => { Simulate.click(xp[0]); });
    expect(host.querySelector("tr.detail")!.textContent).toContain("Alpha launch");
    act(() => { Simulate.click(host.querySelector("tr.detail a")!); });
    expect(opened).toEqual([7]);
    act(() => { Simulate.click(host.querySelector('button[aria-label="Collapse all"]')!); });
    expect(host.querySelector("tr.detail")).toBeNull();
    act(() => { Simulate.click(host.querySelector('button[aria-label="Expand all"]')!); });
    expect(host.querySelectorAll("tr.detail")).toHaveLength(3);                          // two Epics and the total
    const q = host.querySelector('input[type="search"]') as HTMLInputElement;
    act(() => { Simulate.change(q, { target: { value: "beta" } } as never); });
    expect(host.querySelectorAll("tbody tr:not(.detail)")).toHaveLength(1);
  });
});
