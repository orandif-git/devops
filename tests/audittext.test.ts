import { describe, expect, it } from "vitest";
import { diffSettings } from "../src/core/audit";
import { describeChange } from "../src/core/auditText";

const say = (before: unknown, after: unknown, area?: "configuration" | "capacity-settings") => diffSettings(before, after).changes.map(c => describeChange(c, area).text);

describe("readable audit text", () => {
  it("says which column was added, in words", () => {
    expect(say({ grids: { "SDLC Timesheet": { columns: [] } } }, { grids: { "SDLC Timesheet": { columns: [{ id: "col15", name: "test", type: "boolean" }] } } }))
      .toEqual(["Added column “test” (checkbox) to Grid “SDLC Timesheet”"]);
    expect(say({ grids: { "SDLC Timesheet": { columns: [{ id: "a", name: "A", type: "string" }] } } }, { grids: { "SDLC Timesheet": { columns: [{ id: "a", name: "A", type: "string" }, { id: "col15", name: "test", type: "boolean" }] } } }))
      .toEqual(["Added column “test” (checkbox) to Grid “SDLC Timesheet”"]);
  });
  it("says what changed in a value and in a dropdown list", () => {
    const before = { grids: { G: { columns: [{ id: "phase", name: "Phase", type: "dropdown", options: ["Discovery", "Build"], required: false }] } } };
    const after = { grids: { G: { columns: [{ id: "phase", name: "Stage", type: "dropdown", options: ["Discovery", "Test"], required: true }] } } };
    expect(say(before, after)).toEqual([
      "Grid “G” › Column “phase” › name: changed from “Phase” to “Stage”",
      "Grid “G” › Column “phase” › dropdown values: added “Test”",
      "Grid “G” › Column “phase” › dropdown values: removed “Build”",
      "Grid “G” › Column “phase” › required: changed from No to Yes",
    ]);
  });
  it("describes the comment-only control and mappings", () => {
    const t = say({}, { commentOnly: { enabled: true, workItemTypes: ["Epic"], teams: [{ id: "1", name: "NFR" }], people: [], allowedFields: ["System.History"] } });
    expect(t[0]).toBe("Controls › Comment-only access: set to enabled: Yes; work item types: “Epic”; teams: “NFR”; people: none; fields that stay editable: “System.History”");
    expect(say({ lookups: { T: { map: { Expense: "A" } } } }, { lookups: { T: { map: { Expense: "B" } } } })).toEqual(["Mapping “T” › mapping › Expense: changed from “A” to “B”"]);
  });
  it("describes removals and capacity settings", () => {
    expect(say({ rules: [{ id: "r1", name: "Need hours", enabled: true }] }, { rules: [] })).toEqual(["Removed rule “Need hours”"]);
    expect(say({ source: "register", defaultHours: 160 }, { source: "teams", defaultHours: 160 }, "capacity-settings")).toEqual(["Capacity settings › source: changed from “register” to “teams”"]);
  });
});
