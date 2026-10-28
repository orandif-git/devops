// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
vi.mock("../src/shared/ado", () => ({ downloadFile: () => undefined, getProject: () => Promise.resolve({ id: "P", name: "Proj" }) }));
vi.mock("../planner/src/data/related", () => ({ loadRelated: () => Promise.resolve({ parent: undefined, children: [], related: [] }) }));
vi.mock("../planner/src/data/open", () => ({ openWorkItem: () => undefined }));
vi.mock("../src/shared/capacityStore", () => ({ listTeams: () => Promise.resolve([]) }));
vi.mock("../planner/src/rest", () => ({ restGet: () => Promise.resolve({ value: [] }), restPost: () => Promise.resolve({ value: [] }) }));
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

import { catalog, describeResult, matches, runQuery, test as condTest, validateQueries } from "../planner/src/core/execQuery";
import { findQuery } from "../planner/src/core/ask";
import { ExecQueries } from "../planner/src/hub/ExecQueries";
import { ExecQuery } from "../planner/src/core/types";

const Q = (name: string, show: ExecQuery["show"], conditions: ExecQuery["conditions"], month = "current"): ExecQuery => ({ id: name, name, show, conditions, month, columns: [] });
const C = (field: string, op: ExecQuery["conditions"][number]["op"], value = "", join: "and" | "or" = "and") => ({ field, op, value, join });
const inputFor = (extra: Partial<Parameters<typeof runQuery>[1]> = {}) => {
  const people = { records: [{ key: "ann", name: "Ann A <ann>" }, { key: "bob", name: "Bob B <bob>" }, { key: "cy", name: "Cy C <cy>" }], hours: (k: string, m: string) => (m === "2026-10" ? 100 : null), team: (k: string) => (k === "cy" ? "Team B" : "Team A") };
  const bookings = [
    { epicId: 1, sourceId: "g", person: "ann", personName: "Ann A <ann>", month: "2026-10", hours: 120 }, { epicId: 2, sourceId: "g", person: "ann", personName: "Ann A <ann>", month: "2026-10", hours: 10 },
    { epicId: 2, sourceId: "g", person: "bob", personName: "Bob B <bob>", month: "2026-10", hours: 40 }, { epicId: 2, sourceId: "g", person: "cy", personName: "Cy C <cy>", month: "2026-10", hours: 90 },
  ];
  const exec = buildExec({ epics, gridDone: {}, bookings, avail: people, settings, today: TODAY }).rows;
  return { settings, exec, bookings, avail: people, today: TODAY, ...extra };
};

describe("query conditions", () => {
  const T = (v: string | number | undefined, op: ExecQuery["conditions"][number]["op"], value: string, type: "text" | "number" | "date" | "choice" = "text") => condTest(v, C("f", op, value), type, Date.UTC(2026, 9, 14));
  it("compares text, choices, numbers and dates", () => {
    expect(T("Software upgrade", "contains", "upgrade")).toBe(true); expect(T("Security", "in", "Data, security")).toBe(true); expect(T("At risk", "<>", "Done", "choice")).toBe(true);
    expect(T(85, ">=", "85", "number")).toBe(true); expect(T(84.9, ">=", "85", "number")).toBe(false); expect(T(5, "<", "x", "number")).toBe(false);
    expect(T("2026-09-30", "<", "today", "date")).toBe(true); expect(T("2026-09-30", ">=", "today-30", "date")).toBe(true); expect(T("2026-12-01", "<=", "today+30", "date")).toBe(false);
    expect(T(undefined, "empty", "")).toBe(true); expect(T("", "notEmpty", "")).toBe(false); expect(T(undefined, "<>", "x")).toBe(true); expect(T(undefined, "=", "x")).toBe(false);
  });
  it("binds And tighter than Or", () => {
    const row: Record<string, string> = { a: "1", b: "2", c: "3" };
    const get = (f: string) => row[f];
    const ty = () => "text" as const;
    expect(matches([C("a", "=", "1"), C("b", "=", "9", "and"), C("c", "=", "3", "or")], get, ty, 0)).toBe(true);     // (a=1 and b=9) or c=3
    expect(matches([C("a", "=", "1"), C("b", "=", "9", "and"), C("c", "=", "9", "or")], get, ty, 0)).toBe(false);
    expect(matches([], get, ty, 0)).toBe(true);
  });
});

