import { describe, expect, it } from "vitest";
import { doneDatesFromField, doneDatesFromTimelines, lastQuarters, quarterLabel, quartersIn, summarizeDelivery } from "../planner/src/core/delivery";
import { normalizeSettings } from "../planner/src/core/settings";
import { addRevisions } from "../planner/src/core/asof";
import { defaultExec } from "../planner/src/core/types";

const NOW = new Date("2026-10-28T10:00:00Z"), d = (s: string) => Date.parse(s + "T00:00:00Z");
const cfg = (o: Partial<ReturnType<typeof defaultExec>["delivery"]> = {}) => ({ ...defaultExec().delivery, ...o });

describe("delivery performance", () => {
  it("names quarters and lists the last n, or the quarters a period touches", () => {
    expect(quarterLabel(d("2026-10-28"))).toBe("Q4 26"); expect(lastQuarters(NOW, 3).map(q => q.label)).toEqual(["Q2 26", "Q3 26", "Q4 26"]);
    expect(lastQuarters(new Date("2026-02-01T00:00:00Z"), 3).map(q => q.label)).toEqual(["Q3 25", "Q4 25", "Q1 26"]);       // across a year end
    expect(quartersIn(d("2026-02-15"), d("2026-08-01")).map(q => q.label)).toEqual(["Q1 26", "Q2 26", "Q3 26"]);
  });
  it("finds when an Epic last reached a done state, and none for an Epic that is not done now (or reopened)", () => {
    const tl = addRevisions({}, [
      { id: 1, at: "2026-05-01T10:00:00Z", v: { "System.State": "Active" } }, { id: 1, at: "2026-06-10T10:00:00Z", v: { "System.State": "Closed" } },
      { id: 2, at: "2026-05-01T10:00:00Z", v: { "System.State": "Closed" } }, { id: 2, at: "2026-06-01T10:00:00Z", v: { "System.State": "Active" } },
      { id: 3, at: "2026-04-01T10:00:00Z", v: { "System.State": "Closed" } }, { id: 3, at: "2026-04-20T10:00:00Z", v: { "System.State": "Active" } }, { id: 3, at: "2026-09-02T10:00:00Z", v: { "System.State": "Closed" } },
    ]);
    const r = doneDatesFromTimelines(tl, ["Done", "Closed"]);
    expect(new Date(r[1]).toISOString().slice(0, 10)).toBe("2026-06-10"); expect(r[2]).toBeUndefined(); expect(new Date(r[3]).toISOString().slice(0, 10)).toBe("2026-09-02");
  });
  it("reads the completed date from a field", () => {
    expect(doneDatesFromField([{ id: 1, extra: { "X.Closed": "2026-07-04T08:00:00Z" } }, { id: 2, extra: {} }], "X.Closed")).toEqual({ 1: d("2026-07-04") });
    expect(doneDatesFromField([{ id: 1, extra: {} }], "")).toEqual({});
  });
  const items = [
    { id: 1, title: "On time", goLive: d("2026-08-31"), moves: 0, done: true }, { id: 2, title: "Late 10", goLive: d("2026-08-20"), moves: 2, done: true }, { id: 3, title: "Late 45", goLive: d("2026-07-10"), moves: 3, done: true },
    { id: 4, title: "Not done", goLive: d("2026-08-01"), moves: 0, done: false }, { id: 5, title: "No go-live", moves: 0, done: true }, { id: 6, title: "Early", goLive: d("2026-09-20"), moves: 1, done: true },
  ];
  const doneAt = { 1: d("2026-08-28"), 2: d("2026-08-30"), 3: d("2026-08-24"), 4: d("2026-08-30"), 5: d("2026-08-30"), 6: d("2026-09-10") };
  it("counts on time, late and late over the limit, per quarter and for the recent quarters", () => {
    const r = summarizeDelivery({ items, all: items, doneAt, s: cfg({ recent: 2, quarters: 3 }), now: NOW });
    expect(r.known).toBe(4);                                                                  // not done and no go-live are left out
    const q3 = r.columns.find(c => c.label === "Q3 26")!; expect(q3).toMatchObject({ on: 2, late1: 1, late2: 1, total: 4, rate: 50 });
    expect(r.rate).toBe(50); expect(r.avgLate).toBe(Math.round((10 + 45) / 2)); expect(r.recentCount).toBe(4);
    expect(r.worst.map(e => e.title)).toEqual(["Late 45", "Late 10"]); expect(r.worst[0].late).toBe(45);
  });
  it("lets the limits be set: a grace period, the severe band and the predictable range", () => {
    const g = summarizeDelivery({ items, all: items, doneAt, s: cfg({ recent: 2, quarters: 3, graceDays: 10, severeDays: 60, predictDays: 5 }), now: NOW });
    expect(g.rate).toBe(75); expect(g.columns.find(c => c.label === "Q3 26")).toMatchObject({ on: 3, late1: 1, late2: 0 });      // 10 days late now counts as on time
    expect(g.predictable).toBe(Math.round(100 * 1 / 4));                                       // only the one delivered 3 days early is within ±5
  });
  it("compares the recent quarters with the same number before, and counts what was due last quarter", () => {
    const more = [...items, { id: 7, title: "Old late", goLive: d("2026-02-01"), moves: 0, done: true }, { id: 8, title: "Old on time", goLive: d("2026-03-01"), moves: 0, done: true }];
    const at = { ...doneAt, 7: d("2026-02-20"), 8: d("2026-02-25") };
    const r = summarizeDelivery({ items: more, all: more, doneAt: at, s: cfg({ recent: 1, quarters: 4 }), now: new Date("2026-10-28T00:00:00Z") });
    expect(r.rate).toBeUndefined();                                                            // nothing was delivered in Q4 26 yet
    const r2 = summarizeDelivery({ items: more, all: more, doneAt: at, s: cfg({ recent: 2, quarters: 4 }), now: NOW });
    expect(r2.rate).toBe(50);                                                                  // Q3 26 and Q4 26
    expect(r2.lastQuarter).toBe("Q3 26"); expect(r2.delivered).toBe(4); expect(r2.due).toBe(more.filter(e => e.goLive && e.goLive >= d("2026-07-01") && e.goLive <= d("2026-09-30")).length);
  });
  it("has settings with limits kept in range and unknown parts dropped", () => {
    const s = normalizeSettings({ executive: { delivery: { source: "field", dateField: "X.Closed", graceDays: -4, severeDays: 0, quarters: 99, recent: 0, show: ["rate", "nope", "chart"] } } }).executive.delivery;
    expect(s).toMatchObject({ enabled: true, source: "field", dateField: "X.Closed", graceDays: 0, severeDays: 1, quarters: 12, recent: 1, show: ["rate", "chart"] });
    expect(normalizeSettings({}).executive.delivery).toMatchObject({ source: "history", graceDays: 0, severeDays: 30, predictDays: 14, quarters: 6, recent: 4 });
  });
});
