// @vitest-environment jsdom
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";
import { CapacityEditor } from "../src/capacity/CapacityEditor";
import { CapacityRecord, newRecord } from "../src/core/capacity";

vi.mock("azure-devops-extension-api/Identities", () => ({ IdentityServiceIds: { IdentityService: "x" } }));
vi.mock("azure-devops-extension-sdk", () => ({ getService: () => Promise.reject(new Error("no host")) }));
vi.mock("../src/shared/ado", () => ({ listPeople: () => Promise.resolve([]) }));

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

function setup(canEdit: boolean, initial: CapacityRecord[]) {
  const host = document.createElement("div"); document.body.appendChild(host);
  const saved: CapacityRecord[] = []; const removed: string[] = [];
  const api = { list: async () => initial, save: async (r: CapacityRecord) => { saved.push(r); }, remove: async (k: string) => { removed.push(k); } };
  const search = async () => [{ text: "Cy Doe <cy@x.com>", displayName: "Cy Doe", detail: "cy@x.com", kind: "user" as const }];
  act(() => { ReactDOM.render(<CapacityEditor api={api} canEdit={canEdit} actor="Mia Manager" projectId="p" search={search} download={() => undefined} reason={canEdit ? "ok" : "Read-only: not a member"} />, host); });
  return { host, saved, removed };
}

describe("Capacity editor", () => {
  const ann = { ...newRecord("Ann Lee <ann@x.com>", 160), overrides: { [`${new Date().getFullYear()}-03`]: 80 } };

  it("shows people with default and exception months; read-only for non-editors", async () => {
    const { host } = setup(false, [ann]);
    await act(async () => { await tick(); });
    expect(host.textContent).toContain("Ann Lee");
    expect(host.textContent).toContain("Read-only: not a member");
    const inputs = Array.from(host.querySelectorAll("tbody input")) as HTMLInputElement[];
    expect(inputs.every(i => i.disabled)).toBe(true);
    expect(host.querySelector(".addrow")).toBeNull();
    expect(host.textContent).not.toContain("Import");
  });

  it("editing a month saves an exception with an audit entry; clearing it falls back to the default", async () => {
    const { host, saved } = setup(true, [ann]);
    await act(async () => { await tick(); });
    const inputs = () => Array.from(host.querySelectorAll("tbody input")) as HTMLInputElement[];
    // inputs: [default, Jan..Dec]; April is index 4
    await act(async () => { const i = inputs()[4]; i.value = "40"; Simulate.blur(i); await tick(); });
    expect(saved).toHaveLength(1);
    expect(saved[0].overrides[`${new Date().getFullYear()}-04`]).toBe(40);
    expect(saved[0].updatedBy).toBe("Mia Manager");
    expect(saved[0].history![0].what).toMatch(/Ann Lee .*-04: default → 40/);
    await act(async () => { const i = inputs()[3]; i.value = ""; Simulate.blur(i); await tick(); });     // clear March exception
    expect(saved[1].overrides[`${new Date().getFullYear()}-03`]).toBeUndefined();
  });

  it("changing the default saves; invalid numbers are rejected without saving", async () => {
    const { host, saved } = setup(true, [ann]);
    await act(async () => { await tick(); });
    const def = host.querySelector("tbody input") as HTMLInputElement;
    await act(async () => { def.value = "abc"; Simulate.blur(def); await tick(); });
    expect(saved).toHaveLength(0); expect(host.textContent).toContain("Hours must be a number");
    await act(async () => { def.value = "150"; Simulate.blur(def); await tick(); });
    expect(saved[0].defaultHours).toBe(150);
  });

  it("adds a person picked from the directory and can remove one", async () => {
    const { host, saved, removed } = setup(true, [ann]);
    await act(async () => { await tick(); });
    const search = host.querySelector(".addrow input") as HTMLInputElement;
    await act(async () => { search.value = "cy"; Simulate.change(search); await tick(300); });
    await act(async () => { Simulate.mouseDown(document.querySelector(".idpop li")!); });
    const hours = host.querySelectorAll(".addrow input")[1] as HTMLInputElement;
    await act(async () => { hours.value = "120"; Simulate.change(hours); });
    await act(async () => { Simulate.click(host.querySelector(".addrow .primary")!); await tick(); });
    expect(saved[0]).toMatchObject({ key: "cy@x.com", defaultHours: 120 });
    expect(host.textContent).toContain("Cy Doe");
    await act(async () => { Simulate.click(host.querySelector("button.danger")!); await tick(); });
    expect(removed).toHaveLength(1);
  });
});
