// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { monthRun, parseWidgetConfig, resolveMonth, widgetData } from "../planner/src/core/widgets";
import { OverList, TeamMap, Tile } from "../planner/src/widgets/views";

const th = { spare: 50, healthy: 85, full: 100 };
const today = new Date("2026-10-13T00:00:00Z");
const avail = {
  records: [{ key: "ann", name: "Ann A <ann>" }, { key: "bob", name: "Bob B <bob>" }, { key: "cy", name: "Cy C <cy>" }],
  hours: (p: string, m: string) => (m >= "2026-10" ? ({ ann: 100, bob: 100, cy: 100 } as Record<string, number>)[p] ?? null : null),
  team: (p: string) => (p === "cy" ? "Team B" : "Team A"),
};
const bk = (person: string, hours: number, month = "2026-10") => ({ epicId: 1, sourceId: "s", person, personName: person, month, hours, estimated: false });
const epics = [{ id: 1, title: "E", state: "Active", type: "Epic", areaPath: "P", iterationPath: "P", changed: "", grids: {}, extra: {} }] as never;
const bookings = [bk("ann", 120), bk("bob", 40), bk("cy", 90), bk("cy", 95, "2026-11")];

describe("widget configuration and data", () => {
  it("reads a stored configuration and falls back to defaults for anything invalid", () => {
    expect(parseWidgetConfig(undefined)).toEqual({ month: "current", team: "", queryId: "", top: 10 });
    expect(parseWidgetConfig("{bad")).toEqual(parseWidgetConfig(undefined));
    expect(parseWidgetConfig(JSON.stringify({ month: "2027-01", team: "Team A", top: 3 }))).toMatchObject({ month: "2027-01", team: "Team A", top: 3 });
    expect(parseWidgetConfig(JSON.stringify({ month: "someday", top: 500 }))).toMatchObject({ month: "current", top: 10 });
  });
  it("resolves current/next month and runs six months across a year end", () => {
    expect(resolveMonth("current", today)).toBe("2026-10");
    expect(resolveMonth("next", today)).toBe("2026-11");
    expect(resolveMonth("2027-02", today)).toBe("2027-02");
    expect(monthRun("2026-11")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04"]);
  });
  it("computes the tile, the over-capacity list and the team rows", () => {
    const d = widgetData(bookings as never, epics, avail, th, parseWidgetConfig(undefined), today);
    expect(d.month).toBe("2026-10");
    expect(d.tile).toMatchObject({ hours: 250, available: 300, people: 3, band: "healthy" });
    expect(d.tile.counts).toMatchObject({ over: 1, spare: 1, full: 1 });
    expect(d.over.map(r => r.name)).toEqual(["Ann A"]);
    expect(d.over[0].ratio).toBeCloseTo(1.2);
    expect(d.teams.map(t => t.team)).toEqual(["Team A", "Team B"]);
    expect(d.teams[1].cells[1]).toMatchObject({ month: "2026-11", band: "full" });
  });
  it("limits to a team and to the top rows", () => {
    const d = widgetData(bookings as never, epics, avail, th, { ...parseWidgetConfig(undefined), team: "Team B" }, today);
    expect(d.tile.people).toBe(1); expect(d.over).toEqual([]); expect(d.teams).toHaveLength(1);
    const many = widgetData([bk("ann", 120), bk("bob", 150), bk("cy", 130)] as never, epics, avail, th, { ...parseWidgetConfig(undefined), top: 2 }, today);
    expect(many.over.map(r => r.name)).toEqual(["Bob B", "Cy C"]); expect(many.overTotal).toBe(3);
  });
});

describe("widget views", () => {
  const d = widgetData(bookings as never, epics, avail, th, parseWidgetConfig(undefined), today);
  const draw = (el: React.ReactElement) => { const h = document.createElement("div"); document.body.appendChild(h); act(() => { ReactDOM.render(el, h); }); return h; };
  it("shows the tile with the percentage, the hours and a symbol next to each band", () => {
    const h = draw(<Tile d={d} />);
    expect(h.textContent).toContain("83%"); expect(h.textContent).toContain("250 h booked of 300 h"); expect(h.textContent).toContain("Over capacity");
  });
  it("lists who is over and says so when nobody is", () => {
    expect(draw(<OverList d={d} />).textContent).toContain("120%");
    expect(draw(<OverList d={{ ...d, over: [], overTotal: 0 }} />).textContent).toContain("Nobody is over capacity");
  });
  it("draws one row per team with a cell per month and a text alternative", () => {
    const h = draw(<TeamMap d={d} />);
    expect(h.querySelectorAll("tbody tr")).toHaveLength(2); expect(h.querySelectorAll(".cell")).toHaveLength(12);
    expect(h.querySelector(".cell")!.getAttribute("title")).toContain("Team A");
  });
});

describe("widget manifest", () => {
  const m = JSON.parse(readFileSync(resolve(__dirname, "../planner/vss-extension.json"), "utf8"));
  it("declares three widgets with a shared configuration and existing pages, previews and builds", () => {
    const widgets = m.contributions.filter((c: { type: string }) => c.type === "ms.vss-dashboards-web.widget");
    expect(widgets).toHaveLength(3);
    const config = m.contributions.find((c: { type: string }) => c.type === "ms.vss-dashboards-web.widget-configuration");
    for (const w of widgets) {
      expect(w.targets).toContain("ms.vss-dashboards-web.widget-catalog");
      expect(w.targets).toContain(`amanullah-ado.resource-planner.${config.id}`);
      expect(existsSync(resolve(__dirname, "../planner", w.properties.previewImageUrl))).toBe(true);
      expect(existsSync(resolve(__dirname, "../planner", w.properties.catalogIconUrl))).toBe(true);
    }
    expect(m.scopes.sort()).toEqual(["vso.project", "vso.work"]);
    expect(m.description.length).toBeLessThan(200);
  });
});
