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

const stN = ["Development", "SIT", "UAT", "Deployment", "Live"];
const cfg2 = (o: object = {}): ProgressSettings => normProgress({ enabled: true, goLiveField: "G", stages: { source: "field", field: "DS", stages: evenStages(stN), map: Object.fromEntries(stN.map(n => [n, n])), dates: { enabled: true, fallback: false, consistency: true, track: true, late: true, lateDays: 7, delivered: "", stages: Object.fromEntries(stN.map((n, i) => [n, { startMode: "field", start: "S" + i, endMode: i < 4 ? "next" : "none" }])) } }, ...o });
const T2 = Date.UTC(2026, 10, 3);
const live = (f: Record<string, string>, state = "Active") => buildProgress({ settings: cfg2(), fields: { "System.WorkItemType": "Epic", "System.State": state, ...f }, today: T2 });
const green = { DS: "Development", S0: "2026-10-27", S1: "2026-12-02", S2: "2027-01-06", S3: "2027-02-03", G: "2027-01-20" };
const withWidth = (w: number, f: () => void) => { const real = HTMLElement.prototype.getBoundingClientRect; HTMLElement.prototype.getBoundingClientRect = function () { return { width: w, height: 40, top: 0, left: 0, right: w, bottom: 40, x: 0, y: 0, toJSON() { return {}; } } as DOMRect; }; try { f(); } finally { HTMLElement.prototype.getBoundingClientRect = real; } };

