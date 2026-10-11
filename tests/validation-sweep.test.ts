import { describe, expect, it } from "vitest";
import { makeCatalog, validateProject } from "../src/hub/validate";
import { capacityAllocation, capacityTemplate, CAPACITY_ROW_COLOR, TEAM_FROM_CAPACITY } from "../src/core/derived";
import { withSchedule } from "../src/core/schedule";
import { withReview } from "../src/core/review";
import { emptyConfig, GridConfig, ProjectConfig } from "../src/core/types";

/** A complete, valid setup of every feature. The live checks must say nothing about it: a warning here is a false alarm. */
const F = (referenceName: string, type = "plainText") => ({ referenceName, name: referenceName.split(".")[1], type, readOnly: false });
const FIELDS = [F("Custom.Rows"), F("Custom.CapRows"), F("Custom.ReviewData"), F("Custom.Total", "double"), F("Custom.Approved", "double"), F("Custom.Pending", "double"), F("Custom.ProjectType", "string")];

function fullConfig(): ProjectConfig {
  let ts: GridConfig = { dataField: "Custom.Rows", columns: [
    { id: "act", name: "Activity", type: "dropdown", options: ["Design", "Build"], required: true },
    { id: "team", name: "Team", type: "dropdown", options: ["IT", "QA"], required: true },
    { id: "contract", name: "Is Contractor", type: "boolean" },
    { id: "treat", name: "Treatment", type: "string", lookup: { column: "act", map: { Design: "Expense", Build: "Capitalizable" } }, overrides: [{ when: "contract", value: "Capitalizable" }] },
  ] };
  ts = withSchedule(ts);
  ts = withReview(ts);
  ts.review = { ...ts.review!, secure: { dataField: "Custom.ReviewData" }, approvers: [{ id: "a", name: "PMO", teams: [{ id: "t", name: "PMO" }], people: [] }], admins: { teams: [], people: ["A <a@x.com>"] }, noSelfApproval: true };
  ts.totals = [
    { column: "effort", aggregate: "sum", field: "Custom.Total" },
    { column: "effort", aggregate: "sum", field: "Custom.Approved", where: { column: "reviewstatus", values: ["Approved"] } },
    { column: "effort", aggregate: "sum", field: "Custom.Pending", where: { column: "reviewstatus", values: ["Pending review"] } },
  ];
  ts.presets = [{ id: "p", name: "Standard", columns: ["act", "team", "effort"], rows: [{ act: "Design", team: "IT", effort: 40 }, { act: "Build", team: "QA", effort: 80 }], when: [{ field: "Custom.ProjectType", values: ["Implementation"] }] }];
  ts.presetSave = { enabled: true, teams: [{ id: "t", name: "PMO" }], admins: true };
  const cap: GridConfig = { dataField: "Custom.CapRows", derived: { source: "TS" }, allocation: capacityAllocation(), rowColorBy: CAPACITY_ROW_COLOR,
    columns: capacityTemplate({ resource: ts.schedule!.resource, period: "_month", hours: "_hours", team: TEAM_FROM_CAPACITY }, { fromRegister: true }) };
  return { ...emptyConfig(), grids: { TS: ts, Cap: cap } };
}

describe("validation sweep: nothing is reported for a complete valid setup", () => {
  it("scheduled timesheet with review, secure approvals, presets and totals + its capacity grid", () => {
    const msgs = validateProject(fullConfig(), makeCatalog(FIELDS, ["Epic"], { Epic: FIELDS })).map(i => `${i.level} ${i.where}: ${i.message}`);
    expect(msgs).toEqual([]);
  });
  it("the same setup is quiet when the process catalog could not be loaded", () => {
    expect(validateProject(fullConfig(), makeCatalog([], [])).map(i => `${i.level} ${i.where}: ${i.message}`)).toEqual([]);
  });
});
