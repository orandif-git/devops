// @vitest-environment jsdom
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";

const opened: number[] = [];
vi.mock("../src/shared/ado", () => ({ downloadFile: vi.fn() }));
const store = vi.hoisted(() => ({ doc: { views: [] as unknown[], defaultId: undefined as string | undefined } }));
vi.mock("../planner/src/data/viewStore", () => ({ loadViews: async () => JSON.parse(JSON.stringify(store.doc)), saveViews: async (_p: string, d: typeof store.doc) => { store.doc = JSON.parse(JSON.stringify(d)); } }));
vi.mock("../planner/src/data/share", () => ({ buildLink: async () => "https://host/_apps/hub/x?pv=abc&full=1", readLink: async () => ({ full: false }), setHostFullScreen: async () => undefined }));
vi.mock("../planner/src/data/history", () => ({ fetchEpicHistory: async () => undefined, loadHistory: async () => ({}) }));
vi.mock("../planner/src/data/related", () => ({ loadRelated: async () => [{ id: 50, title: "Address service", type: "Feature", state: "Active", relation: "Child" }] }));
vi.mock("../planner/src/data/open", () => ({ openWorkItem: async (_p: string, id: number) => { opened.push(id); } }));

import { HeatmapTab } from "../planner/src/hub/HeatmapTab";
import { CommandCenter } from "../planner/src/hub/CommandCenter";
import { GanttTab } from "../planner/src/hub/GanttTab";
import { TimelineTab } from "../planner/src/hub/TimelineTab";
import { noFilters } from "../planner/src/core/model";
import { normalizeSettings } from "../planner/src/core/settings";
import { Loaded } from "../planner/src/data/loadAll";

const settings = normalizeSettings({ sources: [{ id: "s", name: "G", dataField: "Custom.G", columns: { resource: "r" } }], extraFilterFields: [] });
const epic = (id: number, title: string, start?: string, target?: string) => ({ id, title, state: "Active", type: "Epic", areaPath: "P\\Team A", iterationPath: "P", changed: "", start, target, grids: {}, extra: {} });
const loaded = {
  load: { epics: [], ids: 2, fetched: 2, fromCache: 0, failed: 0, ms: 900, syncedAt: "", usedCache: false },
  epics: [epic(1, "Credit score", "2026-10-01", "2026-12-15"), epic(2, "Migration", "2026-01-05", "2026-03-31")],
  tasks: [
    { epicId: 1, sourceId: "s", person: "ann", personName: "Ann A <ann>", start: "2026-10-01", end: "2026-10-31", allocation: 100, label: "Design" },
    { epicId: 2, sourceId: "s", person: "bob", personName: "Bob B <bob>", start: "2026-10-05", end: "2026-10-30", allocation: 50 },
  ],
  bookings: [
    { epicId: 1, sourceId: "s", person: "ann", personName: "Ann A <ann>", month: "2026-10", hours: 110 }, { epicId: 2, sourceId: "s", person: "bob", personName: "Bob B <bob>", month: "2026-10", hours: 90 },
    { epicId: 2, sourceId: "s", person: "cy", personName: "Cy C <cy>", month: "2026-10", hours: 20 },
  ],
  stats: { rows: 3, counted: 3, excluded: 0, noPerson: 0, unscheduled: 0, estimated: 0, errored: 0, unreadable: false }, perSource: [], ms: 900, at: new Date().toISOString(),
  avail: { records: [{ key: "ann", name: "Ann A <ann>" }, { key: "bob", name: "Bob B <bob>" }, { key: "dee", name: "Dee D <dee>" }], report: [], hours: (p: string) => (p === "cy" ? null : 100), team: (p: string) => (p === "cy" ? "" : "NFR") },
} as unknown as Loaded;

function Heat(p: Partial<React.ComponentProps<typeof HeatmapTab>>) {
  const [f, setF] = React.useState(noFilters());
  return <HeatmapTab project={{ id: "P", name: "Proj" }} settings={settings} loaded={loaded} months={["2026-10", "2026-11"]} busy={false} error="" queries={[]} queryId="" onQuery={() => undefined} onReload={() => undefined} filters={f} onFilters={setF} {...p} />;
}
function mount(extra: Partial<React.ComponentProps<typeof HeatmapTab>> = {}) {
  const host = document.createElement("div"); document.body.appendChild(host);
  act(() => { ReactDOM.render(<Heat {...extra} />, host); });
  return host;
}
const year = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"];
const click = (el: Element) => act(() => { (el as HTMLElement).click(); });

