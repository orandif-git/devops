import { describe, expect, it } from "vitest";
import { computeStageDates, recordedLate, typicalStageDays } from "../planner/src/core/stageDates";
import { normalizeSettings } from "../planner/src/core/settings";
import { applyRevisions, historyFromUpdates } from "../planner/src/core/history";
import { buildExec } from "../planner/src/core/executive";
import { EpicRecord } from "../planner/src/core/types";
import { stageDateFields, stageDatesOn, withStageNames, evenStages } from "../planner/src/core/stages";

const names = ["Design", "Development", "SIT", "UAT", "Deployment"];
const dates = { enabled: true, fallback: true, consistency: true, track: true, late: true, lateDays: 7, delivered: "Custom.UATDone", stages: {
  Design: { startMode: "field", start: "Custom.EpicStart", endMode: "next" }, Development: { startMode: "field", start: "Custom.Dev", endMode: "next" }, SIT: { startMode: "field", start: "Custom.SIT", endMode: "next" },
  UAT: { startMode: "field", start: "Custom.UAT", endMode: "field", end: "Custom.UATDone" }, Deployment: { startMode: "prev", endMode: "none" } } };
const st = (o: Record<string, unknown> = {}) => normalizeSettings({ executive: { stages: { source: "field", field: "Custom.DS", stages: evenStages(names), map: { Design: "Design" }, dates: { ...dates, ...o } } } }).executive.stages;
const T = Date.UTC(2026, 9, 31), day = (s: string) => Date.parse(s + "T00:00:00Z");
const run = (extra: Record<string, string>, curIdx: number, o: Partial<Parameters<typeof computeStageDates>[0]> = {}) => computeStageDates({ st: st(), extra, curIdx, done: false, today: T, ...o })!;

describe("stage dates settings", () => {
  it("are off until set up, keep only existing stages and valid modes, and list their fields", () => {
    expect(stageDatesOn(normalizeSettings({}).executive.stages)).toBe(false);
    const s = normalizeSettings({ executive: { stages: { stages: evenStages(["A", "B"]), map: { x: "A" }, dates: { enabled: true, lateDays: 500, stages: { A: { startMode: "field", start: "F.A", endMode: "next", end: "F.IGNORED" }, B: { startMode: "prev", start: "F.X", endMode: "weird" }, Gone: { start: "F.G" } } } } } }).executive.stages;
    expect(s.dates.stages).toEqual({ A: { startMode: "field", start: "F.A", endMode: "next", end: "" }, B: { startMode: "prev", start: "", endMode: "next", end: "" } }); expect(s.dates.lateDays).toBe(90);
    expect(stageDateFields(st())).toEqual(["Custom.EpicStart", "Custom.Dev", "Custom.SIT", "Custom.UAT", "Custom.UATDone"]);
  });
  it("follow a rename of the stages", () => {
    const r = withStageNames(st(), ["Plan", "Build", "Test", "Accept", "Live"]); expect(Object.keys(r.dates.stages)).toEqual(["Plan", "Build", "Test", "Accept", "Live"]); expect(r.dates.stages.Build.start).toBe("Custom.Dev");
    expect(Object.keys(withStageNames(st(), ["Design", "Development"]).dates.stages)).toEqual(["Design", "Development"]);
  });
});

