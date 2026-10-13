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
import { normalizeSettings } from "../planner/src/core/settings";
import { Loaded } from "../planner/src/data/loadAll";

const settings = normalizeSettings({ sources: [{ id: "s", name: "G", dataField: "Custom.G", columns: { resource: "r" } }], extraFilterFields: [] });
const epic = (id: number, title: string) => ({ id, title, state: "Active", type: "Epic", areaPath: "P", iterationPath: "P", changed: "", grids: {}, extra: {} });
const loaded = {
  load: { epics: [], ids: 2, fetched: 2, fromCache: 0, failed: 0, ms: 900, syncedAt: "", usedCache: false },
  epics: [epic(1, "Credit score"), epic(2, "Migration")],
  bookings: [
    { epicId: 1, sourceId: "s", person: "ann", personName: "Ann A <ann>", month: "2026-10", hours: 110 }, { epicId: 2, sourceId: "s", person: "bob", personName: "Bob B <bob>", month: "2026-10", hours: 90 },
    { epicId: 2, sourceId: "s", person: "cy", personName: "Cy C <cy>", month: "2026-10", hours: 20 },
  ],
  stats: { rows: 3, counted: 3, excluded: 0, noPerson: 0, unscheduled: 0, estimated: 0, errored: 0, unreadable: false }, perSource: [], ms: 900, at: new Date().toISOString(),
  avail: { records: [{ key: "ann", name: "Ann A <ann>" }, { key: "bob", name: "Bob B <bob>" }, { key: "dee", name: "Dee D <dee>" }], report: [], hours: (p: string) => (p === "cy" ? null : 100), team: (p: string) => (p === "cy" ? "" : "NFR") },
} as unknown as Loaded;

function mount(extra: Partial<React.ComponentProps<typeof HeatmapTab>> = {}) {
  const host = document.createElement("div"); document.body.appendChild(host);
  act(() => { ReactDOM.render(<HeatmapTab project={{ id: "P", name: "Proj" }} settings={settings} loaded={loaded} months={["2026-10", "2026-11"]} busy={false} error="" queries={[]} queryId="" onQuery={() => undefined} onReload={() => undefined} {...extra} />, host); });
  return host;
}
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
