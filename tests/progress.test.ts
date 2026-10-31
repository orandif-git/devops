import { describe, expect, it } from "vitest";
import { buildProgress, defaultProgress, fmtDay, normProgress, progressFields, ProgressSettings } from "../src/core/progress";
import { normalizeProject } from "../src/core/normalize";
import { emptyConfig } from "../src/core/types";
import { evenStages } from "../planner/src/core/stages";

const names = ["Design", "Development", "SIT", "UAT", "Deployment"];
const dates = { enabled: true, fallback: true, consistency: true, track: true, late: true, lateDays: 7, delivered: "", stages: {
  Design: { startMode: "field", start: "Custom.ES", endMode: "next" }, Development: { startMode: "field", start: "Custom.Dev", endMode: "next" }, SIT: { startMode: "field", start: "Custom.SIT", endMode: "next" },
  UAT: { startMode: "field", start: "Custom.UAT", endMode: "field", end: "Custom.UATDone" }, Deployment: { startMode: "prev", endMode: "none" } } };
const settings = (o: Record<string, unknown> = {}): ProgressSettings => normProgress({ enabled: true, workItemType: "Epic", stages: { source: "field", field: "Custom.DS", stages: evenStages(names), map: Object.fromEntries(names.map(n => [n, n])), dates }, ...o });
const T = Date.UTC(2026, 9, 31);
const run = (f: Record<string, string>, o: Record<string, unknown> = {}) => buildProgress({ settings: settings(o), fields: { "System.WorkItemType": "Epic", "System.State": "Active", ...f }, today: T });
const marks = (m: ReturnType<typeof run>) => (m.kind === "shown" ? m.steps.map(s => s.mark) : []);

describe("Delivery progress settings", () => {
  it("are off by default and keep a config without them unchanged", () => {
    expect(defaultProgress().enabled).toBe(false); expect(normalizeProject(emptyConfig()).progress).toBeUndefined();
    expect(normalizeProject({ ...emptyConfig(), progress: { enabled: true } as never }).progress).toMatchObject({ enabled: true, workItemType: "Epic", groupLabel: "Delivery progress", showTime: true, flags: true });
  });
  it("clean the values and keep only a complete layout record", () => {
    const p = normProgress({ enabled: "yes", workItemType: " Feature ", groupLabel: "", doneStates: [" Done ", "", "Done", 3], layout: { processId: "p1", groupId: "", processName: "x" } });
    expect(p).toMatchObject({ enabled: false, workItemType: "Feature", groupLabel: "Delivery progress", doneStates: ["Done"] }); expect(p.layout).toBeUndefined();
    expect(normProgress({ layout: { processId: "p1", processName: "Agile", groupId: "g1", at: "2026-10-31" } }).layout).toEqual({ processId: "p1", processName: "Agile", groupId: "g1", at: "2026-10-31" });
  });
  it("list the fields the control reads", () => { expect(progressFields(settings())).toEqual(["System.WorkItemType", "System.State", "Custom.DS", "Custom.ES", "Custom.Dev", "Custom.SIT", "Custom.UAT", "Custom.UATDone"]); });
});

