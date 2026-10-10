// @vitest-environment jsdom
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { describe, expect, it } from "vitest";
import { CalculationsTab } from "../src/hub/CalculationsTab";
import { Calculation } from "../src/core/types";

describe("Calculations tab", () => {
  it("creates a starter calculation and its Test panel shows blank / value / zero-division behaviour", () => {
    const host = document.createElement("div"); document.body.appendChild(host);
    let calcs: Calculation[] = [];
    const render = () => ReactDOM.render(<CalculationsTab calcs={calcs} grids={{}} issues={[]} onChange={c => { calcs = c; render(); }} />, host);
    act(() => { render(); });
    act(() => { Simulate.click(host.querySelector("button.primary")!); });
    expect(calcs).toHaveLength(1);
    expect(calcs[0].formula).toBe("CapexHours / TotalHours * 100");
    const boxes = () => Array.from(host.querySelectorAll(".card .card label.field input")) as HTMLInputElement[];
    const result = () => host.textContent!.match(/Result: ([^–]*)/)![1].trim();
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