describe("heatmap tab", () => {
  it("shows a row per person with the right band, a symbol for over capacity and a marker for hours without capacity", () => {
    const host = mount();
    const rows = Array.from(host.querySelectorAll(".hm .n")).map(n => n.textContent);
    expect(rows).toEqual(["Ann A", "Bob B", "Dee D", "Cy C"]);                         // NFR people first, the person without team capacity last
    const cells = Array.from(host.querySelectorAll(".hm .cell")).map(c => c.textContent);
    expect(cells.slice(0, 2)).toEqual(["!", ""]);                                       // Ann: 110 of 100 in Oct = over; Nov nothing booked = spare (blue, no symbol)
    expect(host.textContent).toContain("Hours but no capacity entered");
    expect(host.querySelector(".kpis")!.textContent).toContain("Over capacity in 2026-10");
  });
  it("highlights a band when its button is pressed and clears it again", () => {
    const host = mount();
    const over = Array.from(host.querySelectorAll("button.bandbtn")).find(b => b.textContent!.includes("Over capacity"))!;
    click(over);
    const dim = Array.from(host.querySelectorAll<HTMLElement>(".hm .cell")).filter(c => c.style.opacity === "0.2").length;
    expect(dim).toBeGreaterThan(0);
    click(over);
    expect(Array.from(host.querySelectorAll<HTMLElement>(".hm .cell")).filter(c => c.style.opacity === "0.2").length).toBe(0);
  });
  it("opens a person's month in the side panel and an Epic in the dialog with its related items", async () => {
    const host = mount();
    click(host.querySelectorAll(".hm .cell")[0]);
    expect(host.querySelector(".panel")!.textContent).toContain("110 / 100 h");
    click(host.querySelector(".panel a.lk")!);
    await act(async () => { await Promise.resolve(); });
    const dlg = document.querySelector(".modal")!;
    expect(dlg.textContent).toContain("1 · Credit score");
    expect(dlg.textContent).toContain("50 · Address service");
    click(Array.from(dlg.querySelectorAll("button")).find(b => b.textContent!.trim() === "Open the Epic form")!);
    expect(opened).toEqual([1]);
    click(dlg.querySelector('button[aria-label="Close"]')!);
    expect(document.querySelector(".modal")).toBeNull();
  });
  it("filters by team and switches to the table view", () => {
    const host = mount();
    const team = host.querySelector<HTMLSelectElement>("select")!;
    act(() => { const s = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!; s.call(host.querySelectorAll("select")[1], "NFR"); host.querySelectorAll("select")[1].dispatchEvent(new Event("change", { bubbles: true })); });
    expect(Array.from(host.querySelectorAll(".hm .n")).map(n => n.textContent)).toEqual(["Ann A", "Bob B", "Dee D"]);
    expect(team).toBeTruthy();
    click(Array.from(host.querySelectorAll("button")).find(b => b.textContent === "Table view")!);
    expect(host.querySelector("table.tv")!.textContent).toContain("110%");
  });
});