describe("running queries", () => {
  it("Epics: filters on category, status, hours from the grids and counts", () => {
    const r = runQuery(Q("Regulatory at risk", "epics", [C("Custom.Type", "=", "Regulatory"), C("status", "=", "At risk")]), inputFor());
    expect(r.rows.map(x => x.values.title)).toEqual(["Basel IV"]);
    const busy = runQuery(Q("Booked in Oct", "epics", [C("hoursMonth", ">", "100")]), inputFor());
    expect(busy.rows.map(x => x.values.title)).toEqual(["Basel IV", "GDPR"]);                  // 120 h and 140 h booked in October
    expect(describeResult(r)).toBe("Regulatory at risk: 1 Epic (Basel IV).");
  });
  it("Teams: utilization of the month from bookings and capacity, highest first", () => {
    const r = runQuery(Q("Teams highly utilized", "teams", [C("utilization", ">=", "85")], "2026-10"), inputFor());
    expect(r.rows.map(x => [x.values.team, x.values.utilization])).toEqual([["Team B", 90], ["Team A", 85]]);
    expect(describeResult(r)).toMatch(/^Teams highly utilized: 2 teams \(2026-10: Team B 90%, Team A 85%\)\.$/);
  });
  it("People: who is over capacity in the month", () => {
    const r = runQuery(Q("People over capacity", "people", [C("utilization", ">", "100")]), inputFor());
    expect(r.rows.map(x => x.values.name)).toEqual(["Ann A"]);
    expect(r.rows[0].values).toMatchObject({ booked: 130, available: 100, utilization: 130, free: 0, band: "Over capacity", epicsCount: 2 });
    expect(runQuery(Q("Not in team A", "people", [C("team", "<>", "Team A")]), inputFor()).rows.map(x => x.values.name)).toEqual(["Cy C"]);
  });
  it("a month setting reads the capacity of that month", () => {
    expect(runQuery(Q("Next month", "teams", [], "next"), inputFor()).month).toBe("2026-11");
  });
  it("is validated like a query editor would", () => {
    const bad = normalizeSettings({ ...settings, executive: { ...settings.executive, queries: [
      Q("", "epics", []), Q("A", "epics", [C("nope", "=", "x")]), Q("a", "teams", [C("utilization", "contains", "x")]), Q("B", "people", [C("utilization", ">", "abc")]), Q("C", "epics", [C("goLive", "<", "yesterday")]), Q("D", "epics", [C("state", "=", "")]),
    ] } });
    expect(validateQueries(bad).length).toBe(7);
    expect(validateQueries(normalizeSettings({ ...settings, executive: { ...settings.executive, queries: [Q("Ok", "teams", [C("utilization", ">=", "85"), C("team", "in", "A, B", "or")])] } }))).toEqual([]);
    expect(catalog("epics", settings).some(f => f.key === "Custom.Type" && f.label === "Type")).toBe(true);
  });
  it("finds a configured query from typed words", () => {
    const qs = [Q("Late", "epics", []), Q("Software upgrades at risk", "epics", [])];
    expect(findQuery("what is late?", qs)?.name).toBe("Late");
    expect(findQuery("show software upgrades at risk please", qs)?.name).toBe("Software upgrades at risk");
    expect(findQuery("banana", qs)).toBeUndefined();
  });
});

