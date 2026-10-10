// @vitest-environment jsdom
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";
import { Grid } from "../src/grid/Grid";
import { newRow, normalizeRow } from "../src/core/gridModel";
import { GridConfig, GridRow } from "../src/core/types";

vi.mock("../src/shared/ado", () => ({ listPeople: () => Promise.resolve([{ displayName: "Ann", uniqueName: "ann@x.com", text: "Ann <ann@x.com>" }]) }));

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
    expect(m.rows[0].item).toBe("");                                              // invalid dependent cleared
    const price = m.host.querySelectorAll("tbody input[type=number]")[1] as HTMLInputElement;
    act(() => { price.value = "7"; Simulate.change(price); });
    expect(m.rows[0].amt).toBe(14);
    act(() => { Simulate.click(m.host.querySelector("button.primary")!); });
    expect(m.rows).toHaveLength(2);
    expect(m.host.querySelector("tfoot")!.textContent).toBe("Σ 3Σ 14");           // qty 2+1, amount 14+0
    expect(newRow(cfg).qty).toBe(1);
  });
});
