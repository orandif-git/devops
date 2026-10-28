import { describe, expect, it, vi } from "vitest";
const pages = vi.hoisted(() => ({ calls: [] as Record<string, unknown>[], data: [] as unknown[] }));
vi.mock("../src/shared/ado", () => ({ downloadFile: () => undefined }));
vi.mock("../planner/src/rest", () => ({ restGet: async (_path: string, q: Record<string, unknown>) => { pages.calls.push(q); return pages.data[pages.calls.length - 1]; } }));
import { applyRevisions, historyFromUpdates, movedTags, summarize } from "../planner/src/core/history";
import { buildExec } from "../planner/src/core/executive";
import { normalizeSettings } from "../planner/src/core/settings";
import { loadHistory } from "../planner/src/data/history";

const rev = (id: number, r: number, at: string, value: string, by = "Ann") => ({ id, rev: r, at, by, value });

describe("go-live history", () => {
  it("keeps the first date as the baseline and records every later change, ignoring cleared values and revisions already seen", () => {
    const a = applyRevisions({}, [rev(1, 3, "2026-03-01T10:00:00Z", "2026-12-01T00:00:00Z"), rev(1, 1, "2026-01-01T10:00:00Z", "2026-09-15T00:00:00Z"), rev(1, 2, "2026-02-01T10:00:00Z", ""), rev(2, 1, "2026-01-05T10:00:00Z", "2026-10-10T00:00:00Z")]);
    expect(a[1]).toMatchObject({ baseline: "2026-09-15", current: "2026-12-01", rev: 3 }); expect(a[1].changes).toEqual([{ at: "2026-03-01T10:00:00Z", by: "Ann", from: "2026-09-15", to: "2026-12-01" }]);
    expect(a[2].changes).toEqual([]);
    const b = applyRevisions(a, [rev(1, 3, "2026-03-01T10:00:00Z", "2026-12-01T00:00:00Z"), rev(1, 4, "2026-05-01T10:00:00Z", "2026-11-01T00:00:00Z", "Bo")]);       // a re-read plus one new revision
    expect(b[1].changes.map(c => c.to)).toEqual(["2026-12-01", "2026-11-01"]); expect(b[1].changes[1].by).toBe("Bo");
  });
  it("reads one Epic's updates the same way", () => {
    const h = historyFromUpdates([{ rev: 5, revisedDate: "2026-04-01T00:00:00Z", revisedBy: { displayName: "Cy" }, fields: { "Custom.G": { oldValue: "2026-09-01T00:00:00Z", newValue: "2026-10-01T00:00:00Z" } } },
      { rev: 2, revisedDate: "2026-01-01T00:00:00Z", fields: { "Custom.Other": { newValue: "x" } } }, { rev: 8, revisedDate: "2026-06-01T00:00:00Z", revisedBy: "Dee", fields: { "Custom.G": { oldValue: "2026-10-01T00:00:00Z", newValue: "2026-08-01T00:00:00Z" } } }], "Custom.G");
    expect(h).toMatchObject({ baseline: "2026-09-01", current: "2026-08-01" }); expect(h!.changes).toHaveLength(2); expect(historyFromUpdates([], "Custom.G")).toBeUndefined();
  });
  it("summarises moves, direction and recent moves, and names the filters", () => {
    const h = applyRevisions({}, [rev(1, 1, "2026-01-01T00:00:00Z", "2026-09-01"), rev(1, 2, "2026-08-20T00:00:00Z", "2026-11-01"), rev(1, 3, "2026-09-20T00:00:00Z", "2026-12-15")])[1];
    const s = summarize(h, Date.UTC(2026, 9, 1), 90);
    expect(s).toMatchObject({ moves: 2, later: 2, earlier: 0, net: 105, recent: 2 }); expect(movedTags(s)).toEqual(["Moved later", "Moved 2+ times", "Moved recently"]);
    expect(movedTags(summarize(undefined, 0, 90))).toEqual(["Not moved"]);
    expect(movedTags(summarize(applyRevisions({}, [rev(1, 1, "2026-01-01T00:00:00Z", "2026-09-01"), rev(1, 2, "2026-01-05T00:00:00Z", "2026-08-01")])[1], Date.UTC(2026, 9, 1), 30))).toEqual(["Moved earlier"]);
  });
  it("reads the revisions page by page, then only what is new", async () => {
    pages.calls = []; pages.data = [
      { values: [{ id: 1, rev: 1, fields: { "System.ChangedDate": "2026-01-01T00:00:00Z", "System.ChangedBy": { displayName: "Ann" }, "Custom.G": "2026-09-01T00:00:00Z" } }], isLastBatch: false, continuationToken: "t2" },
      { values: [{ id: 1, rev: 2, fields: { "System.ChangedDate": "2026-02-01T00:00:00Z", "System.ChangedBy": "Bo <bo@x>", "Custom.G": "2026-10-01T00:00:00Z" } }], isLastBatch: true }];
    const m = await loadHistory({ id: "P", name: "Proj" }, "Epic", ["Custom.G"], { force: true });
    expect(pages.calls).toHaveLength(2); expect(pages.calls[1].continuationToken).toBe("t2"); expect(pages.calls[0].includeLatestOnly).toBe("false");
    expect(m["Custom.G"][1]).toMatchObject({ baseline: "2026-09-01", current: "2026-10-01" }); expect(m["Custom.G"][1].changes[0].by).toBe("Bo");
  });
});

describe("history in the executive status", () => {
  const st = (affect: boolean) => normalizeSettings({ epicTargetField: "Custom.G", history: { enabled: true, movesAmber: 2, windowDays: 90, affectStatus: affect }, executive: { progress: [{ id: "a", kind: "percentField", field: "Custom.Pct" }] } });
  const epic = { id: 1, title: "E", state: "Active", type: "Epic", areaPath: "P\\T", iterationPath: "P", changed: "", start: "2026-01-01", target: "2027-06-30", grids: {}, extra: { "Custom.Pct": "60" } };
  const none = { records: [], hours: () => null, team: () => "" };
  const hist = { 1: applyRevisions({}, [rev(1, 1, "2026-01-01T00:00:00Z", "2027-01-01"), rev(1, 2, "2026-09-01T00:00:00Z", "2027-03-01"), rev(1, 3, "2026-09-20T00:00:00Z", "2027-06-30")])[1] };
  it("raises an Epic whose date moved often recently to needs attention, with the reason, unless switched off", () => {
    const run = (s: ReturnType<typeof st>, history?: typeof hist) => buildExec({ epics: [epic], gridDone: {}, bookings: [], avail: none, settings: s, today: new Date("2026-10-01T00:00:00Z"), history }).rows[0];
    const a = run(st(true), hist); expect(a.status).toBe("amber"); expect(a.reasons.join(" ")).toContain("moved 2 times in the last 90 days (+180 days");
    expect(run(st(false), hist).status).not.toBe("amber"); expect(run(st(true)).reasons.join(" ")).not.toContain("moved");
  });
});