describe("stage dates of an Epic", () => {
  const full = { "Custom.EpicStart": "2026-05-11", "Custom.Dev": "2026-06-29", "Custom.SIT": "2026-09-14", "Custom.UAT": "2026-10-19" };
  it("end a stage where the next one starts, and count the current stage up to today", () => {
    const r = run(full, 3); expect(r.rows[1]).toMatchObject({ start: day("2026-06-29"), end: day("2026-09-14"), dur: 77, endsWith: "SIT" }); expect(r.rows[3]).toMatchObject({ open: true, dur: 12 }); expect(r.timeInStage).toBe(12); expect(r.issues).toEqual([]);
  });
  it("a stage can start when the previous one ends (Deployment after UAT)", () => {
    const r = computeStageDates({ st: st(), extra: { ...full, "Custom.UATDone": "2026-10-25" }, curIdx: 4, done: false, today: T })!; expect(r.rows[4].start).toBe(day("2026-10-25")); expect(r.rows[4].dur).toBe(6);
  });
  it("read a missing start of the current stage from the history and say so", () => {
    const r = run({ "Custom.EpicStart": "2026-04-06", "Custom.Dev": "2026-06-08" }, 2, { since: day("2026-09-21") });
    expect(r.rows[2]).toMatchObject({ missing: true, fromHistory: true, dur: 40 }); expect(r.rows[1]).toMatchObject({ endFromHistory: true, dur: 105 }); expect(r.issues.map(i => i.kind)).toEqual(["missing"]);
    expect(run({ "Custom.Dev": "2026-06-08" }, 2).rows[2].dur).toBeUndefined();                                        // no history either: nothing is guessed
    expect(computeStageDates({ st: st({ fallback: false }), extra: { "Custom.Dev": "2026-06-08" }, curIdx: 2, done: false, today: T, since: day("2026-09-21") })!.rows[2].dur).toBeUndefined();
  });
  it("flag dates out of order and show no duration for them", () => {
    const r = run({ "Custom.EpicStart": "2026-03-02", "Custom.Dev": "2026-08-10", "Custom.SIT": "2026-07-27", "Custom.UAT": "2026-10-05" }, 3);
    expect(r.rows[2].order).toBe(true); expect(r.rows[1].dur).toBeUndefined(); expect(r.rows[2].dur).toBeUndefined(); expect(r.issues.map(i => i.kind)).toEqual(["order"]); expect(r.rows[3].dur).toBe(26);
  });
  it("find a skipped stage: a later stage has a start, this one has none", () => {
    const r = run({ "Custom.EpicStart": "2026-05-04", "Custom.Dev": "2026-07-06", "Custom.UAT": "2026-10-12" }, 3);
    expect(r.rows[2]).toMatchObject({ skipped: true, dur: 0 }); expect(r.rows[1]).toMatchObject({ end: day("2026-10-12"), endsWith: "UAT" }); expect(r.issues.map(i => i.kind)).toEqual(["skipped"]);
  });
  it("find rework: the field is behind the dates; time in stage counts from the history", () => {
    const r = run({ "Custom.EpicStart": "2026-03-23", "Custom.Dev": "2026-06-01", "Custom.SIT": "2026-09-07" }, 1, { since: day("2026-10-02") });
    expect(r.rows[1]).toMatchObject({ rework: true, fromHistory: true, dur: 29, open: true }); expect(r.timeInStage).toBe(29); expect(r.issues.map(i => i.kind)).toEqual(["rework"]);
    expect(run({ "Custom.Dev": "2026-06-01", "Custom.SIT": "2026-09-07" }, 1).rows[1].dur).toBeUndefined();
  });
  it("a finished Epic has the duration of every stage and no open stage", () => {
    const r = computeStageDates({ st: st(), extra: { "Custom.EpicStart": "2026-02-02", "Custom.Dev": "2026-04-13", "Custom.SIT": "2026-06-22", "Custom.UAT": "2026-08-03", "Custom.UATDone": "2026-09-18" }, curIdx: 4, done: true, today: T })!;
    expect(r.rows.map(x => x.dur)).toEqual([70, 70, 42, 46, undefined]); expect(r.rows.some(x => x.open)).toBe(false); expect(r.timeInStage).toBeUndefined(); expect(r.rows[4].start).toBe(day("2026-09-18"));
  });
  it("does nothing when the dates are not set up", () => { expect(computeStageDates({ st: normalizeSettings({}).executive.stages, extra: {}, curIdx: 0, done: false, today: T })).toBeUndefined(); });
});

describe("typical stage durations and recorded late", () => {
  it("take the median of finished stages and need three examples", () => {
    const ex = (dev: string, sit: string) => computeStageDates({ st: st(), extra: { "Custom.Dev": dev, "Custom.SIT": sit, "Custom.UAT": "2026-10-20" }, curIdx: 3, done: false, today: T });
    const all = [ex("2026-06-01", "2026-07-01"), ex("2026-06-01", "2026-07-11"), ex("2026-06-01", "2026-08-01"), undefined];
    expect(typicalStageDays(all, names)).toMatchObject({ Development: 40 }); expect(typicalStageDays(all.slice(0, 2), names).Development).toBeUndefined();
  });
  it("is the days between a date and the day it was entered", () => { expect(recordedLate("2026-09-18", "2026-10-17T10:00:00Z")).toBe(29); expect(recordedLate("2026-09-18", "2026-09-18T08:00:00Z")).toBe(0); expect(recordedLate("", "2026-09-18")).toBeUndefined(); });
});

