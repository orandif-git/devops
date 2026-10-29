// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
vi.mock("../src/shared/ado", () => ({ downloadFile: () => undefined, getProject: () => Promise.resolve({ id: "P", name: "Proj" }) }));
vi.mock("../src/shared/capacityStore", () => ({ listTeams: () => Promise.resolve([]) }));
vi.mock("../planner/src/data/fields", () => ({ listTypeFields: () => Promise.resolve([]), listFieldValues: () => Promise.resolve(["Design", "Build", "UAT"]), listStates: () => Promise.resolve([]) }));
vi.mock("../planner/src/data/sample", () => ({ sampleGrid: () => Promise.resolve(undefined) }));
import { SettingsTab } from "../planner/src/hub/SettingsTab";
import { normalizeSettings } from "../planner/src/core/settings";
import { defaultSettings } from "../planner/src/core/types";

describe("Settings sub menu", () => {
  it("separates general, Resource Planner and Executive Dashboard settings", async () => {
    const v = normalizeSettings({ ...defaultSettings(), executive: { enabled: true } });
    const h = document.createElement("div"); document.body.appendChild(h);
    await act(async () => { ReactDOM.render(<SettingsTab projectId="P" projectName="Proj" value={v} saved={v} busy={false} msg="" onChange={() => undefined} onSave={() => undefined} onDiscard={() => undefined} />, h); });
    const heads = () => Array.from(h.querySelectorAll("h3")).map(x => x.textContent);
    const tab = (n: string) => Array.from(h.querySelectorAll("[role=tab]")).find(b => b.textContent === n)!;
    expect(Array.from(h.querySelectorAll("[role=tab]")).map(b => b.textContent)).toEqual(["General", "Resource Planner", "Executive Dashboard"]);
    expect(heads()).toContain("Go-live history"); expect(heads()).not.toContain("Hours sources (grids)"); expect(heads()).not.toContain("Executive dashboard");
    act(() => { Simulate.click(tab("Resource Planner")); });
    expect(heads()).toContain("Hours sources (grids)"); expect(heads()).toContain("Epic Gantt grouping"); expect(heads()).not.toContain("Go-live history");
    act(() => { Simulate.click(tab("Executive Dashboard")); });
    expect(heads()).toContain("Executive dashboard"); expect(heads()).not.toContain("Hours sources (grids)");
    expect(tab("Executive Dashboard").getAttribute("aria-selected")).toBe("true");
  });
});

import { FieldPick } from "../planner/src/hub/SettingsTab";
describe("Field picker", () => {
  it("lets you choose from the list or type a reference name", () => {
    const got: string[] = [];
    const h = document.createElement("div"); document.body.appendChild(h);
    act(() => { ReactDOM.render(<FieldPick label="RAG" value="" fields={[{ referenceName: "Custom.Other", name: "Other", type: "string" }]} accept={() => true} placeholder="Custom.RAGStatus" onChange={v => got.push(v)} />, h); });
    const t = h.querySelector("input.refname") as HTMLInputElement; t.value = " Custom.RAGStatus ";
    act(() => { Simulate.blur(t); });
    expect(got).toEqual(["Custom.RAGStatus"]);
  });
});