describe("Epic Gantt tab", () => {
  it("draws a bar per Epic from its dates, groups by area, flags late Epics and opens the Epic on click", async () => {
    const host = document.createElement("div"); document.body.appendChild(host);
    act(() => { ReactDOM.render(<GanttTab project={{ id: "P", name: "Proj" }} settings={settings} loaded={loaded} months={year} filters={noFilters()} />, host); });
    expect(host.querySelector(".tl-grp")!.textContent).toContain("Team A");
    const bars = host.querySelectorAll(".tl-lane .gb");
    expect(bars).toHaveLength(2);
    expect(host.textContent).toContain("Credit score"); expect(Array.from(host.querySelectorAll(".tl-name .idc")).map(x => x.textContent)).toContain("1");
    expect(bars[0].getAttribute("style")).toMatch(/rgb\(209, 52, 56\)|#d13438/);       // Migration ended in March and is still Active: red bar
    expect(bars[1].getAttribute("style")).not.toMatch(/rgb\(209, 52, 56\)|#d13438/);
    host.remove();
    const h2 = document.createElement("div"); document.body.appendChild(h2);
    const withField = { ...loaded, epics: loaded.epics.map(e => ({ ...e, extra: { "Custom.Status": "3. Design" } })) };
    act(() => { ReactDOM.render(<GanttTab project={{ id: "P", name: "Proj" }} settings={{ ...settings, ganttLabelField: "Custom.Status" }} loaded={withField} months={year} filters={noFilters()} />, h2); });
    expect(h2.textContent).toContain("3. Design");                                          // the field value at the end of the bar
    h2.remove();
    const host3 = document.createElement("div"); document.body.appendChild(host3);
    act(() => { ReactDOM.render(<GanttTab project={{ id: "P", name: "Proj" }} settings={settings} loaded={loaded} months={year} filters={noFilters()} />, host3); });
    click(host3.querySelectorAll(".tl-lane .gb")[0]);
    await act(async () => { await Promise.resolve(); });
    expect(document.querySelector(".modal")!.textContent).toContain("Migration");   // rows run in start-date order
    click(document.querySelector('.modal button[aria-label="Close"]')!);
  });
});

describe("Epic Gantt statistics, key filter and search", () => {
  const e3 = { ...epic(3, "Portal revamp", "2026-02-01", "2026-12-31"), state: "Delivery Committed" }, e4 = { ...epic(4, "Old launch", "2026-01-05", "2026-02-28"), state: "Closed" };
  const data = { ...loaded, epics: [...loaded.epics, e3, e4], stateGroups: { "delivery committed": "inprogress", closed: "complete" } } as unknown as Loaded;
  function G() {
    const [legend, setLegend] = React.useState<string[]>([]); const [q, setQ] = React.useState("");
    return <div><input id="q" onChange={e => setQ(e.target.value)} /><GanttTab project={{ id: "P", name: "Proj" }} settings={settings} loaded={data} months={year} filters={noFilters()} search={q} legend={legend} onLegend={setLegend} tiles={["epics", "late", "done"]} onTiles={() => undefined} /></div>;
  }
  const mount2 = () => { const h = document.createElement("div"); document.body.appendChild(h); act(() => { ReactDOM.render(<G />, h); }); return h; };
  const bars = (h: HTMLElement) => h.querySelectorAll(".tl-lane .gb").length;
  it("shows Epic statistics, and clicking a state in the key or a statistic filters the Epics", () => {
    const h = mount2();
    expect(h.querySelector(".gs-strip")!.textContent).toContain("Epics in view");
    expect(bars(h)).toBe(4);
    const key = Array.from(h.querySelectorAll(".kbtn")).find(b => b.textContent === "Closed")!;
    click(key); expect(bars(h)).toBe(1); expect(key.getAttribute("aria-pressed")).toBe("true");
    click(Array.from(h.querySelectorAll(".kbtn")).find(b => b.textContent === "Delivery Committed")!); expect(bars(h)).toBe(2);   // add a second entry
    click(Array.from(h.querySelectorAll("button")).find(b => b.textContent === "Clear filter")!); expect(bars(h)).toBe(4);
    click(Array.from(h.querySelectorAll(".gs")).find(b => b.textContent!.startsWith("Late"))!); expect(bars(h)).toBeGreaterThan(0); expect(bars(h)).toBeLessThan(4);
  });
  it("groups by a configured Epic field, in natural order, with empty values last", () => {
    const withStatus = { ...data, epics: data.epics.map((e, i) => ({ ...e, extra: i === 0 ? {} : { "Custom.Status": i === 1 ? "10. Live" : i === 2 ? "3. Design" : "3. Design" } })) } as unknown as Loaded;
    const h = document.createElement("div"); document.body.appendChild(h);
    act(() => { ReactDOM.render(<GanttTab project={{ id: "P", name: "Proj" }} settings={{ ...settings, ganttGroupFields: ["Custom.Status"] }} loaded={withStatus} months={year} filters={noFilters()} group="f:Custom.Status" onGroup={() => undefined} />, h); });
    expect(Array.from(h.querySelectorAll(".tl-grp")).map(x => x.textContent!.replace(/\(\d+\)/, "").trim())).toEqual(["3. Design", "10. Live", "(none)"]);
    expect(Array.from(h.querySelectorAll("select option")).map(o => o.textContent)).toContain("Status");
    // a field that is no longer in Settings falls back to Area
    const h2 = document.createElement("div"); document.body.appendChild(h2);
    act(() => { ReactDOM.render(<GanttTab project={{ id: "P", name: "Proj" }} settings={settings} loaded={withStatus} months={year} filters={noFilters()} group="f:Custom.Status" onGroup={() => undefined} />, h2); });
    expect(h2.querySelector(".tl-grp")!.textContent).toContain("Team A");
  });
  it("offers the Months / Quarters zoom, the compact spacing and trends on the statistics", () => {
    const week = (n: number) => new Date(Date.UTC(2026, 9, 26) - n * 7 * 864e5).toISOString().slice(0, 10);
    const snaps = [1, 0].map((n, k) => ({ week: week(n), at: week(n) + "T08:00:00Z", total: 3 + k, progress: 50, late: 1, due30: 1, hold: 0, green: 1 + k, amber: 1, red: 1, idle: 0, unknown: 0, done: 0 }));
    function Z() { const [z, setZ] = React.useState<"m" | "q">("m"), [d, setD] = React.useState<"comfortable" | "compact">("comfortable");
      return <GanttTab project={{ id: "P", name: "Proj" }} settings={settings} loaded={{ ...data, snapshots: snaps } as unknown as Loaded} months={year} filters={noFilters()} tiles={["epics", "ok"]} zoom={z} onZoom={setZ} density={d} onDensity={setD} />; }
    const h = document.createElement("div"); document.body.appendChild(h); act(() => { ReactDOM.render(<Z />, h); });
    expect(h.querySelector(".tl-mo.off")).toBeNull(); expect(h.querySelector(".gs-delta")!.textContent).toContain("+1");
    click(Array.from(h.querySelectorAll(".ex-seg.two button")).find(b => b.textContent === "Quarters")!); expect(h.querySelector(".tl-mo.off")).not.toBeNull();
    click(Array.from(h.querySelectorAll("button.pill")).find(b => b.textContent!.includes("Comfortable"))!); expect(h.querySelector(".gantt-wrap.dense")).not.toBeNull();
  });
  it("shows the dates of the bars in the administrator's date format", () => {
    const h = document.createElement("div"); document.body.appendChild(h);
    act(() => { ReactDOM.render(<GanttTab project={{ id: "P", name: "Proj" }} settings={{ ...settings, dateFormat: "DD/MM/YYYY" }} loaded={data} months={year} filters={noFilters()} />, h); });
    expect(Array.from(h.querySelectorAll(".tl-lane .gb")).some(b => /\d\d\/\d\d\/2026/.test(b.getAttribute("aria-label") ?? ""))).toBe(true);
  });
  it("marks where the target date originally was when the history is on", () => {
    const hist = { 1: { baseline: "2026-08-01", current: "2026-12-15", rev: 2, changes: [{ at: "2026-05-01T00:00:00Z", by: "Ann", from: "2026-08-01", to: "2026-12-15" }] } };
    const h = document.createElement("div"); document.body.appendChild(h);
    act(() => { ReactDOM.render(<GanttTab project={{ id: "P", name: "Proj" }} settings={{ ...settings, epicTargetField: "Custom.T", history: { ...settings.history, enabled: true } }} loaded={{ ...data, history: { "Custom.T": hist } } as unknown as Loaded} months={year} filters={noFilters()} />, h); });
    expect(h.querySelectorAll(".gorig")).toHaveLength(1); expect(h.querySelector(".gline.later")).not.toBeNull(); expect(h.querySelector(".gmv")!.textContent).toContain("1×");
    act(() => { click(h.querySelector('.tl-lane .gb[aria-label^="Epic 1,"]')!); });                                // the Epic dialog in the middle of the page shows the history too
    expect(document.querySelector(".modal .hist")!.textContent).toContain("original date"); expect(document.querySelector(".modal .hist")!.textContent).toContain("Ann");
    click(document.querySelector('.modal button[aria-label="Close"]')!);
    const h2 = document.createElement("div"); document.body.appendChild(h2);
    act(() => { ReactDOM.render(<GanttTab project={{ id: "P", name: "Proj" }} settings={settings} loaded={{ ...data, history: { "Custom.T": hist } } as unknown as Loaded} months={year} filters={noFilters()} />, h2); });
    expect(h2.querySelectorAll(".gorig")).toHaveLength(0);                                  // off: nothing is drawn
  });
  it("finds Epics by keyword (id, title or state)", () => {
    const h = mount2(); const q = h.querySelector("input") as HTMLInputElement; if (!q) throw new Error(h.innerHTML.slice(0, 300));
    const type = (v: string) => act(() => { Simulate.change(q, { target: { value: v } } as never); });
    type("portal"); expect(bars(h)).toBe(1);
    type("2"); expect(bars(h)).toBeGreaterThan(0);
    type("zzz"); expect(bars(h)).toBe(0); expect(h.textContent).toContain("No Epics");
  });
});

describe("Resource timeline tab", () => {
  it("shows people grouped by team with their task bars and an over-capacity flag", () => {
    const host = document.createElement("div"); document.body.appendChild(host);
    act(() => { ReactDOM.render(<TimelineTab project={{ id: "P", name: "Proj" }} settings={settings} loaded={loaded} months={["2026-10", "2026-11"]} filters={noFilters()} />, host); });
    const names = Array.from(host.querySelectorAll(".tl-name b")).map(n => n.textContent);
    expect(names.slice(0, 2)).toEqual(["Ann A", "Bob B"]);
    expect(host.querySelectorAll(".tl-lane .gb").length).toBe(2);
    expect(host.textContent).toContain("1 · 100%");
    expect(host.querySelectorAll(".tl-name .sw.over")).toHaveLength(1);                   // Ann has 110 h of 100 h in October
  });
});

describe("Command center", () => {
  function CC() {
    const [f, setF] = React.useState(noFilters());
    const [period, setPeriod] = React.useState<{ kind: "year" | "quarter" | "last12" | "next12" | "custom"; from?: string; to?: string }>({ kind: "year" });
    return <CommandCenter project={{ id: "P", name: "Proj" }} settings={settings} loaded={loaded} months={["2026-10", "2026-11"]} busy={false} error="" queries={[]} queryId="" onQuery={() => undefined} onReload={() => undefined} filters={f} onFilters={setF} period={period} onPeriod={setPeriod} />;
  }
  const host = () => { const h = document.createElement("div"); document.body.appendChild(h); act(() => { ReactDOM.render(<CC />, h); }); return h; };
  it("shows the KPI strip and band buttons, highlights a band, and filters as removable chips", () => {
    const h = host();
    expect(h.querySelector(".cc-strip")!.textContent).toContain("Utilization");
    const over = Array.from(h.querySelectorAll(".cc-bands .band")).find(b => b.textContent!.includes("Over capacity"))!;
    click(over);
    expect(over.getAttribute("aria-pressed")).toBe("true");
    expect(h.querySelector(".cc-chips")!.textContent).toContain("Band: Over capacity");
    click(h.querySelector(".cchip button")!);
    expect(h.querySelector(".cc-chips")).toBeNull();
  });
  it("collapses a team, opens the detail panel from a cell and closes it with Escape", () => {
    const h = host();
    const team = h.querySelector(".cc-team")!;
    expect(h.querySelectorAll(".cell")).toHaveLength(0);                                   // teams start collapsed
    click(team); const before = h.querySelectorAll(".cell").length; expect(before).toBeGreaterThan(0);
    click(team); expect(h.querySelectorAll(".cell")).toHaveLength(0); click(team);
    expect(h.querySelectorAll(".cell")).toHaveLength(before);
    click(h.querySelector('.cell[role="button"]')!);
    expect(h.querySelector(".cc-panel")!.textContent).toContain("Epic");
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(h.querySelector(".cc-panel")).toBeNull();
  });
  it("expands a person to their Epics, shows the Total column and switches units", () => {
    const h = host();
    expect(h.querySelector(".cc-h.cc-s2")!.textContent).toBe("Total");
    expect(h.querySelectorAll(".cc-epic")).toHaveLength(0);
    click(h.querySelector(".cc-team")!);                                                   // open the team, then the person
    click(h.querySelector(".cc-xp")!);
    expect(h.querySelectorAll(".cc-epic").length).toBeGreaterThan(0);
    click(Array.from(h.querySelectorAll("button")).find(b => b.getAttribute("aria-label") === "Collapse all")!);
    expect(h.querySelectorAll(".cc-epic")).toHaveLength(0);
    click(Array.from(h.querySelectorAll("button")).find(b => b.getAttribute("aria-label") === "Expand all")!);
    expect(h.querySelectorAll(".cc-epic").length).toBeGreaterThan(0);
    click(Array.from(h.querySelectorAll(".seg button")).find(b => b.textContent === "% of capacity")!);
    expect(h.querySelector(".cc-person + .cc-tt")!.textContent).toMatch(/%|–/);
  });
  it("groups by Epic first, then team, then person, and by person then Epic", () => {
    const h = host();
    const sel = h.querySelector('select[aria-label="Group by"]') as HTMLSelectElement;
    const change = (v: string) => act(() => { sel.value = v; sel.dispatchEvent(new Event("change", { bubbles: true })); });
    change("epic");
    const tops = () => Array.from(h.querySelectorAll(".cc-team.grp")).map(x => x.textContent!);
    expect(tops().length).toBeGreaterThan(0); expect(h.querySelectorAll(".cell")).toHaveLength(0);       // everything closed
    click(h.querySelector(".cc-team.grp")!);
    expect(h.querySelector(".cc-team.sub")).not.toBeNull();                                               // its teams
    click(h.querySelector(".cc-team.sub")!);
    expect(h.querySelector(".cc-nm")).not.toBeNull();                                                     // their people
    change("person");
    expect(h.querySelectorAll(".cc-person").length).toBeGreaterThan(0); expect(h.querySelectorAll(".cc-team")).toHaveLength(0);
  });
  it("switches to the timeline and the Gantt without losing the filter bar", () => {
    const h = host();
    click(Array.from(h.querySelectorAll(".seg button")).find(b => b.textContent === "Timeline")!);
    expect(h.querySelector(".tl-grp")).not.toBeNull(); expect(h.querySelector(".cc-bar")).not.toBeNull();
    click(Array.from(h.querySelectorAll(".seg button")).find(b => b.textContent === "Epic Gantt")!);
    expect(h.querySelectorAll(".tl-lane .gb").length).toBeGreaterThan(0);
  });
  it("saves a personal view, applies it again, sets it as default and offers a share link", async () => {
    const h = host(); await act(async () => { await Promise.resolve(); await Promise.resolve(); });            // my views have been read
    const type = (el: Element, v: string) => act(() => { Simulate.change(el, { target: { value: v } } as never); });
    const btn = (t: string) => Array.from(h.querySelectorAll("button")).find(b => b.textContent!.includes(t))!;
    click(h.querySelector('select[aria-label="Group by"]') ? btn("Views") : btn("Views"));
    type(h.querySelector('input[aria-label="New view name"]')!, "Epics first");
    click(Array.from(h.querySelectorAll(".views .btn.primary")).find(b => b.textContent!.trim() === "Save")!);
    await act(async () => { await Promise.resolve(); });
    expect(store.doc.views).toHaveLength(1); expect((store.doc.views[0] as { name: string }).name).toBe("Epics first");
    click(h.querySelector('.views button[aria-label^="Default view"]')!); await act(async () => { await Promise.resolve(); });
    expect(store.doc.defaultId).toBe((store.doc.views[0] as { id: string }).id);
    click(btn("Copy link to this view")); await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect((h.querySelector('input[aria-label="Link"]') as HTMLInputElement).value).toContain("pv=abc");
    click(h.querySelector('.views button[aria-label^="Delete"]')!); await act(async () => { await Promise.resolve(); });
    expect(store.doc.views).toHaveLength(0); expect(store.doc.defaultId).toBeUndefined();
  });
  it("opens the filters drawer with the Epic states", () => {
    const h = host();
    click(Array.from(h.querySelectorAll(".pill")).find(b => b.textContent!.includes("Filters"))!);
    expect(h.querySelector(".cc-drawer")!.textContent).toContain("Active");
  });
});