describe("Delivery Progress control", () => {
  it("draws nothing at all when it is off", () => {
    expect(mount(<ProgressControl model={{ kind: "hidden" } as ProgressModel} />).innerHTML).toBe("");
    expect(mount(<ProgressControl model={buildProgress({ settings: cfg2({ enabled: false }), fields: { "System.WorkItemType": "Epic", ...green }, today: T2 })} />).innerHTML).toBe("");
  });
  it("shows the bubble, one track part per stage, the marker with the icon of the stage, the stage names and the two lines", () => {
    const h = mount(<ProgressControl model={live(green)} />);
    expect(h.querySelector(".dp-bub")!.textContent).toBe("On track · SIT starts in 29 days"); expect(h.querySelector(".dp")!.className).toContain("dp-green");
    expect(h.querySelectorAll(".dp-seg")).toHaveLength(5); expect(h.querySelectorAll(".dp-lab .dp-nm")).toHaveLength(5); expect(Array.from(h.querySelectorAll(".dp-nm")).map(x => x.textContent)).toEqual(stN);
    expect(h.querySelector(".dp-knob")!.querySelector("svg")).not.toBeNull(); expect(h.querySelector(".dp-end")).not.toBeNull();   // the finish flag
    expect(Array.from(h.querySelectorAll(".dp-foot span")).map(x => x.textContent)).toEqual(["In Development since 27 Oct (7 days)", "Go-live 20 Jan 2027 · 78 days left"]);
    expect(h.querySelector(".dp-lab.current .dp-nm")!.textContent).toBe("Development"); expect(h.querySelector(".dp-due")).toBeNull();
    expect(h.querySelector(".dp")!.getAttribute("aria-label")).toBe("Delivery Progress: On track, SIT starts in 29 days. In Development since 27 Oct (7 days). Go-live 20 Jan 2027 · 78 days left");
    expect(h.querySelector("[role=tooltip]")).toBeNull();
  });
  it("amber and red: the colour class, and “Should be here” under the stage the dates say it should be in", () => {
    const amber = mount(<ProgressControl model={live({ DS: "SIT", S0: "2026-09-01", S1: "2026-10-03", S2: "2026-11-03", S3: "2027-01-10", G: "2027-01-20" })} />);
    expect(amber.querySelector(".dp")!.className).toContain("dp-amber"); expect(amber.querySelector(".dp-bub b")!.textContent).toBe("Needs attention");
    expect(amber.querySelector(".dp-lab.due em")!.textContent).toBe("Should be here"); expect(amber.querySelector(".dp-lab.due .dp-nm")!.textContent).toBe("UAT"); expect(amber.querySelector(".dp-due")).not.toBeNull();
    const red = mount(<ProgressControl model={live({ DS: "Development", S0: "2026-10-03", S1: "2026-10-10", S2: "2026-10-20", S3: "2026-11-01", G: "2026-12-16" })} />);
    expect(red.querySelector(".dp")!.className).toContain("dp-red"); expect(red.querySelector(".dp-bub")!.textContent).toBe("At risk · 3 stages behind schedule"); expect(red.querySelector(".dp-lab.due .dp-nm")!.textContent).toBe("Deployment");
  });
  it("delivered: every part of the track done, a tick in the marker, no finish flag", () => {
    const h = mount(<ProgressControl model={live({ DS: "Live", S0: "2026-08-01", S1: "2026-09-01", S2: "2026-10-01", S3: "2026-10-20", S4: "2026-11-01", G: "2026-11-20" }, "Closed")} />);
    expect(h.querySelector(".dp")!.className).toContain("dp-done"); expect(h.querySelectorAll(".dp-seg.done")).toHaveLength(5); expect(h.querySelector(".dp-end")).toBeNull();
    expect(h.querySelector(".dp-bub")!.textContent).toBe("Delivered · 19 days before go-live"); expect(Array.from(h.querySelectorAll(".dp-foot span")).map(x => x.textContent)).toEqual(["All 5 stages complete", "Delivered 1 Nov 2026"]);
  });
  it("shows the warnings below, and a note for a value that is not a stage", () => {
    const h = mount(<ProgressControl model={live({ DS: "UAT", S0: "2026-08-10", S1: "2026-07-27", S2: "2026-10-01" })} />); expect(h.querySelector(".dp-flag.r")!.textContent).toContain("SIT starts before the stage above it");
    expect(mount(<ProgressControl model={live({ DS: "Mystery" })} />).querySelector(".dp-note")!.textContent).toMatch(/Mystery/);
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

describe("Delivery Progress control: the layout keeps its shape", () => {
  it("keeps every stage name under its part of the track on a wide frame, and the lines in one row", () => {
    withWidth(900, () => { const h = mount(<ProgressControl model={live(green)} />); expect(h.querySelector(".dp-labels-one")).toBeNull(); expect(h.querySelectorAll(".dp-lab")).toHaveLength(5); expect(h.querySelector(".dp-bub")!.getAttribute("style")).toContain("left"); });
  });
  it("a frame too narrow for the names shows only the current stage name, under its part of the track, and the chip-free lines drop under each other", () => {
    const real = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => ({ font: "", measureText: (t: string) => ({ width: t.length * 7.5 }) })) as never;   // jsdom has no canvas: a stand-in that measures 7.5 px a letter
    try {
      withWidth(300, () => { const h = mount(<ProgressControl model={live(green)} />); expect(h.querySelector(".dp-labels-one")).not.toBeNull(); expect(h.querySelector(".dp-curlab")!.textContent).toBe("Development"); expect(h.querySelectorAll(".dp-lab")).toHaveLength(0); expect(h.querySelectorAll(".dp-seg")).toHaveLength(5); });
      withWidth(900, () => { const h = mount(<ProgressControl model={live(green)} />); expect(h.querySelector(".dp-labels-one")).toBeNull(); expect(h.querySelectorAll(".dp-lab")).toHaveLength(5); });
    } finally { HTMLCanvasElement.prototype.getContext = real; }
  });
  it("every long text has its whole text in a title, so cutting it with an ellipsis loses nothing", () => {
    const h = mount(<ProgressControl model={live(green)} />);
    expect(Array.from(h.querySelectorAll(".dp-foot span")).every(x => x.getAttribute("title") === x.textContent)).toBe(true); expect(Array.from(h.querySelectorAll(".dp-seg")).every(x => !!x.getAttribute("title"))).toBe(true);
  });
});
