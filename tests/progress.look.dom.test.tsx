// @vitest-environment jsdom
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("azure-devops-extension-sdk", () => ({ getHost: () => ({ isHosted: true, name: "org" }), getAccessToken: async () => "t", getExtensionContext: () => ({ publisherId: "pub", extensionId: "ext" }), getContributionId: () => "c", register: () => undefined, resize: () => undefined }));
vi.mock("azure-devops-extension-api", () => ({ CommonServiceIds: {} }));
import { ProgressControl } from "../src/progress/ProgressControl";
import { buildProgress, defaultProgress, normProgress, wordingProblems, WORDS } from "../src/core/progress";
import { evenStages } from "../planner/src/core/stages";

const stN = ["Development", "SIT", "UAT", "Deployment", "Live"];
const cfg = (o: object = {}) => normProgress({ enabled: true, goLiveField: "G", stages: { source: "field", field: "DS", stages: evenStages(stN), map: Object.fromEntries(stN.map(n => [n, n])), dates: { enabled: true, fallback: false, consistency: true, track: true, late: true, lateDays: 7, delivered: "", stages: {
  Development: { startMode: "field", start: "S0", endMode: "next" }, SIT: { startMode: "field", start: "S1", endMode: "next" }, UAT: { startMode: "field", start: "S2", endMode: "next" }, Deployment: { startMode: "field", start: "S3", endMode: "next" }, Live: { startMode: "field", start: "S4", endMode: "none" } } } }, ...o });
const T = Date.UTC(2026, 10, 3);
const f = { "System.WorkItemType": "Epic", "System.State": "Active", DS: "SIT", S0: "2026-09-01", S1: "2026-10-03", S2: "2026-11-03", S3: "2027-01-10", G: "2027-01-20" };
const build = (o: object = {}) => buildProgress({ settings: cfg(o), fields: f, today: T });
const hosts: HTMLElement[] = [];
const mount = (el: React.ReactElement) => { const h = document.createElement("div"); document.body.appendChild(h); hosts.push(h); act(() => { ReactDOM.render(el, h); }); return h; };
afterEach(() => { hosts.splice(0).forEach(h => { ReactDOM.unmountComponentAtNode(h); h.remove(); }); });
const look = (o: object = {}) => ({ design: "steps" as const, names: "name" as const, status: "right" as const, detail: "both" as const, ...o });

describe("look settings", () => {
  it("default to today's look and clean what is typed", () => {
    expect(defaultProgress()).toMatchObject({ design: "bar", names: "name", status: "right", detail: "both", words: {} });
    expect(normProgress({ design: "thick", names: "icon", status: "left", detail: "none" })).toMatchObject({ design: "thick", names: "icon", status: "left", detail: "none" });
    expect(normProgress({ design: "x", names: 3, status: "up", detail: "?", words: { next: " soon ", nope: "x", behind: "", since: 3 } })).toMatchObject({ design: "bar", names: "name", status: "right", detail: "both", words: { next: "soon" } });
  });
});

describe("wording", () => {
  it("uses the default sentences, so the text is unchanged", () => { const m = build(); if (m.kind !== "shown") throw 0; expect(m.label).toBe("Needs attention"); expect(m.text).toBe("one stage behind schedule"); expect(m.since).toBe("In SIT since 3 Oct (31 days)"); expect(m.finish).toBe("Go-live 20 Jan 2027 · 78 days left"); });
  it("uses the admin's sentences and status names", () => {
    const m = build({ words: { attention: "Behind plan", behind: "{count} late", since: "{stage} since {date} ({days} in)", finishLeft: "Live {golive}, {days} to go" } }); if (m.kind !== "shown") throw 0;
    expect(m.label).toBe("Behind plan"); expect(m.text).toBe("one stage late"); expect(m.since).toBe("SIT since 3 Oct (31 days in)"); expect(m.finish).toBe("Live 20 Jan 2027, 78 days to go");
  });
  it("drops the days from the time line when that is switched off, and falls back on an unknown placeholder", () => {
    const m = build({ showTime: false, words: { behind: "{oops} behind" } }); if (m.kind !== "shown") throw 0;
    expect(m.since).toBe("In SIT since 3 Oct"); expect(m.text).toBe("one stage behind schedule");
    expect(wordingProblems({ behind: "{oops} behind", next: "{next} in {days}" })).toHaveLength(1);
  });
  it("has a default for every sentence it can be asked for", () => { for (const [k, w] of Object.entries(WORDS)) expect(w.text, k).toBeTruthy(); });
});

describe("designs", () => {
  const m = build();
  it("steps: numbered circles, the done one ticked, the status pill on the right", () => {
    const h = mount(<ProgressControl model={m} look={look()} />);
    expect(h.querySelectorAll(".dp-stn")).toHaveLength(5); expect(h.querySelector(".dp-stn.done svg")).toBeTruthy(); expect(h.querySelector(".dp-stn.current .dp-circ")?.textContent).toBe("2");
    expect(h.querySelector(".dp-head")?.lastElementChild?.className).toBe("dp-pill"); expect(h.querySelector(".dp-pill")?.textContent).toContain("Needs attention");
  });
  it("compact and thick draw one part per stage, with the names as chosen", () => {
    const c = mount(<ProgressControl model={m} look={look({ design: "compact" })} />); expect(c.querySelectorAll(".dp-cs")).toHaveLength(5); expect(c.querySelector(".dp-clabs")?.textContent).toContain("Deployment");
    const t = mount(<ProgressControl model={m} look={look({ design: "thick", names: "current" })} />); const tk = Array.from(t.querySelectorAll(".dp-tk")).map(x => x.textContent); expect(tk).toEqual(["1", "SIT", "3", "4", "5"]);
    const n = mount(<ProgressControl model={m} look={look({ design: "compact", names: "none" })} />); expect(n.querySelector(".dp-clabs")).toBeNull();
  });
  it("hides the status and the detail lines, or moves the status to the left", () => {
    const h = mount(<ProgressControl model={m} look={look({ status: "hidden", detail: "golive" })} />); expect(h.querySelector(".dp-pill")).toBeNull(); expect(h.querySelector(".dp-foot")?.textContent).toContain("Go-live"); expect(h.querySelector(".dp-foot")?.textContent).not.toContain("In SIT");
    expect(mount(<ProgressControl model={m} look={look({ detail: "none" })} />).querySelector(".dp-foot")).toBeNull();
    expect(mount(<ProgressControl model={m} look={look({ status: "left" })} />).querySelector(".dp-head")?.firstElementChild?.className).toBe("dp-pill");
  });
  it("the bar stays the default, without a look", () => { expect(mount(<ProgressControl model={m} />).querySelector(".dp-track")).toBeTruthy(); });
});