describe("queries on the dashboard and in the settings", () => {
  const withQueries = normalizeSettings({ ...settings, executive: { ...settings.executive, queries: [Q("Regulatory red", "epics", [C("Custom.Type", "=", "Regulatory"), C("status", "=", "At risk")]), Q("Teams hot", "teams", [C("utilization", ">=", "85")])] } });
  const data = { epics, bookings: [{ epicId: 1, sourceId: "g", person: "ann", personName: "Ann A <ann>", month: new Date().toISOString().slice(0, 7), hours: 95 }], gridDone: {}, avail: { records: [{ key: "ann", name: "Ann A <ann>" }], hours: () => 100, team: () => "Team A" }, at: "", load: { ms: 1 } } as never;
  const mount = () => { const h = document.createElement("div"); document.body.appendChild(h); act(() => { ReactDOM.render(<ExecDashboard project={{ id: "P", name: "Proj" }} settings={withQueries} loaded={data} busy={false} error="" onReload={() => undefined} />, h); }); return h; };
  it("shows each query as a chip; an Epics query filters the list, a Teams query shows a table", () => {
    const h = mount();
    const chips = Array.from(h.querySelectorAll(".ex-sugg .chip"));
    expect(chips.map(c => c.textContent)).toEqual(["Regulatory red", "Teams hot"]);
    act(() => { Simulate.click(chips[0]); });
    expect(h.querySelectorAll("tr.ex-row")).toHaveLength(1); expect(h.querySelector(".ex-chips")!.textContent).toContain("Query: Regulatory red");
    expect(h.querySelector(".ex-answer")!.textContent).toContain("Regulatory red: 1 Epic");
    act(() => { Simulate.click(chips[1]); });
    expect(h.querySelector(".ex-result")!.textContent).toContain("Team A"); expect(h.querySelector(".ex-result")!.textContent).toContain("95%");
    const input = h.querySelector('input[aria-label="Ask the dashboard"]') as HTMLInputElement;
    act(() => { input.value = "regulatory red"; Simulate.change(input); });
    act(() => { Simulate.submit(h.querySelector("form")!); });
    expect(h.querySelector(".ex-result")).toBeNull(); expect(h.querySelectorAll("tr.ex-row")).toHaveLength(1);
  });
  it("the editor adds a query, a condition, changes its field and operator, and offers example queries", () => {
    const hostEl = document.createElement("div"); document.body.appendChild(hostEl);
    let s = settings;
    const render = () => ReactDOM.render(<ExecQueries s={s} onChange={n => { s = n; render(); }} />, hostEl);
    act(() => { render(); });
    act(() => { Simulate.click(Array.from(hostEl.querySelectorAll("button")).find(b => b.textContent!.trim() === "Add example queries")!); });
    expect(s.executive.queries.map(q => q.name)).toEqual(["At risk", "Late", "Teams highly utilized", "People over capacity"]);
    act(() => { Simulate.click(Array.from(hostEl.querySelectorAll("button")).find(b => b.textContent!.trim() === "Add a query")!); });
    expect(s.executive.queries).toHaveLength(5);
    const card = () => hostEl.querySelectorAll(".card")[4] as HTMLElement;
    act(() => { Simulate.click(Array.from(card().querySelectorAll("button")).find(b => b.textContent!.trim() === "Add a condition")!); });
    const sel = (label: string) => card().querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement;
    act(() => { sel("Field").value = "status"; Simulate.change(sel("Field")); });
    expect(s.executive.queries[4].conditions[0]).toMatchObject({ field: "status", op: "=" });
    act(() => { const v = card().querySelector('select[aria-label="Value"]') as HTMLSelectElement; v.value = "At risk"; Simulate.change(v); });
    expect(s.executive.queries[4].conditions[0].value).toBe("At risk");
    act(() => { sel("Operator").value = "notEmpty"; Simulate.change(sel("Operator")); });
    expect(card().querySelector('select[aria-label="Value"]')).toBeNull();
  });
});

import { defaultColumns, formatCell, validateFormulas } from "../planner/src/core/execQuery";
import { exampleFormulas } from "../planner/src/hub/ExecQueries";

