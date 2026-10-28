import { describe, expect, it } from "vitest";
import { decodeView, encodeView, normalizeDoc, normalizeView, ViewState } from "../planner/src/core/views";

const std: ViewState = { view: "heat", group: "team", units: "h", rows: "collapsed", period: { kind: "year" }, team: "", query: "", people: "", epics: "", states: [], extra: {}, showIdle: true, ganttGroup: "area", legend: [], tiles: ["epics", "late"], zoom: "m", density: "comfortable" };

describe("views", () => {
  it("fills in anything missing or invalid with the standard view", () => {
    expect(normalizeView({}, std)).toEqual(std);
    const v = normalizeView({ view: "nope", group: "epic", legend: ["s:Closed", 5], tiles: ["late", "bogus"], period: { kind: "x" } }, std);
    expect(v.view).toBe("heat"); expect(v.group).toBe("epic"); expect(v.legend).toEqual(["s:Closed"]); expect(v.tiles).toEqual(["late"]); expect(v.period).toEqual({ kind: "year" });
  });
  it("round-trips through a link text, writing only what differs", () => {
    const s: ViewState = { ...std, view: "gantt", legend: ["t:late"], epics: "Portal ünïcode", team: "Ops", extra: { "Custom.BU": ["A B"] } };
    const text = encodeView(s, std);
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(JSON.parse(Buffer.from(text, "base64url").toString())).not.toHaveProperty("units");
    expect(decodeView(text, std)).toEqual(s);
    expect(decodeView("%%%not a view", std)).toBeUndefined();
  });
  it("keeps only valid saved views and a default that exists", () => {
    const d = normalizeDoc({ views: [{ id: "a", name: " Late ", state: { view: "gantt" } }, 7, { name: "" }], defaultId: "zzz" }, std);
    expect(d.views.map(v => v.name)).toEqual(["Late", "View 2"]); expect(d.views[0].state.view).toBe("gantt"); expect(d.defaultId).toBeUndefined();
    expect(normalizeDoc({ views: [{ id: "a" }], defaultId: "a" }, std).defaultId).toBe("a");
  });
});
