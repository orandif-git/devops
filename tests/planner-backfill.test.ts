import { describe, expect, it, vi } from "vitest";
const store = vi.hoisted(() => ({ doc: undefined as undefined | { snapshots: unknown[] }, writes: 0, pages: [] as unknown[], asked: [] as Record<string, unknown>[] }));
vi.mock("../src/shared/ado", () => ({ dataManager: async () => ({ getDocument: async () => { if (!store.doc) throw new Error("DocumentDoesNotExist"); return store.doc; }, setDocument: async (_c: string, d: { snapshots: unknown[] }) => { store.doc = d; store.writes++; } }) }));
vi.mock("../planner/src/rest", () => ({ restGet: async (_p: string, q: Record<string, unknown>) => { store.asked.push(q); return store.pages.shift() ?? { values: [], isLastBatch: true }; } }));
vi.mock("../planner/src/data/idb", () => ({ cacheGet: async () => undefined, cacheSet: async () => undefined }));
import { addRevisions, backfillSnapshots, epicAsOf, previousWeeks, trackedFields } from "../planner/src/core/asof";
import { normalizeSettings } from "../planner/src/core/settings";
import { recordSnapshot } from "../planner/src/data/snapshots";
import { loadRevisionData } from "../planner/src/data/history";
import { Snapshot } from "../planner/src/core/snapshots";
import { EpicRecord } from "../planner/src/core/types";

const s = normalizeSettings({ epicStartField: "Custom.Start", epicTargetField: "Custom.GoLive", executive: { enabled: true, progress: [{ id: "a", kind: "percentField", field: "Custom.Pct" }] } });
const epic = (id: number): EpicRecord => ({ id, title: "E" + id, state: "Active", type: "Epic", areaPath: "P", iterationPath: "P", changed: "", start: "2026-01-05", target: "2026-12-18", grids: {}, extra: {} });

