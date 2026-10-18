// @vitest-environment jsdom
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";

const opened: number[] = [];
vi.mock("../src/shared/ado", () => ({ downloadFile: vi.fn() }));
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
    click(Array.from(dlg.querySelectorAll("button")).find(b => b.textContent === "Open the Epic form")!);
    expect(opened).toEqual([1]);
    click(Array.from(dlg.querySelectorAll("button")).find(b => b.textContent === "Close")!);
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
    expect(host.textContent).toContain("1 · Credit score");
    expect(host.querySelectorAll(".late.flag")).toHaveLength(1);                         // Migration ended in March and is still Active
    click(bars[0]);
    await act(async () => { await Promise.resolve(); });
    expect(document.querySelector(".modal")!.textContent).toContain("Migration");   // rows run in start-date order
    click(Array.from(document.querySelectorAll(".modal button")).find(b => b.textContent === "Close")!);
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
    const before = h.querySelectorAll(".cell").length;
    click(team); expect(h.querySelectorAll(".cell").length).toBeLessThan(before); click(team);
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
    click(h.querySelector(".cc-xp")!);
    expect(h.querySelectorAll(".cc-epic").length).toBeGreaterThan(0);
    click(Array.from(h.querySelectorAll("button")).find(b => b.textContent === "⊟ Collapse all")!);
    expect(h.querySelectorAll(".cc-epic")).toHaveLength(0);
    click(Array.from(h.querySelectorAll("button")).find(b => b.textContent === "⊞ Expand all")!);
    expect(h.querySelectorAll(".cc-epic").length).toBeGreaterThan(0);
    click(Array.from(h.querySelectorAll(".seg button")).find(b => b.textContent === "% of capacity")!);
    expect(h.querySelector(".cc-person + .cc-tt")!.textContent).toMatch(/%|–/);
  });
  it("switches to the timeline and the Gantt without losing the filter bar", () => {
    const h = host();
    click(Array.from(h.querySelectorAll(".seg button")).find(b => b.textContent === "Timeline")!);
    expect(h.querySelector(".tl-grp")).not.toBeNull(); expect(h.querySelector(".cc-bar")).not.toBeNull();
    click(Array.from(h.querySelectorAll(".seg button")).find(b => b.textContent === "Epic Gantt")!);
    expect(h.querySelectorAll(".tl-lane .gb").length).toBeGreaterThan(0);
  });
  it("opens the filters drawer with the Epic states", () => {
    const h = host();
    click(Array.from(h.querySelectorAll(".pill")).find(b => b.textContent!.includes("Filters"))!);
    expect(h.querySelector(".cc-drawer")!.textContent).toContain("Active");
  });
});
