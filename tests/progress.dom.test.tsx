// @vitest-environment jsdom
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";
vi.mock("azure-devops-extension-sdk", () => ({ getHost: () => ({ isHosted: true, name: "org" }), getAccessToken: async () => "t", getExtensionContext: () => ({ publisherId: "pub", extensionId: "ext" }) }));
vi.mock("../src/shared/ado", () => ({ witClient: () => Promise.reject(new Error("no host")), listFields: () => Promise.resolve([]) }));
vi.mock("azure-devops-extension-api", () => ({ CommonServiceIds: {} }));
import { ProgressControl } from "../src/progress/ProgressControl";
import { ProgressTab } from "../src/hub/ProgressTab";
import { buildProgress, defaultProgress, normProgress, ProgressModel, ProgressSettings } from "../src/core/progress";
import { ProcessLayoutError, Rest } from "../src/shared/processLayout";
import { evenStages } from "../planner/src/core/stages";

const mount = (el: React.ReactElement) => { const host = document.createElement("div"); document.body.appendChild(host); act(() => { ReactDOM.render(el, host); }); return host; };
const names = ["Design", "Development", "SIT", "UAT", "Deployment"];
const cfg = (o: object = {}): ProgressSettings => normProgress({ enabled: true, stages: { source: "field", field: "Custom.DS", stages: evenStages(names), map: Object.fromEntries(names.map(n => [n, n])), dates: { enabled: true, fallback: false, consistency: true, track: true, late: true, lateDays: 7, delivered: "", stages: { Design: { startMode: "field", start: "Custom.A", endMode: "next" }, Development: { startMode: "field", start: "Custom.B", endMode: "next" }, SIT: { startMode: "field", start: "Custom.C", endMode: "next" }, UAT: { startMode: "field", start: "Custom.D", endMode: "none" }, Deployment: { startMode: "prev", endMode: "none" } } } }, ...o });
const model = (f: Record<string, string>, o: object = {}) => buildProgress({ settings: cfg(o), fields: { "System.WorkItemType": "Epic", "System.State": "Active", ...f }, today: Date.UTC(2026, 9, 31) });

describe("Delivery progress control", () => {
  it("draws nothing at all when it is off", () => {
    const h = mount(<ProgressControl model={{ kind: "hidden" } as ProgressModel} />); expect(h.innerHTML).toBe("");
    const off = mount(<ProgressControl model={model({}, { enabled: false })} />); expect(off.innerHTML).toBe("");
  });
  it("shows the steps, the days in the current stage and the dates of the current stage in a line under it, and those of the stage pointed at", () => {
    const h = mount(<ProgressControl model={model({ "Custom.DS": "UAT", "Custom.A": "2026-05-11", "Custom.B": "2026-06-29", "Custom.C": "2026-09-14", "Custom.D": "2026-10-19" })} />);
    expect(h.querySelectorAll(".dp-st")).toHaveLength(5); expect(h.textContent).toContain("12 d in UAT"); expect(h.querySelector(".dp-detail")!.textContent).toContain("UAT"); expect(h.querySelector(".dp-detail")!.textContent).toContain("Started 19 Oct 2026"); act(() => { Simulate.mouseEnter(h.querySelectorAll(".dp-st")[1]); }); expect(h.querySelector(".dp-detail")!.textContent).toContain("Started 29 Jun 2026"); act(() => { Simulate.mouseLeave(h.querySelectorAll(".dp-st")[1]); }); expect(h.querySelector(".dp-st.cur")?.textContent).toContain("UAT"); expect(h.querySelector(".dp-flags")).toBeNull();
  });
  it("flags dates that do not fit", () => {
    const h = mount(<ProgressControl model={model({ "Custom.DS": "SIT", "Custom.A": "2026-04-06", "Custom.B": "2026-06-08" })} />);
    expect(h.querySelector(".dp-chip.w")?.textContent).toContain("⚠"); expect(h.querySelector(".dp-st.bad")?.textContent).toContain("SIT"); expect(h.querySelector(".dp-flag")?.textContent).toMatch(/SIT/);
  });
  it("shows the delivered date for a delivered work item", () => {
    const m = buildProgress({ settings: cfg(), fields: { "System.WorkItemType": "Epic", "System.State": "Closed", "Custom.DS": "Deployment", "Custom.A": "2026-05-01", "Custom.B": "2026-06-01", "Custom.C": "2026-07-01", "Custom.D": "2026-08-01" }, today: Date.UTC(2026, 9, 31) });
    const h = mount(<ProgressControl model={m} />); expect(h.querySelectorAll(".dp-st.done")).toHaveLength(5); expect(h.querySelector(".dp-chip.g")?.textContent).toContain("Delivered");
  });
});

