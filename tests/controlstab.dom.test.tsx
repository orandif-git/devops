// @vitest-environment jsdom
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";
vi.mock("../src/shared/ado", () => ({ getProject: () => Promise.resolve({ id: "P", name: "Proj" }), witClient: () => Promise.reject(new Error("no host")), listFields: () => Promise.resolve([]) }));
vi.mock("../src/shared/capacityStore", () => ({ listTeams: () => Promise.resolve([]) }));
vi.mock("../src/hub/GridsTab", () => ({ TeamChips: () => <div className="teams" />, PeopleList: () => <div className="people" /> }));
import { CommentOnlyTab } from "../src/hub/CommentOnlyTab";
import { ControlRule } from "../src/core/types";

describe("Controls tab", () => {
  it("adds any number of rules, switches the mode, adds and removes locked fields, and deletes a rule", () => {
    const host = document.createElement("div"); document.body.appendChild(host);
    let rules: ControlRule[] | undefined;
    const render = () => ReactDOM.render(<CommentOnlyTab value={rules} onChange={r => { rules = r; render(); }} />, host);
    act(() => { render(); });
    const add = () => act(() => { Simulate.click(Array.from(host.querySelectorAll("button")).find(b => b.textContent === "+ Add a rule")!); });
    add(); add(); add();
    expect(rules).toHaveLength(3);
    expect(rules!.map(r => r.name)).toEqual(["Rule 1", "Rule 2", "Rule 3"]);
    expect(rules![0]).toMatchObject({ mode: "lock", enabled: true, fields: [] });
    // the newest rule is open: add two fields to lock
    const input = () => host.querySelector('input[placeholder^="Field name"]') as HTMLInputElement;
    for (const f of ["Custom.Budget", "Custom.Owner"]) {
      act(() => { input().value = f; Simulate.change(input()); });
      act(() => { Simulate.click(Array.from(host.querySelectorAll("button")).find(b => b.textContent === "Add field")!); });
    }
    expect(rules![2].fields).toEqual(["Custom.Budget", "Custom.Owner"]);
    expect(host.textContent).toContain("Locks 2 field(s)");
    act(() => { Simulate.click(host.querySelector('[aria-label="Remove Custom.Owner"]')!); });
    expect(rules![2].fields).toEqual(["Custom.Budget"]);
    // switching to comments-only resets the list to the discussion field
    const radios = Array.from(host.querySelectorAll('input[type="radio"]')) as HTMLInputElement[];
    act(() => { Simulate.change(radios[1]); });
    expect(rules![2]).toMatchObject({ mode: "comments", fields: ["System.History"] });
    expect(host.textContent).toContain("Comments only");
    // delete one
    vi.spyOn(window, "confirm").mockReturnValue(true);
    act(() => { Simulate.click(host.querySelector("button.danger")!); });
    expect(rules).toHaveLength(2);
  });
});
