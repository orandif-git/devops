import { describe, expect, it } from "vitest";
import { evenStages, expectedIdx, IGNORE, resolveStage, stageProgress, stageSince, stagesOn, defaultStages } from "../planner/src/core/stages";
import { addRevisions } from "../planner/src/core/asof";
import { buildExec } from "../planner/src/core/executive";
import { normalizeSettings } from "../planner/src/core/settings";
import { EpicRecord } from "../planner/src/core/types";

const names = ["Design", "Development", "SIT", "UAT", "Deployment"];
const st = (o = {}) => ({ ...defaultStages(), source: "field" as const, field: "Custom.DS", stages: evenStages(names), map: { Design: "Design", Development: "Development", SIT: "SIT", UAT: "UAT", Deployment: "Deployment", Cancelled: IGNORE }, ...o });
const e = (v: string, state = "Active") => ({ state, extra: { "Custom.DS": v } });

describe("delivery stages", () => {
  it("are on only with stages and a mapping", () => { expect(stagesOn(defaultStages())).toBe(false); expect(stagesOn(st())).toBe(true); });
  it("share progress and time evenly by default", () => {
    const s = evenStages(names); expect(s.map(x => x.pct)).toEqual([17, 33, 50, 67, 83]); expect(s[0]).toMatchObject({ from: 0, to: 20 }); expect(s[4]).toMatchObject({ from: 80, to: 100 });
  });
  it("resolve a value to a stage, ignore, unmapped or none, regardless of case", () => {
    expect(resolveStage(e("uat"), st())).toMatchObject({ kind: "stage", idx: 3 }); expect(resolveStage(e("Cancelled"), st()).kind).toBe("ignore");
    expect(resolveStage(e("Weird"), st()).kind).toBe("unmapped"); expect(resolveStage(e(""), st()).kind).toBe("none");
  });
  it("read the state when the field is empty (both) or only the state", () => {
    const s = st({ source: "both", map: { Active: "Development" } }); expect(resolveStage(e("", "Active"), s)).toMatchObject({ kind: "stage", idx: 1 });
    expect(resolveStage(e("Design", "Active"), { ...s, map: { ...s.map, Design: "Design" } }).idx).toBe(0);
    expect(resolveStage(e("Design", "Active"), st({ source: "state", map: { Active: "SIT" } })).idx).toBe(2);
  });
  it("progress steps with the stage, or moves with the planned window when smoothing", () => {
    expect(stageProgress(st(), 2, 0.5)).toBe(50); const sm = st({ smooth: true });
    expect(stageProgress(sm, 2, 0.4)).toBe(50); expect(stageProgress(sm, 2, 0.5)).toBeGreaterThan(50); expect(stageProgress(sm, 2, 0.6)).toBeLessThanOrEqual(67);
    expect(stageProgress(sm, 4, 0.9)).toBe(83);          // the last stage has no next one
  });
  it("tell the stage an Epic should be in for the time used", () => { const s = st(); expect(expectedIdx(s, 0.05)).toBe(0); expect(expectedIdx(s, 0.5)).toBe(2); expect(expectedIdx(s, 1)).toBe(4); });
  it("find when an Epic entered its current stage from the history", () => {
    const tl = addRevisions({}, [
      { id: 1, at: "2026-03-01T00:00:00Z", v: { "Custom.DS": "Design" } }, { id: 1, at: "2026-05-01T00:00:00Z", v: { "Custom.DS": "Development" } }, { id: 1, at: "2026-06-01T00:00:00Z", v: { "System.Title": "x" } },
    ]);
    expect(new Date(stageSince(tl, st())[1]).toISOString().slice(0, 10)).toBe("2026-05-01");
  });
});

const TODAY = new Date("2026-10-14T00:00:00Z");
const base = { sources: [], epicStartField: "Custom.Start", epicTargetField: "Custom.GoLive", executive: { progress: [{ id: "a", kind: "percentField", field: "Custom.Pct" }], stages: st() } };
const ep = (id: number, ds: string, start: string, goLive: string, pct = "99"): EpicRecord => ({ id, title: "E" + id, state: "Active", type: "Epic", areaPath: "P", iterationPath: "P", changed: "", start, target: goLive, grids: {}, extra: { "Custom.DS": ds, "Custom.Pct": pct } });
const run = (epics: EpicRecord[], extra: Record<string, unknown> = {}, stageSinceMap?: Record<number, number>) =>
  buildExec({ epics, gridDone: {}, bookings: [], avail: { records: [], hours: () => null, team: () => "" }, settings: normalizeSettings({ ...base, executive: { ...base.executive, ...extra } }), today: TODAY, stageSince: stageSinceMap }).rows;

describe("stages in the executive status", () => {
  it("take progress from the stage, never from the percent field", () => {
    const [a] = run([ep(1, "SIT", "2026-01-01", "2027-04-01", "99")]); expect(a.pct).toBe(50);
  });
  it("flag an Epic that is stages behind for the time used", () => {
    const [a, b, c] = run([ep(1, "Design", "2026-06-01", "2026-12-31"), ep(2, "SIT", "2026-06-01", "2026-12-31"), ep(3, "UAT", "2026-06-01", "2026-12-31")]);
    expect(a.status).toBe("red"); expect(a.stageLag).toBeGreaterThanOrEqual(2); expect(b.status).toBe("amber"); expect(c.status).toBe("green");
  });
  it("can switch the lag rule off", () => { expect(run([ep(1, "Design", "2026-06-01", "2026-12-31")], { stages: { ...st(), lagRule: false } })[0].status).toBe("green"); });
  it("flag an Epic that has stayed too long in a stage", () => {
    const [a] = run([ep(1, "UAT", "2026-06-01", "2026-12-31")], {}, { 1: Date.parse("2026-07-01") });
    expect(a.status).toBe("amber"); expect(a.stageDays).toBeGreaterThan(45); expect(a.reasons.join(" ")).toMatch(/UAT for \d+ days/);
  });
  it("say so when the value has no stage", () => {
    const [a, b] = run([ep(1, "Weird", "2026-06-01", "2026-12-31"), ep(2, "", "2026-06-01", "2026-12-31")]);
    expect(a.stage).toBeUndefined(); expect(a.reasons.join(" ")).toMatch(/not mapped/); expect(b.reasons.join(" ")).toMatch(/No delivery stage/);
  });
});

describe("stage settings", () => {
  it("are cleaned: duplicate names, out-of-range numbers and mappings to unknown stages", () => {
    const s = normalizeSettings({ executive: { stages: { stages: [{ name: "A", pct: 150, from: -5, to: 50 }, { name: "A", pct: 10, from: 0, to: 10 }, { name: "B", pct: 60, from: 50, to: 100 }], map: { x: "A", y: "Gone", z: IGNORE }, lagAmber: 99, stuckDays: 0 } } }).executive.stages;
    expect(s.stages.map(x => x.name)).toEqual(["A", "B"]); expect(s.stages[0]).toMatchObject({ pct: 100, from: 0 }); expect(s.map).toEqual({ x: "A", z: IGNORE }); expect(s.lagAmber).toBe(10); expect(s.stuckDays).toBe(1);
  });
});
