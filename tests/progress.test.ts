import { describe, expect, it } from "vitest";
import { buildProgress, defaultProgress, fmtDay, normProgress, progressFields, ProgressModel, ProgressSettings, stageIcon } from "../src/core/progress";
import { normalizeProject } from "../src/core/normalize";
import { emptyConfig } from "../src/core/types";
import { evenStages } from "../planner/src/core/stages";

const names = ["Development", "SIT", "UAT", "Deployment", "Live"];
const dates = (over: Record<string, unknown> = {}) => ({ enabled: true, fallback: true, consistency: true, track: true, late: true, lateDays: 7, delivered: "", stages: {
  Development: { startMode: "field", start: "S.Dev", endMode: "next" }, SIT: { startMode: "field", start: "S.SIT", endMode: "next" }, UAT: { startMode: "field", start: "S.UAT", endMode: "next" },
  Deployment: { startMode: "field", start: "S.Dep", endMode: "next" }, Live: { startMode: "field", start: "S.Live", endMode: "none" }, ...over } });
const settings = (o: Record<string, unknown> = {}, st: Record<string, unknown> = {}): ProgressSettings => normProgress({ enabled: true, workItemType: "Epic", goLiveField: "Custom.GoLive",
  stages: { source: "field", field: "Custom.DS", stages: evenStages(names), map: Object.fromEntries(names.map(n => [n, n])), dates: dates(), ...st }, ...o });
const T = Date.UTC(2026, 10, 3);   // 3 Nov 2026
const run = (f: Record<string, string>, state = "Active", o: Record<string, unknown> = {}, st: Record<string, unknown> = {}) => buildProgress({ settings: settings(o, st), fields: { "System.WorkItemType": "Epic", "System.State": state, ...f }, today: T });
const shown = (m: ProgressModel) => { if (m.kind !== "shown") throw new Error("hidden"); return m; };
const plan = { "S.Dev": "2026-10-27", "S.SIT": "2026-12-02", "S.UAT": "2027-01-06", "S.Dep": "2027-02-03", "Custom.GoLive": "2027-01-20" };

describe("Delivery Progress settings", () => {
  it("are off by default, the heading is “Delivery Progress”, and a config without them stays unchanged", () => {
    expect(defaultProgress().enabled).toBe(false); expect(defaultProgress().groupLabel).toBe("Delivery Progress"); expect(normalizeProject(emptyConfig()).progress).toBeUndefined();
    expect(normalizeProject({ ...emptyConfig(), progress: { enabled: true } as never }).progress).toMatchObject({ enabled: true, workItemType: "Epic", groupLabel: "Delivery Progress", showTime: true, flags: true, goLiveField: "Microsoft.VSTS.Scheduling.TargetDate" });
  });
  it("clean the values and keep only a complete layout record", () => {
    const p = normProgress({ enabled: "yes", workItemType: " Feature ", groupLabel: "", goLiveField: " Custom.Live ", doneStates: [" Done ", "", "Done", 3], layout: { processId: "p1", groupId: "", processName: "x" } });
    expect(p).toMatchObject({ enabled: false, workItemType: "Feature", groupLabel: "Delivery Progress", goLiveField: "Custom.Live", doneStates: ["Done"] }); expect(p.layout).toBeUndefined();
    expect(normProgress({ goLiveField: "" }).goLiveField).toBe("");   // empty = no finish line
    expect(normProgress({ layout: { processId: "p1", processName: "Agile", groupId: "g1", at: "2026-10-31" } }).layout).toEqual({ processId: "p1", processName: "Agile", groupId: "g1", at: "2026-10-31" });
  });
  it("list the fields the control reads, the go-live field included", () => { expect(progressFields(settings())).toEqual(["System.WorkItemType", "System.State", "Custom.DS", "S.Dev", "S.SIT", "S.UAT", "S.Dep", "S.Live", "Custom.GoLive"]); });
});

describe("Delivery Progress: the stage icon", () => {
  it("follows the name of the stage, and the place in the row when the name says nothing", () => {
    expect(names.map((n, i) => stageIcon(n, i))).toEqual(["code", "puzzle", "clipboard", "cloud", "rocket"]);
    expect(["Design", "Requirements", "Discovery"].map((n, i) => stageIcon(n, i))).toEqual(["design", "design", "design"]);
    expect(["Phase A", "Phase B", "Phase C"].map((n, i) => stageIcon(n, i))).toEqual(["design", "code", "puzzle"]);
  });
});

