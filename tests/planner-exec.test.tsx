// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
vi.mock("../src/shared/ado", () => ({ downloadFile: () => undefined, getProject: () => Promise.resolve({ id: "P", name: "Proj" }) }));
vi.mock("../planner/src/data/related", () => ({ loadRelated: () => Promise.resolve({ parent: undefined, children: [], related: [] }) }));
vi.mock("../planner/src/data/open", () => ({ openWorkItem: () => undefined }));
import { answer, interpret, mentions } from "../planner/src/core/ask";
import { buildExec } from "../planner/src/core/executive";
import { gridDoneOf, progressOf } from "../planner/src/core/progress";
import { normalizeSettings, validateExec } from "../planner/src/core/settings";
import { defaultSettings, EpicRecord } from "../planner/src/core/types";
import { ExecDashboard } from "../planner/src/exec/ExecDashboard";

const TODAY = new Date("2026-10-14T00:00:00Z");
const settings = normalizeSettings({
  epicStartField: "Custom.Start", epicTargetField: "Custom.GoLive",
  sources: [{ id: "g", name: "Tasks", dataField: "Custom.G", columns: { resource: "r", effort: "h", done: "d" } }],
  executive: { categoryFields: ["Custom.Type"], progress: [{ id: "a", kind: "percentField", field: "Custom.Pct" }, { id: "b", kind: "gridDone", sourceId: "g" }] },
});
const epic = (id: number, title: string, state: string, type: string, start: string, goLive: string, pct?: string): EpicRecord =>
  ({ id, title, state, type: "Epic", areaPath: "P\\Team", iterationPath: "P", changed: "", start, target: goLive, grids: {}, extra: { "Custom.Type": type, ...(pct !== undefined ? { "Custom.Pct": pct } : {}) } });
const epics = [
  epic(1, "Basel IV", "Active", "Regulatory", "2026-02-02", "2026-12-18", "62"),          // 80% of time, 62% done: forecast far after go-live
  epic(2, "GDPR", "Active", "Regulatory", "2026-01-12", "2026-11-27", "88"),              // on track
  epic(3, "Middleware", "Active", "Software upgrade", "2026-02-16", "2026-09-30", "90"),  // past go-live
  epic(4, "FATCA", "Closed", "Regulatory", "2026-01-05", "2026-09-25", "100"),
  epic(5, "PSD3", "New", "Regulatory", "2026-11-02", "2027-06-30"),
  epic(6, "Observability", "On Hold", "Software upgrade", "2026-05-04", "2026-12-11", "40"),
  epic(7, "Removed one", "Removed", "Software upgrade", "2026-05-04", "2026-12-11", "10"),
  epic(8, "No progress", "Active", "Security", "2026-08-01", "2027-03-01"),
  epic(9, "No date", "Active", "Security", "2026-08-01", ""),
];
const none = { records: [], hours: () => null, team: () => "" };
const build = () => buildExec({ epics, gridDone: {}, bookings: [], avail: none, settings, today: TODAY });
const by = (r: ReturnType<typeof build>, id: number) => r.rows.find(x => x.epic.id === id)!;

describe("executive status", () => {
  it("rates Epics from dates, state and progress, and explains why", () => {
    const r = build();
    expect(by(r, 1).status).toBe("red"); expect(by(r, 1).reasons.join(" ")).toMatch(/days after go-live/);
    expect(by(r, 2).status).toBe("green");
    expect(by(r, 3)).toMatchObject({ status: "red", late: true }); expect(by(r, 3).reasons[0]).toMatch(/Past its go-live date by 14 days/);
    expect(by(r, 4).status).toBe("done"); expect(by(r, 5).status).toBe("idle");
    expect(by(r, 6)).toMatchObject({ status: "red", hold: true });                         // on hold and far behind
    expect(by(r, 8).status).toBe("unknown"); expect(by(r, 9).status).toBe("unknown");
    expect(r.rows.some(x => x.epic.id === 7)).toBe(false); expect(r.ignored).toBe(1);       // Removed is left out
    expect(r.noGoLive).toBe(1);
  });
  it("counts people booked over capacity on an Epic this month as needing attention", () => {
    const avail = { records: [{ key: "ann", name: "Ann" }], hours: () => 100, team: () => "T" };
    const bookings = [{ epicId: 2, sourceId: "g", person: "ann", personName: "Ann", month: "2026-10", hours: 150 }];
    const r = buildExec({ epics, gridDone: {}, bookings, avail, settings, today: TODAY });
    expect(by(r, 2).status).toBe("amber"); expect(by(r, 2).over).toEqual(["Ann"]);
  });
  it("uses the area path when no category field is chosen", () => {
    const r = buildExec({ epics: [epics[1]], gridDone: {}, bookings: [], avail: none, settings: defaultWith(), today: TODAY });
    expect(r.rows[0].dims["System.AreaPath"]).toBe("Team");
  });
});
const defaultWith = () => normalizeSettings({ ...defaultSettings(), epicTargetField: "Custom.GoLive", epicStartField: "Custom.Start" });