const fakeRest = (kind: "ok" | "system" | "denied" = "ok") => {
  const calls: string[] = []; let inLayout = false;
  const layout = () => ({ pages: [{ id: "pg", label: "Details", pageType: "custom", sections: [{ id: "S1", groups: inLayout ? [{ id: "g1", label: "Delivery progress", controls: [{ contribution: { contributionId: "pub.ext.delivery-progress" } }] }] : [{ id: "d", label: "Description" }] }] }] });
  const rest: Rest = {
    async get(p) { calls.push("GET " + p); if (p === "work/processes") return { value: [{ typeId: "pr", name: "Agile - Custom", customizationType: kind === "system" ? "system" : "inherited", projects: [{ id: "P", name: "Mine" }, { id: "Q", name: "Other" }] }] }; if (p.endsWith("/workItemTypes")) return { value: [{ referenceName: "My.Epic", name: "Epic" }] }; return layout(); },
    async send(m, p) { calls.push(m + " " + p); if (kind === "denied") throw new ProcessLayoutError("You need to be a Project Collection Administrator.", "permission"); if (m === "POST" && p.endsWith("/groups")) { inLayout = true; return { id: "g1" }; } if (m === "DELETE") inLayout = false; return {}; } };
  return { rest, calls };
};
const flush = async () => { for (let i = 0; i < 8; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)); }); };
const tab = (rest: Rest, p: ProgressSettings, spy: (v: ProgressSettings) => void) => mount(<ProgressTab projectId="P" progress={p} rest={rest} onChange={spy} />);
const click = (el: Element) => act(() => { Simulate.click(el); });

describe("Delivery progress settings tab", () => {
  it("is off by default and names the shared process and every project before it changes anything", async () => {
    const f = fakeRest(); const seen: ProgressSettings[] = []; const h = tab(f.rest, defaultProgress(), v => seen.push(v)); await flush();
    expect(h.textContent).toContain("Agile - Custom"); expect(h.textContent).toContain("Group is not in the layout");
    const sw = h.querySelector("input[role=switch]") as HTMLInputElement; expect(sw.checked).toBe(false);
    act(() => { Simulate.change(Object.assign(sw, { checked: true }), { target: sw } as never); }); sw.checked = true; act(() => { Simulate.change(sw); });
    const dlg = h.querySelector("[role=dialog]")!; expect(dlg.textContent).toContain("Agile - Custom"); expect(dlg.textContent).toContain("Mine, Other"); expect(dlg.textContent).toContain("2 projects");
    expect(f.calls.some(c => c.startsWith("POST"))).toBe(false); expect(seen).toHaveLength(0);
    const go = Array.from(dlg.querySelectorAll("button")).find(b => /Add to the layout/.test(b.textContent!))! as HTMLButtonElement; expect(go.disabled).toBe(true);
    const ack = dlg.querySelector("input[type=checkbox]") as HTMLInputElement; ack.checked = true; act(() => { Simulate.change(ack); }); expect(go.disabled).toBe(false);
    click(go); await flush();
    expect(f.calls.filter(c => c.startsWith("POST")).length).toBe(2); expect(seen.pop()).toMatchObject({ enabled: true, layout: { processId: "pr", groupId: "g1" } });
  });
  it("removes the group when it is turned off, keeping the settings", async () => {
    const f = fakeRest(); await f.rest.send("POST", "x/groups"); const seen: ProgressSettings[] = [];
    const h = tab(f.rest, cfg({ layout: { processId: "pr", processName: "Agile - Custom", groupId: "g1", at: "x" } }), v => seen.push(v)); await flush();
    expect(h.textContent).toContain("Group is in the layout");
    const sw = h.querySelector("input[role=switch]") as HTMLInputElement; sw.checked = false; act(() => { Simulate.change(sw); });
    const ack = h.querySelector("[role=dialog] input[type=checkbox]") as HTMLInputElement; ack.checked = true; act(() => { Simulate.change(ack); });
    click(Array.from(h.querySelectorAll("[role=dialog] button")).find(b => /Remove from the layout/.test(b.textContent!))!); await flush();
    expect(f.calls.some(c => c.startsWith("DELETE"))).toBe(true); const last = seen.pop()!; expect(last.enabled).toBe(false); expect(last.layout).toBeUndefined(); expect(last.stages.field).toBe("Custom.DS");
  });
  it("cannot change a system process and shows the manual steps", async () => {
    const h = tab(fakeRest("system").rest, defaultProgress(), () => undefined); await flush();
    expect((h.querySelector("input[role=switch]") as HTMLInputElement).disabled).toBe(true); expect(h.textContent).toContain("inherited processes only"); expect(h.textContent).toContain("Layout");
  });
  it("shows a clear message when the user may not change the layout, and keeps the switch off", async () => {
    const f = fakeRest("denied"); const seen: ProgressSettings[] = []; const h = tab(f.rest, defaultProgress(), v => seen.push(v)); await flush();
    const sw = h.querySelector("input[role=switch]") as HTMLInputElement; sw.checked = true; act(() => { Simulate.change(sw); });
    const ack = h.querySelector("[role=dialog] input[type=checkbox]") as HTMLInputElement; ack.checked = true; act(() => { Simulate.change(ack); });
    click(Array.from(h.querySelectorAll("[role=dialog] button")).find(b => /Add to the layout/.test(b.textContent!))!); await flush();
    expect(h.textContent).toContain("Project Collection Administrator"); expect(seen).toHaveLength(0);
  });
});