describe("calculated fields and columns", () => {
  const F = (name: string, show: "epics" | "people" | "teams", formula: string, format: "number" | "percent" | "text" = "number", decimals = 1) => ({ id: name.replace(/\W/g, ""), name, show, formula, format, decimals });
  const withF = (formulas: ReturnType<typeof F>[], extra: Record<string, unknown> = {}) => normalizeSettings({ ...settings, executive: { ...settings.executive, formulas, ...extra } });
  const inp = (st: ReturnType<typeof withF>) => ({ ...inputFor(), settings: st, exec: buildExec({ epics, gridDone: {}, bookings: inputFor().bookings, avail: inputFor().avail, settings: st, today: TODAY }).rows });

  it("computes a value per row for Teams, People and Epics, usable as a condition and a column", () => {
    const st = withF([F("Free per person", "teams", "[Free hours] / [People]"), F("Over by", "people", "IF([Booked hours] > [Available hours], [Booked hours] - [Available hours], 0)"), F("Health", "epics", 'IF([Forecast days late] > 30, "Late", "OK")', "text")]);
    const t = runQuery({ ...Q("t", "teams", [C("calc:Freeperperson", ">", "0")], "2026-10"), columns: ["team", "calc:Freeperperson"] }, inp(st));
    expect(t.rows.map(r => [r.values.team, r.values["calc:Freeperperson"]])).toEqual([["Team B", 10], ["Team A", 15]]);        // Team A: 30 free hours / 2 people; Team B: 10 / 1
    const t2 = runQuery({ ...Q("t", "teams", [C("calc:Freeperperson", ">", "12")], "2026-10"), columns: ["team", "calc:Freeperperson"] }, inp(st));
    expect(t2.rows.map(r => r.values.team)).toEqual(["Team A"]);
    expect(t2.shown.map(f => f.label)).toEqual(["Team", "Free per person"]);
    const p2 = runQuery(Q("p", "people", [C("calc:Overby", ">", "0")]), inp(st));
    expect(p2.rows.map(r => [r.values.name, r.values["calc:Overby"]])).toEqual([["Ann A", 30]]);
    const e2 = runQuery({ ...Q("e", "epics", [C("calc:Health", "=", "Late")]), columns: ["title", "calc:Health"] }, inp(st));
    expect(e2.rows.map(r => r.values.title).sort()).toEqual(["Basel IV", "Middleware", "Observability"]);          // forecast more than 30 days after go-live
  });
  it("uses earlier calculated fields, dates as day numbers and Today; blanks stay blank", () => {
    const st = withF([F("Days to go", "epics", "[Go-live date] - Today", "number", 0), F("Weeks to go", "epics", "[Days to go] / 7", "number", 1), F("Ratio", "epics", "[Hours booked in the month] / [People booked]")]);
    const r = runQuery(Q("e", "epics", []), inp(st));
    const by = (t: string) => r.rows.find(x => x.values.title === t)!.values;
    expect(by("Basel IV")["calc:Daysto" + "go"]).toBe(65);                                  // 14 Oct → 18 Dec 2026
    expect(by("Basel IV")["calc:Weekstogo"]).toBe(9.3);
    expect(by("PSD3")["calc:Ratio"]).toBeUndefined();                                       // nobody booked: division by zero stays blank
    expect(by("No date")["calc:Daysto" + "go"]).toBeUndefined();                            // no go-live date: blank
  });
  it("formats percent and units and reports blanks as a dash", () => {
    const st = withF([F("Share", "teams", "[Booked hours] / [Available hours] * 100", "percent", 0)]);
    const f = catalog("teams", st).find(x => x.label === "Share")!;
    expect(formatCell(f, 90)).toBe("90%"); expect(formatCell(f, undefined)).toBe("–"); expect(formatCell(catalog("teams", st).find(x => x.key === "utilization"), 85)).toBe("85%");
    expect(defaultColumns("epics")).toContain("status");
  });
  it("is validated: names, formula syntax, unknown fields and order", () => {
    const bad = withF([F("", "epics", "1"), F("Progress", "epics", "1"), F("A", "epics", "1 +"), F("B", "epics", "[Nope] * 2"), F("C", "epics", "[D]"), F("D", "epics", "[Progress] + 1"), F("A", "epics", "2")]);
    expect(validateFormulas(bad).length).toBe(6);
    expect(validateFormulas(withF(exampleFormulas().map(x => ({ ...x, id: x.name.replace(/\W/g, "") }))))).toEqual([]);
    const col = withF([], { queries: [{ ...Q("Q", "epics", []), columns: ["nope"] }] });
    expect(validateQueries(col).some(m => /column 'nope'/.test(m))).toBe(true);
  });
});