describe("progress sources", () => {
  it("tries the sources in order and supports ratios and ticked grid rows", () => {
    const x = settings.executive;
    expect(progressOf(epics[0], x)).toEqual({ pct: 62, from: "Custom.Pct" });
    const g = gridDoneOf(JSON.stringify({ rows: [{ d: true, h: 10 }, { d: false, h: 30 }] }), settings.sources[0])!;
    expect(g).toMatchObject({ rows: 2, done: 1, weighted: true });
    expect(progressOf(epics[7], x, { g }, settings.sources)).toMatchObject({ pct: 25 });   // 10 of 40 hours ticked
    const r = normalizeSettings({ executive: { progress: [{ kind: "ratioFields", doneField: "A", totalField: "B" }] } }).executive;
    expect(progressOf({ ...epics[0], extra: { A: "30", B: "120" } }, r)!.pct).toBe(25);
    expect(progressOf({ ...epics[0], extra: { A: "30", B: "0" } }, r)).toBeUndefined();
  });
  it("counts rows without effort by number, and reads several tick spellings", () => {
    const g = gridDoneOf(JSON.stringify([{ d: "Yes" }, { d: "x" }, { d: "" }, { d: false }]), settings.sources[0])!;
    expect(g).toMatchObject({ rows: 4, done: 2, weighted: false });
    expect(gridDoneOf("{}", { ...settings.sources[0], columns: { resource: "r" } })).toBeUndefined();
  });
  it("is validated: needs a go-live date and complete sources", () => {
    expect(validateExec(defaultSettings())).toEqual(["Choose the go-live date field (or set the Epic target-date field)."]);
    expect(validateExec(settings)).toEqual([]);
    const bad = normalizeSettings({ epicTargetField: "A.B", executive: { progress: [{ kind: "gridDone" }, { kind: "ratioFields", doneField: "A.B" }], slipAmberDays: 40, slipRedDays: 30 } });
    expect(validateExec(bad).length).toBe(3);
  });
});

describe("asking questions", () => {
  const vocab = { "Custom.Type": ["Regulatory", "Software upgrade", "Security"] };
  it("matches words to values (prefixes, plurals) and to statuses", () => {
    expect(mentions(["reg", "rag"], "Regulatory")).toBe(true);
    expect(mentions(["software", "upgrades"], "Software upgrade")).toBe(true);
    expect(mentions(["software"], "Software upgrade")).toBe(false);
    const q = interpret("How many software upgrade projects are at risk?", vocab);
    expect(q).toMatchObject({ dims: { "Custom.Type": ["Software upgrade"] }, statuses: ["red"], counting: true, recognised: true });
    expect(interpret("Reg RAG", vocab)).toMatchObject({ dims: { "Custom.Type": ["Regulatory"] }, split: true });
    expect(interpret("what is late?", vocab).late).toBe(true);
    expect(interpret("banana", vocab).recognised).toBe(false);
  });
  it("answers from the data only", () => {
    const rows = build().rows;
    expect(answer(interpret("How many regulatory projects are red?", vocab), rows)).toBe("1 Regulatory Epic is at risk: Basel IV.");
    expect(answer(interpret("Software upgrade RAG", vocab), rows)).toBe("Software upgrade Epics: 2 at risk, 0 needs attention, 0 on track, 0 not assessed, 0 not started, 0 done (2 in total).");
    expect(answer(interpret("show security projects", vocab), rows)).toMatch(/^Showing 2 Security Epics/);
  });
});

describe("Executive dashboard page", () => {
  const loaded = { epics, bookings: [], gridDone: {}, avail: none, at: "", load: { ms: 10 } } as never;
  const mount = () => { const h = document.createElement("div"); document.body.appendChild(h); act(() => { ReactDOM.render(<ExecDashboard project={{ id: "P", name: "Proj" }} settings={settings} loaded={loaded} busy={false} error="" onReload={() => undefined} />, h); }); return h; };
  it("shows counts, filters by a status tile, answers a typed question as chips and opens details", () => {
    const h = mount();
    expect(h.querySelector(".ex-strip")!.textContent).toContain("Portfolio");
    expect(h.querySelectorAll("tr.ex-row")).toHaveLength(8);                                   // the Removed Epic is not listed
    const input = h.querySelector('input[aria-label="Ask the dashboard"]') as HTMLInputElement;
    act(() => { input.value = "How many regulatory projects are red?"; Simulate.change(input); });
    act(() => { Simulate.submit(h.querySelector("form")!); });
    expect(h.querySelector(".ex-answer")!.textContent).toContain("1 Regulatory Epic is at risk: Basel IV.");
    expect(h.querySelector(".ex-chips")!.textContent).toContain("Type: Regulatory");
    expect(h.querySelectorAll("tr.ex-row")).toHaveLength(1);
    act(() => { Simulate.click(h.querySelector("tr.ex-row")!); });
    expect(h.querySelector(".ex-panel")!.textContent).toContain("Why this status");
    act(() => { Simulate.click(Array.from(h.querySelectorAll(".ex-chips button")).find(b => b.textContent === "Clear all")!); });
    expect(h.querySelectorAll("tr.ex-row")).toHaveLength(8);
  });
});

import { ago } from "../planner/src/exec/ago";
describe("refreshed label", () => {
  it("reads naturally", () => {
    const now = Date.parse("2026-10-14T12:00:00Z");
    expect(ago(now - 20_000, now)).toBe("just now");
    expect(ago(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(ago(now - 3 * 3600_000, now)).toBe("3 h ago");
    expect(ago(now - 30 * 3600_000, now)).toMatch(/\d/);
  });
});
