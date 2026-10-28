import { describe, expect, it, vi } from "vitest";
const store = vi.hoisted(() => ({ doc: undefined as undefined | { snapshots: unknown[] }, writes: 0 }));
vi.mock("../src/shared/ado", () => ({ dataManager: async () => ({ getDocument: async () => { if (!store.doc) { const e = new Error("DocumentDoesNotExist"); throw e; } return store.doc; }, setDocument: async (_c: string, d: { snapshots: unknown[] }) => { store.doc = d; store.writes++; return d; } }) }));
import { deltaOf, health, mergeSnapshot, metricsOf, series, Snapshot, weekKey } from "../planner/src/core/snapshots";
import { recordSnapshot } from "../planner/src/data/snapshots";

const snap = (week: string, over: Partial<Snapshot> = {}): Snapshot => ({ week, at: week + "T08:00:00Z", total: 10, progress: 50, late: 1, due30: 2, hold: 0, green: 5, amber: 2, red: 1, idle: 1, unknown: 0, done: 1, ...over });
const row = (status: string, goLive?: string, pct?: number, late = false, hold = false) => ({ status, goLive: goLive ? Date.parse(goLive) : undefined, pct, late, hold }) as never;

describe("weekly snapshots", () => {
  it("names the Monday of a week", () => {
    expect(weekKey(new Date("2026-10-28T10:00:00Z"))).toBe("2026-10-26"); expect(weekKey(new Date("2026-10-26T00:00:00Z"))).toBe("2026-10-26"); expect(weekKey(new Date("2026-11-01T23:00:00Z"))).toBe("2026-10-26"); expect(weekKey(new Date("2026-11-02T00:00:00Z"))).toBe("2026-11-02");
  });
  it("counts statuses and the measures from the Epics", () => {
    const m = metricsOf([row("green", "2026-11-10", 60), row("red", "2026-10-20", 40, true), row("amber", "2026-12-30", undefined, false, true), row("done", "2026-10-01", 100, true), row("idle")], new Date("2026-10-28T10:00:00Z"));
    expect(m).toMatchObject({ total: 5, green: 1, red: 1, amber: 1, done: 1, idle: 1, late: 1, hold: 1, due30: 1, progress: 67, week: "2026-10-26" });
    expect(health(m)).toBe(50);
  });
  it("keeps the latest 26 weeks, oldest first, one per week, and gives trends and the change since last week", () => {
    let list: Snapshot[] = []; for (let w = 0; w < 30; w++) list = mergeSnapshot(list, snap(new Date(Date.UTC(2026, 0, 5 + w * 7)).toISOString().slice(0, 10), { red: w }));
    expect(list).toHaveLength(26); expect(list[0].week < list[25].week).toBe(true);
    expect(series(list, "red", 3)).toEqual([27, 28, 29]); expect(deltaOf(list, "red")).toBe(1); expect(deltaOf([snap("2026-10-26")], "red")).toBeUndefined();
    expect((m => m[m.length - 1].red)(mergeSnapshot(list, snap(list[25].week, { red: 99 })))).toBe(99);
  });
  it("writes the first snapshot of a week once and reads it back with the new one", async () => {
    store.doc = { snapshots: [snap("2026-10-19", { red: 3 })] }; store.writes = 0;
    const a = await recordSnapshot("P", snap("2026-10-26", { red: 5, at: "2026-10-27T08:00:00Z" }));
    expect(a.map(s => s.week)).toEqual(["2026-10-19", "2026-10-26"]); expect(store.writes).toBe(1);
    const b = await recordSnapshot("P", snap("2026-10-26", { red: 6, at: "2026-10-27T09:00:00Z" }));               // an hour later: not written again
    expect(store.writes).toBe(1); expect(b[b.length - 1].red).toBe(6);
    await recordSnapshot("P", snap("2026-10-26", { red: 7, at: "2026-10-28T09:00:00Z" })); expect(store.writes).toBe(2);
  });
  it("never fails when the store cannot be read", async () => {
    store.doc = undefined; const r = await recordSnapshot("P", snap("2026-10-26"));
    expect(r).toHaveLength(1);
  });
});