describe("calculated fields in the editor and on the dashboard", () => {
  it("adds a calculated field, shows its error and success, and picks columns for a query", () => {
    const hostEl = document.createElement("div"); document.body.appendChild(hostEl);
    let s = settings;
    const render = () => ReactDOM.render(<ExecQueries s={s} onChange={n => { s = n; render(); }} />, hostEl);
    act(() => { render(); });
    act(() => { Simulate.click(Array.from(hostEl.querySelectorAll("button")).find(b => b.textContent!.trim() === "Add a calculated field")!); });
    const ta = () => hostEl.querySelector('textarea[aria-label="Formula"]') as HTMLTextAreaElement;
    act(() => { ta().value = "[Nope] * 2"; Simulate.change(ta()); });
    expect(hostEl.textContent).toContain("[Nope] is not a field it can use");
    const ins = hostEl.querySelector('select[aria-label="Insert a field"]') as HTMLSelectElement;
    act(() => { ta().value = ""; Simulate.change(ta()); });
    act(() => { (hostEl.querySelector('select[aria-label="Insert a field"]') as HTMLSelectElement).value = "Progress"; Simulate.change(hostEl.querySelector('select[aria-label="Insert a field"]')!); });
    expect(s.executive.formulas[0].formula).toBe("[Progress]");
    act(() => { ta().value = "[Progress] / 2"; Simulate.change(ta()); });
    expect(hostEl.textContent).toContain("Formula is valid"); void ins;
    act(() => { Simulate.click(Array.from(hostEl.querySelectorAll("button")).find(b => b.textContent!.trim() === "Add a query")!); });
    const add = hostEl.querySelector('select[aria-label="Add a column"]') as HTMLSelectElement;
    act(() => { add.value = "title"; Simulate.change(add); });
    act(() => { const a2 = hostEl.querySelector('select[aria-label="Add a column"]') as HTMLSelectElement; a2.value = "calc:" + s.executive.formulas[0].id; Simulate.change(a2); });
    expect(s.executive.queries[0].columns).toEqual(["title", "calc:" + s.executive.formulas[0].id]);
    act(() => { Simulate.click(hostEl.querySelector('[aria-label="Remove column Title"]')!); });
    expect(s.executive.queries[0].columns).toHaveLength(1);
  });
  it("an Epics query with columns shows a sortable result table including the calculated field", () => {
    const st = normalizeSettings({ ...settings, executive: { ...settings.executive, formulas: [{ id: "half", name: "Half progress", show: "epics", formula: "[Progress] / 2", format: "number", decimals: 0 }], queries: [{ id: "q", name: "Regulatory list", show: "epics", month: "current", conditions: [{ field: "Custom.Type", op: "=", value: "Regulatory", join: "and" }], columns: ["title", "progress", "calc:half"] }] } });
    const data = { epics, bookings: [], gridDone: {}, avail: none, at: "", load: { ms: 1 } } as never;
    const h = document.createElement("div"); document.body.appendChild(h);
    act(() => { ReactDOM.render(<ExecDashboard project={{ id: "P", name: "Proj" }} settings={st} loaded={data} busy={false} error="" onReload={() => undefined} />, h); });
    act(() => { Simulate.click(h.querySelector(".ex-sugg .chip")!); });
    const heads = Array.from(h.querySelectorAll(".ex-result th")).map(x => x.textContent);
    expect(heads).toEqual(["Title", "Progress", "Half progress"]);
    const firstRow = () => Array.from(h.querySelectorAll(".ex-result tbody tr")[0].querySelectorAll("td")).map(x => x.textContent);
    act(() => { Simulate.click(h.querySelectorAll(".ex-result th button")[1]); });         // sort by progress, highest first
    expect(firstRow()).toEqual(["FATCA", "100%", "50"]);
    act(() => { Simulate.click(h.querySelectorAll(".ex-result th button")[1]); });         // again: lowest first
    expect(firstRow()[1]).toBe("62%");
  });
});

import { ExecSettings as ExecSettingsView } from "../planner/src/hub/ExecSettings";
import { ExecPage } from "../planner/src/exec/ExecPage";

describe("enabling the Executive Dashboard", () => {
  it("is off by default; the checkbox reveals the settings and the queries", () => {
    expect(normalizeSettings({}).executive.enabled).toBe(false);
    const hostEl = document.createElement("div"); document.body.appendChild(hostEl);
    let s = normalizeSettings({});
    const render = () => ReactDOM.render(<ExecSettingsView s={s} fields={[]} project="Proj" onChange={n => { s = n; render(); }} />, hostEl);
    act(() => { render(); });
    expect(hostEl.textContent).toContain("Enable the Executive Dashboard"); expect(hostEl.textContent).not.toContain("Questions (queries)");
    act(() => { Simulate.change(hostEl.querySelector('input[type="checkbox"]')!, { target: { checked: true } } as never); });
    expect(s.executive.enabled).toBe(true); expect(hostEl.textContent).toContain("Questions (queries)");
  });
  it("the tab explains what is missing when the settings are incomplete", () => {
    const h = document.createElement("div"); document.body.appendChild(h);
    act(() => { ReactDOM.render(<ExecPage project={{ id: "P", name: "Proj" }} settings={normalizeSettings({ executive: { enabled: true } })} busy={false} error="" queries={[]} queryId="" onQuery={() => undefined} onReload={() => undefined} />, h); });
    expect(h.textContent).toContain("not set up yet"); expect(h.textContent).toContain("go-live date");
  });
});
