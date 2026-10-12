// @vitest-environment jsdom
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";
import { GridsTab } from "../src/hub/GridsTab";
import { Ctx } from "../src/hub/ui";
import { GridConfig } from "../src/core/types";

vi.mock("../src/shared/ado", () => ({ getProject: async () => ({ id: "p", name: "P" }), listPeople: async () => [] }));
vi.mock("../src/shared/capacityStore", () => ({ listTeams: async () => [{ id: "t1", name: "Finance" }] }));
vi.mock("azure-devops-extension-api/Identities", () => ({ IdentityServiceIds: { IdentityService: "x" } }));
vi.mock("azure-devops-extension-sdk", () => ({ getService: () => Promise.reject(new Error("no host")) }));

const wrap = (el: React.ReactElement) => <Ctx.Provider value={{ projectName: "P", types: [], fields: [], lookups: {}, setLookups: () => undefined }}>{el}</Ctx.Provider>;
function mount(el: React.ReactElement) { const host = document.createElement("div"); document.body.appendChild(host); act(() => { ReactDOM.render(wrap(el), host); }); return host; }

describe("Grids tab", () => {
  it("'Create a grid' from the next-step bar creates one grid and reports it handled", () => {
    const onChange = vi.fn(), handled = vi.fn();
    mount(<GridsTab grids={{}} onChange={onChange} issues={[]} focus={{ n: 1, create: true }} onFocusHandled={handled} />);
    expect(handled).toHaveBeenCalledWith(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(Object.keys(onChange.mock.calls[0][0])).toEqual(["Grid 1"]);
  });

  it("an unhandled focus opens the named section of the named grid", () => {
    const grids: Record<string, GridConfig> = { G: { dataField: "Custom.G", columns: [{ id: "a", name: "A", type: "string" }] } };
    vi.useFakeTimers();
    const host = mount(<GridsTab grids={grids} onChange={() => undefined} issues={[]} focus={{ n: 1, grid: "G", section: "review" }} onFocusHandled={() => undefined} />);
    act(() => { vi.advanceTimersByTime(400); });
    vi.useRealTimers();
    expect(host.querySelector("#sect-review .sect-body")).toBeTruthy();                       // the Approval section is open
  });

  it("moving a column keeps each column's own options (no stale text left in the input)", () => {
    const grids: Record<string, GridConfig> = { G: { dataField: "Custom.G", columns: [
      { id: "a", name: "A", type: "dropdown", options: ["a1", "a2"] }, { id: "b", name: "B", type: "dropdown", options: ["b1", "b2"] },
    ] } };
    let current = grids;
    const host = document.createElement("div"); document.body.appendChild(host);
    const render = () => ReactDOM.render(wrap(<GridsTab grids={current} onChange={g => { current = g; act(() => { render(); }); }} issues={[]} />), host);
    act(() => { render(); });
    const toggles = () => Array.from(host.querySelectorAll("table.cols button[title='Show settings'], table.cols button[title='Hide settings']")) as HTMLButtonElement[];
    act(() => { toggles().forEach(t => Simulate.click(t)); });                                 // open both settings panels
    const optionInputs = () => Array.from(host.querySelectorAll("table.cols input")).filter(i => /^[ab]\d/.test((i as HTMLInputElement).value)) as HTMLInputElement[];
    expect(optionInputs().map(i => i.value)).toEqual(["a1, a2", "b1, b2"]);
    act(() => { Simulate.click(host.querySelector("button[aria-label='Move column down']")!); });
    expect(current.G.columns.map(c => c.id)).toEqual(["b", "a"]);
    expect(optionInputs().map(i => i.value)).toEqual(["b1, b2", "a1, a2"]);                    // the inputs follow their columns
  });
});