describe("Delivery Progress: status", () => {
  it("draws nothing when it is off, for another work item type, or without stages", () => {
    expect(run(plan, "Active", { enabled: false }).kind).toBe("hidden"); expect(buildProgress({ settings: settings(), fields: { "System.WorkItemType": "Bug", ...plan }, today: T }).kind).toBe("hidden"); expect(buildProgress({ settings: defaultProgress(), fields: {}, today: T }).kind).toBe("hidden");
  });
  it("green: on plan, with the next stage and the days left", () => {
    const m = shown(run({ "Custom.DS": "Development", ...plan }));
    expect(m.rag).toBe("green"); expect(m.label).toBe("On track"); expect(m.text).toBe("SIT starts in 29 days");
    expect(m.since).toBe("In Development since 27 Oct (7 days)"); expect(m.finish).toBe("Go-live 20 Jan 2027 · 78 days left");
    expect(m.stages.map(x => x.state)).toEqual(["current", "todo", "todo", "todo", "todo"]); expect(m.stages.map(x => x.due)).toEqual([false, false, false, false, false]);
    expect(m.summary).toBe("On track, SIT starts in 29 days. In Development since 27 Oct (7 days). Go-live 20 Jan 2027 · 78 days left");
  });
  it("amber: one stage behind the dates, and the stage that should be current is marked", () => {
    const m = shown(run({ "Custom.DS": "SIT", "S.Dev": "2026-09-01", "S.SIT": "2026-10-03", "S.UAT": "2026-11-03", "S.Dep": "2027-01-10", "Custom.GoLive": "2027-01-20" }));
    expect(m.rag).toBe("amber"); expect(m.label).toBe("Needs attention"); expect(m.text).toBe("one stage behind schedule"); expect(m.stages.findIndex(x => x.due)).toBe(2);
    expect(m.since).toBe("In SIT since 3 Oct (31 days)");
  });
  it("red: two stages or more behind the dates", () => {
    const m = shown(run({ "Custom.DS": "Development", "S.Dev": "2026-10-03", "S.SIT": "2026-10-10", "S.UAT": "2026-10-20", "S.Dep": "2026-11-01", "Custom.GoLive": "2026-12-16" }));
    expect(m.rag).toBe("red"); expect(m.label).toBe("At risk"); expect(m.text).toBe("3 stages behind schedule"); expect(m.stages.findIndex(x => x.due)).toBe(3); expect(m.finish).toBe("Go-live 16 Dec 2026 · 43 days left");
  });
  it("a planned start that is still ahead is a plan, not a stage that has begun", () => { expect(shown(run({ "Custom.DS": "Development", ...plan })).stages.some(x => x.due)).toBe(false); });
  it("red when the go-live has passed and the work is not delivered", () => {
    const m = shown(run({ "Custom.DS": "UAT", "S.Dev": "2026-08-01", "S.SIT": "2026-09-01", "S.UAT": "2026-10-01", "S.Dep": "2026-12-01", "Custom.GoLive": "2026-10-30" }));
    expect(m.rag).toBe("red"); expect(m.text).toBe("go-live was 4 days ago"); expect(m.finish).toBe("Go-live was 30 Oct 2026 · 4 days ago");
  });
  it("a stage past its own planned end: amber, and red from 14 days", () => {
    const own = (end: string) => shown(run({ "Custom.DS": "Development", "S.Dev": "2026-10-01", "S.DevEnd": end, "Custom.GoLive": "2027-03-01" }, "Active", {}, { dates: dates({ Development: { startMode: "field", start: "S.Dev", endMode: "field", end: "S.DevEnd" } }) }));
    expect(own("2026-11-02")).toMatchObject({ rag: "amber", text: "Development is 1 day past its planned end" }); expect(own("2026-11-03").rag).toBe("green"); expect(own("2026-10-20")).toMatchObject({ rag: "red", text: "Development is 14 days past its planned end" });
  });
  it("delivered: every stage done, the days before or after go-live, the delivery date", () => {
    const m = shown(run({ "Custom.DS": "Live", "S.Dev": "2026-08-01", "S.SIT": "2026-09-01", "S.UAT": "2026-10-01", "S.Dep": "2026-10-20", "S.Live": "2026-11-01", "Custom.GoLive": "2026-11-20" }, "Closed"));
    expect(m.rag).toBe("done"); expect(m.label).toBe("Delivered"); expect(m.text).toBe("19 days before go-live"); expect(m.stages.every(x => x.state === "done")).toBe(true); expect(m.pos).toBe(100);
    expect(m.since).toBe("All 5 stages complete"); expect(m.finish).toBe("Delivered 1 Nov 2026");
    expect(shown(run({ "Custom.DS": "Live", "S.Live": "2026-11-01", "Custom.GoLive": "2026-10-25" }, "Closed")).text).toBe("7 days after go-live");
    expect(shown(run({ "Custom.DS": "Live", "S.Live": "2026-11-01", "Custom.GoLive": "2026-11-01" }, "Closed")).text).toBe("on the go-live date");
  });
  it("the unit is always written: one day, many days", () => {
    expect(shown(run({ "Custom.DS": "Development", "S.Dev": "2026-11-02", "S.SIT": "2026-11-04", "Custom.GoLive": "2026-11-04" })).since).toBe("In Development since 2 Nov (1 day)");
    expect(shown(run({ "Custom.DS": "Development", "S.Dev": "2026-11-02", "S.SIT": "2026-11-04", "Custom.GoLive": "2026-11-04" })).text).toBe("SIT starts in 1 day");
  });
  it("without stage dates there is no status to judge, only where the work item is", () => {
    const m = shown(buildProgress({ settings: normProgress({ enabled: true, stages: { source: "field", field: "Custom.DS", stages: evenStages(names), map: Object.fromEntries(names.map(n => [n, n])) } }), fields: { "System.WorkItemType": "Epic", "System.State": "Active", "Custom.DS": "SIT" }, today: T }));
    expect(m.rag).toBe("none"); expect(m.text).toBe("In SIT"); expect(m.since).toBe("In SIT"); expect(m.stages.every(x => !x.due)).toBe(true);
  });
  it("says so when the stage field holds a value that is not a stage, and when it is empty", () => {
    const u = shown(run({ "Custom.DS": "Mystery" })); expect(u.note).toMatch(/Mystery/); expect(u.current).toBe(-1); expect(u.pos).toBe(0); expect(u.rag).toBe("none");
    expect(shown(run({})).note).toBeUndefined();
  });
  it("without a go-live field there is no finish line", () => { const m = shown(run({ "Custom.DS": "Development", ...plan }, "Active", { goLiveField: "" })); expect(m.finish).toBe(""); expect(m.text).toBe("SIT starts in 29 days"); });
});