describe("Delivery progress model", () => {
  const full = { "Custom.DS": "UAT", "Custom.ES": "2026-05-11", "Custom.Dev": "2026-06-29", "Custom.SIT": "2026-09-14", "Custom.UAT": "2026-10-19" };
  it("draws nothing when it is off, for another work item type, or without stages", () => {
    expect(run(full, { enabled: false }).kind).toBe("hidden"); expect(buildProgress({ settings: settings(), fields: { "System.WorkItemType": "Bug", ...full }, today: T }).kind).toBe("hidden"); expect(buildProgress({ settings: defaultProgress(), fields: {}, today: T }).kind).toBe("hidden");
  });
  it("marks the stages done, current and not reached, and shows the days in the current stage", () => {
    const m = run(full); expect(marks(m)).toEqual(["done", "done", "done", "cur", "todo"]); if (m.kind !== "shown") throw new Error(); expect(m.current).toBe("UAT"); expect(m.days).toBe(12); expect(m.flags).toEqual([]);
    expect(m.steps[1].tip).toEqual(["Started 29 Jun 2026", "Ended 14 Sep 2026", "Duration 77 d"]); expect(m.steps[3].tip).toEqual(["Started 19 Oct 2026", "Open", "Duration 12 d"]);
  });
  it("can hide the time in stage and the flags", () => { const m = run({ ...full, "Custom.SIT": "2026-07-27", "Custom.Dev": "2026-08-10" }, { showTime: false, flags: false }); if (m.kind !== "shown") throw new Error(); expect(m.days).toBeUndefined(); expect(m.flags).toEqual([]); expect(m.steps.some(s => s.bad)).toBe(false); });
  it("flags a missing start date, out of order dates, a skipped stage and rework, without guessing durations", () => {
    const miss = run({ "Custom.DS": "SIT", "Custom.ES": "2026-04-06", "Custom.Dev": "2026-06-08" }); if (miss.kind !== "shown") throw new Error(); expect(miss.flags.map(f => f.level)).toEqual(["w"]); expect(miss.steps[2].bad).toBe(true); expect(miss.days).toBeUndefined();
    const order = run({ ...full, "Custom.Dev": "2026-08-10", "Custom.SIT": "2026-07-27" }); if (order.kind !== "shown") throw new Error(); expect(order.flags).toEqual([{ level: "r", text: "SIT starts before the stage above it, so no duration is shown." }]);
    const skip = run({ "Custom.DS": "UAT", "Custom.ES": "2026-05-04", "Custom.Dev": "2026-07-06", "Custom.UAT": "2026-10-12" }); expect(marks(skip)).toEqual(["done", "done", "skip", "cur", "todo"]);
    const rw = run({ "Custom.DS": "Development", "Custom.ES": "2026-03-23", "Custom.Dev": "2026-06-01", "Custom.SIT": "2026-09-07" }); expect(marks(rw)).toEqual(["done", "rework", "todo", "todo", "todo"]); if (rw.kind !== "shown") throw new Error(); expect(rw.flags[0].text).toMatch(/rework/);
  });
  it("shows a delivered work item with all stages done and the delivered date", () => {
    const m = run({ ...full, "Custom.DS": "Deployment", "Custom.UATDone": "2026-10-25" }); const d = buildProgress({ settings: settings(), fields: { "System.WorkItemType": "Epic", "System.State": "Closed", ...full, "Custom.DS": "Deployment", "Custom.UATDone": "2026-10-25" }, today: T });
    expect(m.kind).toBe("shown"); expect(marks(d)).toEqual(["done", "done", "done", "done", "done"]); if (d.kind !== "shown") throw new Error(); expect(d.delivered).toBe(Date.UTC(2026, 9, 25)); expect(d.days).toBeUndefined();
  });
  it("says so when the stage field holds a value that is not a stage, and draws the steps without a current one when it is empty", () => {
    const u = run({ "Custom.DS": "Mystery" }); if (u.kind !== "shown") throw new Error(); expect(u.note).toMatch(/Mystery/); expect(marks(u)).toEqual(["todo", "todo", "todo", "todo", "todo"]); expect(u.current).toBe("");
    const n = run({}); if (n.kind !== "shown") throw new Error(); expect(n.note).toBeUndefined();
  });
  it("works without dates: the steps and the current stage only", () => {
    const m = buildProgress({ settings: normProgress({ enabled: true, stages: { source: "field", field: "Custom.DS", stages: evenStages(names), map: Object.fromEntries(names.map(n => [n, n])) } }), fields: { "System.WorkItemType": "Epic", "System.State": "Active", "Custom.DS": "SIT" }, today: T });
    expect(marks(m)).toEqual(["done", "done", "cur", "todo", "todo"]); if (m.kind !== "shown") throw new Error(); expect(m.days).toBeUndefined(); expect(m.steps[2].tip).toEqual([]);
  });
  it("formats a day in UTC", () => { expect(fmtDay(Date.UTC(2026, 8, 14))).toBe("14 Sep 2026"); expect(fmtDay(undefined)).toBe("–"); });
});