describe("trend lines rebuilt from the work item history", () => {
  it("tracks the fields the status depends on", () => {
    expect(trackedFields(s).sort()).toEqual(["Custom.GoLive", "Custom.Pct", "Custom.Start", "System.State"]);
  });
  it("keeps a point only when a tracked field changed, and merges new revisions into the old ones", () => {
    const a = addRevisions({}, [{ id: 1, at: "2026-09-01T10:00:00Z", v: { "System.State": "New", "Custom.Pct": "0" } }, { id: 1, at: "2026-09-02T10:00:00Z", v: { "System.State": "New", "Custom.Pct": "0" } }, { id: 1, at: "2026-09-10T10:00:00Z", v: { "Custom.Pct": "40" } }]);
    expect(a[1].map(p => p.at)).toEqual(["2026-09-01T10:00:00Z", "2026-09-10T10:00:00Z"]); expect(a[1][1].v).toEqual({ "System.State": "New", "Custom.Pct": "40" });   // an unchanged field carries on
    const b = addRevisions(a, [{ id: 1, at: "2026-09-10T10:00:00Z", v: { "Custom.Pct": "40" } }, { id: 1, at: "2026-09-20T10:00:00Z", v: { "System.State": "Active" } }]);
    expect(b[1]).toHaveLength(3); expect(b[1][2].v["System.State"]).toBe("Active");
  });
  it("rebuilds an Epic as it was, and says nothing for a day before it existed", () => {
    const tl = addRevisions({}, [{ id: 1, at: "2026-09-01T10:00:00Z", v: { "System.State": "New", "Custom.Start": "2026-09-15T00:00:00Z", "Custom.GoLive": "2026-12-01T00:00:00Z" } }, { id: 1, at: "2026-10-05T10:00:00Z", v: { "System.State": "Active", "Custom.Pct": "30" } }]);
    expect(epicAsOf(epic(1), tl[1], "2026-08-31T00:00:00Z", s)).toBeUndefined();
    const early = epicAsOf(epic(1), tl[1], "2026-09-20T00:00:00Z", s)!; expect(early).toMatchObject({ state: "New", start: "2026-09-15", target: "2026-12-01" });
    const late = epicAsOf(epic(1), tl[1], "2026-10-20T00:00:00Z", s)!; expect(late.state).toBe("Active"); expect(late.extra["Custom.Pct"]).toBe("30");
  });
  it("names the eight Mondays before this week", () => {
    expect(previousWeeks(new Date("2026-10-28T10:00:00Z"), 3)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
  });
  it("builds one snapshot per earlier week, as it would have been then", () => {
    // started 1 Sept, go-live 15 Oct: past its date from the week of 12 Oct on
    const tl = addRevisions({}, [{ id: 1, at: "2026-09-01T10:00:00Z", v: { "System.State": "Active", "Custom.Start": "2026-09-01", "Custom.GoLive": "2026-10-15", "Custom.Pct": "50" } }, { id: 2, at: "2026-10-14T10:00:00Z", v: { "System.State": "New" } }]);
    const base = [{ ...epic(1), start: "2026-09-01", target: "2026-10-15" }, { ...epic(2) }];
    const snaps = backfillSnapshots({ epics: base, timelines: tl, settings: s, weeks: ["2026-10-05", "2026-10-12", "2026-10-19"] });
    expect(snaps.map(x => x.week)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]); expect(snaps.every(x => x.rebuilt)).toBe(true);
    expect(snaps[0].total).toBe(1); expect(snaps[1].total).toBe(2); expect(snaps[2].total).toBe(2);       // Epic 2 was created on 14 Oct, in the week of the 12th
    expect(snaps[0].red).toBe(0); expect(snaps[1].red).toBe(1);                                          // not yet late on Sunday 11 Oct, late by Sunday 18 Oct
  });
  it("rebuilds the missing earlier weeks once, never replaces a recorded week, and writes the result", async () => {
    store.doc = { snapshots: [{ week: "2026-10-19", at: "2026-10-19T08:00:00Z", total: 9, progress: 1, late: 0, due30: 0, hold: 0, green: 9, amber: 0, red: 0, idle: 0, unknown: 0, done: 0 }] }; store.writes = 0;
    const cur = { week: "2026-10-26", at: "2026-10-28T09:00:00Z", total: 3, progress: 1, late: 0, due30: 0, hold: 0, green: 3, amber: 0, red: 0, idle: 0, unknown: 0, done: 0 } as Snapshot;
    const asked: string[][] = [];
    const out = await recordSnapshot("P", cur, async weeks => { asked.push(weeks); return weeks.map(w => ({ ...cur, week: w, at: w + "T12:00:00Z", total: 5, rebuilt: true })); });
    expect(asked[0]).not.toContain("2026-10-19"); expect(asked[0]).toHaveLength(7);                      // the recorded week is not asked for
    expect(out.find(x => x.week === "2026-10-19")!.total).toBe(9); expect(out.filter(x => x.rebuilt)).toHaveLength(7); expect(store.writes).toBe(1);
    await recordSnapshot("P", cur, async () => { throw new Error("must not be asked again"); });         // all weeks are there now
    expect(store.writes).toBe(1);
    const failed = await recordSnapshot("P", { ...cur, week: "2027-03-01", at: "2027-03-02T09:00:00Z" }, async () => { throw new Error("no history"); });
    expect(failed.some(x => x.week === "2027-03-01")).toBe(true);                                         // a failing rebuild never breaks the snapshot
  });
  it("reads the tracked fields in the same pass as the date history", async () => {
    store.pages = [{ values: [{ id: 1, rev: 1, fields: { "System.ChangedDate": "2026-09-01T10:00:00Z", "System.ChangedBy": "Ana", "Custom.GoLive": "2026-12-01T00:00:00Z", "System.State": "New" } }, { id: 1, rev: 2, fields: { "System.ChangedDate": "2026-10-01T10:00:00Z", "System.ChangedBy": "Ana", "Custom.GoLive": "2026-12-15T00:00:00Z", "System.State": "Active" } }], isLastBatch: true }]; store.asked = [];
    const r = await loadRevisionData({ id: "P", name: "Proj" }, "Epic", ["Custom.GoLive"], ["System.State", "Custom.GoLive"]);
    expect(r.map["Custom.GoLive"][1].changes).toHaveLength(1); expect(r.timelines[1].map(p => p.v["System.State"])).toEqual(["New", "Active"]);
    expect(String(store.asked[0].fields)).toContain("System.State");
  });
});