describe("Delivery Progress: the marker", () => {
  it("sits inside the current stage, by how much of the stage has passed, and never at its edges", () => {
    const at = (devStart: string, sit: string) => shown(run({ "Custom.DS": "Development", "S.Dev": devStart, "S.SIT": sit })).pos;
    expect(at("2026-10-24", "2026-11-13")).toBe(10);   // 10 of 20 days passed: the middle of the first fifth
    expect(at("2026-11-03", "2026-12-03")).toBe(2.4);                          // just started: kept 12 % into its stage
    expect(at("2026-08-01", "2026-11-04")).toBe(17.6);                         // nearly over: kept 88 % into its stage
    expect(shown(run({ "Custom.DS": "UAT", "S.UAT": "2026-10-01", "S.Dep": "2026-12-01" })).pos).toBeGreaterThan(40);
    expect(shown(run({ "Custom.DS": "Live", "S.Live": "2026-10-01" })).pos).toBeGreaterThan(80);   // the last stage, no end: 40 % in
  });
  it("is 100 when delivered and 0 when there is no stage", () => { expect(shown(run({ "Custom.DS": "Live" }, "Done")).pos).toBe(100); expect(shown(run({})).pos).toBe(0); });
});

describe("Delivery Progress: the hover text of a stage", () => {
  it("names the dates in words: started, planned start, planned end, took", () => {
    const m = shown(run({ "Custom.DS": "SIT", "S.Dev": "2026-08-25", "S.SIT": "2026-10-27", "S.UAT": "2026-12-02", "S.Dep": "2027-01-06" }));
    expect(m.stages[0].title).toBe("Development · started 25 Aug 2026 · ended 27 Oct 2026 · took 63 days");
    expect(m.stages[1].title).toBe("SIT · started 27 Oct 2026 · planned end 2 Dec 2026");
    expect(m.stages[2].title).toBe("UAT · planned start 2 Dec 2026 · planned end 6 Jan 2027");
    expect(m.stages[4].title).toBe("Live · no start date");
  });
});

describe("Delivery Progress: warnings", () => {
  it("flag a missing start date and an out of order date, but “behind the dates” is the bar’s job and is not repeated", () => {
    const miss = shown(run({ "Custom.DS": "UAT", "S.Dev": "2026-04-06", "S.UAT": "2026-10-01" })); expect(miss.flags.map(f => f.level)).toContain("w"); expect(miss.flags.some(f => /rework/.test(f.text))).toBe(false);
    const order = shown(run({ "Custom.DS": "UAT", "S.Dev": "2026-08-10", "S.SIT": "2026-07-27", "S.UAT": "2026-10-01" })); expect(order.flags).toEqual([{ level: "r", text: "SIT starts before the stage above it, so no duration is shown." }]);
    expect(shown(run({ "Custom.DS": "UAT", "S.Dev": "2026-08-10", "S.SIT": "2026-07-27", "S.UAT": "2026-10-01" }, "Active", { flags: false })).flags).toEqual([]);
  });
  it("formats a day in UTC", () => { expect(fmtDay(Date.UTC(2026, 8, 14))).toBe("14 Sep 2026"); expect(fmtDay(undefined)).toBe("–"); });
});
