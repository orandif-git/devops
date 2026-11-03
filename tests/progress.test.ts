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
    expect(m.steps[1].tip).toEqual(["Started 29 Jun 2026", "Ended 14 Sep 2026", "Took 77 d"]); expect(m.steps[3].tip).toEqual(["Started 19 Oct 2026", "No end date yet", "12 d so far"]);
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

describe("Delivery progress: one short line per stage", () => {
  const T2 = Date.UTC(2026, 10, 3);   // 3 Nov 2026
  const at = (f: Record<string, string>, o: Record<string, unknown> = {}, state = "Active") => buildProgress({ settings: settings(o), fields: { "System.WorkItemType": "Epic", "System.State": state, ...f }, today: T2 });
  const shown = (m: ReturnType<typeof at>) => { if (m.kind !== "shown") throw new Error("hidden"); return m; };
  const plan = { "Custom.ES": "2026-08-25", "Custom.Dev": "2026-10-27", "Custom.SIT": "2026-12-02", "Custom.UAT": "2027-01-06", "Custom.UATDone": "2027-02-03" };
  it("running on plan: the duration of the finished stage, the range of the running one, “from …” (planned) for the rest", () => {
    const m = shown(at({ "Custom.DS": "Development", ...plan }));
    expect(m.steps.map(x => x.mark)).toEqual(["done", "cur", "todo", "todo", "todo"]);
    expect(m.steps.map(x => x.line)).toEqual(["63 d", "27 Oct → 2 Dec", "from 2 Dec", "from 6 Jan ’27", "from 3 Feb ’27"]);
    expect(m.steps.map(x => x.planned)).toEqual([false, false, true, true, true]); expect(m.days).toBe(7); expect(m.overdue).toBeUndefined();
    expect(m.steps[1].tip).toEqual(["Started 27 Oct 2026", "Planned end 2 Dec 2026", "7 d so far", "36 d planned"]);
    expect(m.steps[2].tip).toEqual(["Planned start 2 Dec 2026", "Planned end 6 Jan 2027", "35 d planned"]);
    expect(m.steps[0].tip).toEqual(["Started 25 Aug 2026", "Ended 27 Oct 2026", "Took 63 d"]);
  });
  // a stage with its own end date field (Development ends at Custom.DevEnd), so its end is a plan of its own and not the start of the next stage
  const own = (o: Record<string, unknown> = {}) => normProgress({ enabled: true, stages: { source: "field", field: "Custom.DS", stages: evenStages(names), map: Object.fromEntries(names.map(n => [n, n])), dates: { ...dates, stages: { ...dates.stages, Development: { startMode: "field", start: "Custom.Dev", endMode: "field", end: "Custom.DevEnd" } } } }, ...o });
  const ownAt = (f: Record<string, string>) => shown(buildProgress({ settings: own(), fields: { "System.WorkItemType": "Epic", "System.State": "Active", "Custom.DS": "Development", "Custom.ES": "2026-08-25", ...f }, today: T2 }));
  it("past its planned end: red, the days late on the line and in the detail", () => {
    const m = ownAt({ "Custom.Dev": "2026-10-20", "Custom.DevEnd": "2026-11-02" });
    expect(m.steps[1].mark).toBe("late"); expect(m.steps[1].line).toBe("20 Oct → 2 Nov · +1 d"); expect(m.overdue).toBe(1); expect(m.days).toBe(14);
    expect(m.steps[1].tip).toEqual(["Started 20 Oct 2026", "Planned end 2 Nov 2026", "14 d so far", "13 d planned", "overdue 1 d"]);
  });
  it("a planned end that is today is not late", () => { const m = ownAt({ "Custom.Dev": "2026-10-20", "Custom.DevEnd": "2026-11-03" }); expect(m.steps[1].mark).toBe("cur"); expect(m.overdue).toBeUndefined(); });
  it("when the end is the start of the next stage and that day has passed, the dates say the work moved on: rework, as before", () => {
    const m = shown(at({ "Custom.DS": "Development", "Custom.ES": "2026-08-25", "Custom.Dev": "2026-10-20", "Custom.SIT": "2026-11-02" })); expect(m.steps[1].mark).toBe("rework"); expect(m.overdue).toBeUndefined();
  });
  it("no end date: “from …”, “No end date yet” and the days so far", () => {
    const m = shown(at({ "Custom.DS": "UAT", "Custom.ES": "2026-05-01", "Custom.Dev": "2026-06-01", "Custom.SIT": "2026-07-01", "Custom.UAT": "2026-10-19" }));
    expect(m.steps[3].line).toBe("from 19 Oct"); expect(m.steps[3].tip).toEqual(["Started 19 Oct 2026", "No end date yet", "15 d so far"]);
  });
  it("rework: “back here”, the stage that already started is named, and a start that has passed is not a plan", () => {
    const m = shown(at({ "Custom.DS": "Development", "Custom.ES": "2026-08-25", "Custom.Dev": "2026-09-01", "Custom.SIT": "2026-12-02", "Custom.UAT": "2026-10-18" }));
    expect(m.steps[1].mark).toBe("rework"); expect(m.steps[1].line).toBe("back here"); expect(m.steps[1].tip).toEqual(["Back in this stage: UAT already started 18 Oct 2026"]);
    expect(m.steps[3].line).toBe("from 18 Oct"); expect(m.steps[3].planned).toBe(false); expect(m.steps[3].tip[0]).toBe("Started 18 Oct 2026");
  });
  it("a skipped stage says so, and a missing start date is named", () => {
    const m = shown(at({ "Custom.DS": "UAT", "Custom.ES": "2026-05-04", "Custom.Dev": "2026-07-06", "Custom.UAT": "2026-10-12" }));
    expect(m.steps[2].mark).toBe("skip"); expect(m.steps[2].line).toBe("no date");
    const none = shown(at({ "Custom.DS": "SIT", "Custom.ES": "2026-04-06", "Custom.Dev": "2026-06-08" })); expect(none.steps[2].line).toBe("no start date");
  });
  it("delivered: every stage is done and the detail line says when and after how many days", () => {
    const m = shown(at({ "Custom.DS": "Deployment", "Custom.ES": "2026-05-01", "Custom.Dev": "2026-06-01", "Custom.SIT": "2026-07-01", "Custom.UAT": "2026-08-01", "Custom.UATDone": "2026-09-01" }, {}, "Closed"));
    expect(m.steps.every(x => x.mark === "done")).toBe(true); expect(m.steps.slice(0, 4).map(x => x.line)).toEqual(["31 d", "30 d", "31 d", "31 d"]);
    expect(m.summary).toEqual(["Delivered 1 Sep 2026", "123 d from start to delivery"]); expect(m.days).toBeUndefined();
  });
  it("a work item without dates gets no lines and no detail", () => {
    const m = buildProgress({ settings: normProgress({ enabled: true, stages: { source: "field", field: "Custom.DS", stages: evenStages(names), map: Object.fromEntries(names.map(n => [n, n])) } }), fields: { "System.WorkItemType": "Epic", "System.State": "Active", "Custom.DS": "SIT" }, today: T2 }); if (m.kind !== "shown") throw new Error();
    expect(m.steps.every(x => x.line === "" && x.tip.length === 0)).toBe(true);
  });
});
