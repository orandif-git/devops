// @vitest-environment jsdom
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";
vi.mock("../src/shared/ado", () => ({ witClient: () => Promise.reject(new Error("no host")), listFields: () => Promise.resolve([]) }));
import { CalculationsTab } from "../src/hub/CalculationsTab";
import { Calculation } from "../src/core/types";

describe("Calculations tab", () => {
  it("creates a starter calculation and its Test panel shows blank / value / zero-division behaviour", () => {
    const host = document.createElement("div"); document.body.appendChild(host);
    let calcs: Calculation[] = [];
    const render = () => ReactDOM.render(<CalculationsTab calcs={calcs} grids={{}} issues={[]} onUseDataField={() => undefined} onChange={c => { calcs = c; render(); }} />, host);
    act(() => { render(); });
    act(() => { Simulate.click(host.querySelector("button.primary")!); });
    expect(calcs).toHaveLength(1);
    expect(calcs[0].formula).toBe("CapexHours / TotalHours * 100");
    const boxes = () => Array.from(host.querySelectorAll(".card .card label.field input")) as HTMLInputElement[];
    const result = () => Array.from(host.querySelectorAll("div")).find(d => d.firstChild?.textContent?.startsWith("Result:"))!.querySelector("strong")!.textContent!.trim();
    expect(result()).toBe("(blank)");                                                  // nothing typed -> blank
    act(() => { boxes()[0].value = "30"; Simulate.change(boxes()[0]); });
    act(() => { boxes()[1].value = "120"; Simulate.change(boxes()[1]); });
    expect(result()).toBe("25");
    act(() => { boxes()[1].value = "0"; Simulate.change(boxes()[1]); });
    expect(host.textContent).toContain("division by zero");
    const sel = Array.from(host.querySelectorAll("select")).find(s => s.textContent?.includes("Result is 0")) as HTMLSelectElement;
    act(() => { sel.value = "zero"; Simulate.change(sel); });
    expect(result()).toBe("0");
  });
});

describe("Top group input editor", () => {
  it("switching an input to 'Top group' shows the group-by editor and the date bucket for date columns", () => {
    const host = document.createElement("div"); document.body.appendChild(host);
    const grids = { G: { dataField: "Custom.G", columns: [{ id: "team", name: "Team", type: "string" as const }, { id: "p", name: "Period", type: "date" as const }, { id: "h", name: "Hours", type: "number" as const }] } };
    let calcs: Calculation[] = [];
    const render = () => ReactDOM.render(<CalculationsTab calcs={calcs} grids={grids} issues={[]} onUseDataField={() => undefined} onChange={c => { calcs = c; render(); }} />, host);
    act(() => { render(); });
    act(() => { Simulate.click(host.querySelector("button.primary")!); });
    const kind = Array.from(host.querySelectorAll("select")).find(s => s.textContent?.includes("Top group")) as HTMLSelectElement;
    act(() => { kind.value = "top"; Simulate.change(kind); });
    const src = calcs[0].inputs[0].source;
    expect(src).toMatchObject({ kind: "top", grid: "G", pick: "max", return: "group" });
    expect(host.textContent).toContain("with the");
    expect(host.textContent).not.toContain("group dates by");
    const gb = Array.from(host.querySelectorAll("select")).find(s => s.previousElementSibling?.textContent === "the") as HTMLSelectElement;
    act(() => { gb.value = "p"; Simulate.change(gb); });
    expect(host.textContent).toContain("group dates by");
  });
});