const TODAY = new Date("2026-10-31T00:00:00Z");
const ep = (id: number, extra: Record<string, string>, state = "Active"): EpicRecord => ({ id, title: "E" + id, state, type: "Epic", areaPath: "P", iterationPath: "P", changed: "", start: "2026-03-01", target: "2027-03-01", grids: {}, extra: { "Custom.DS": "UAT", ...extra } });
const exec = (epics: EpicRecord[], d: Record<string, unknown> = {}, since?: Record<number, number>) => buildExec({ epics, gridDone: {}, bookings: [], avail: { records: [], hours: () => null, team: () => "" }, today: TODAY, stageSince: since,
  settings: normalizeSettings({ epicStartField: "Custom.S", epicTargetField: "Custom.G", executive: { stages: { source: "field", field: "Custom.DS", stages: evenStages(names), map: Object.fromEntries(names.map(n => [n, n])), dates: { ...dates, ...d } } } }) }).rows;

describe("stage dates in the status", () => {
  const full = { "Custom.EpicStart": "2026-05-11", "Custom.Dev": "2026-06-29", "Custom.SIT": "2026-09-14", "Custom.UAT": "2026-10-19" };
  it("time in the current stage comes from the dates, ahead of the history", () => {
    const [r] = exec([ep(1, full)], {}, { 1: day("2026-10-25") }); expect(r.stageDays).toBe(12); expect(r.stageDates!.rows[3].open).toBe(true);
  });
  it("falls back to the history when the dates are off, and ignores the dates altogether when they are not set up", () => {
    expect(exec([ep(1, full)], { enabled: false }, { 1: day("2026-10-25") })[0].stageDays).toBe(6); expect(exec([ep(1, full)], { enabled: false })[0].stageDates).toBeUndefined();
  });
  it("the stuck rule uses the dates: more than the limit in a stage makes it Needs attention", () => {
    const [r] = exec([ep(2, { ...full, "Custom.SIT": "2026-07-10", "Custom.UAT": "2026-08-01" })]); expect(r.stageDays).toBe(91); expect(r.reasons.join(" ")).toMatch(/UAT for 91 days/); expect(r.status).not.toBe("green");
  });
  it("keeps a finished Epic’s stage durations", () => {
    const [r] = exec([ep(3, { ...full, "Custom.UATDone": "2026-10-25", "Custom.DS": "Deployment" }, "Closed")]); expect(r.status).toBe("done"); expect(r.stageDates!.rows[1].dur).toBe(77); expect(r.stageDates!.rows.some(x => x.open)).toBe(false);
  });
});

describe("history of the first entry", () => {
  it("keeps when and by whom the first date was entered, for all Epics and for one Epic", () => {
    const h = applyRevisions({}, [{ id: 1, rev: 3, at: "2026-07-01T10:00:00Z", by: "Sara", value: "2026-06-29" }, { id: 1, rev: 5, at: "2026-09-16T10:00:00Z", by: "Omar", value: "2026-07-03" }])[1];
    expect(h).toMatchObject({ baseline: "2026-06-29", firstAt: "2026-07-01T10:00:00Z", firstBy: "Sara" }); expect(h.changes).toEqual([{ at: "2026-09-16T10:00:00Z", by: "Omar", from: "2026-06-29", to: "2026-07-03" }]);
    const u = historyFromUpdates([{ rev: 2, revisedDate: "2026-07-01T10:00:00Z", revisedBy: { displayName: "Sara" }, fields: { "Custom.Dev": { newValue: "2026-06-29" } } }], "Custom.Dev"); expect(u).toMatchObject({ baseline: "2026-06-29", firstAt: "2026-07-01T10:00:00Z", firstBy: "Sara" });
  });
});
