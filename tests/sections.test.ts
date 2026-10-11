import { describe, expect, it } from "vitest";
import { issueSection, issueTarget, nextStep } from "../src/hub/sections";
import { emptyConfig } from "../src/core/types";

describe("hub guidance", () => {
  it("assigns validation messages to the part of the grid editor they are about", () => {
    expect(issueSection("Review: approver rule “PMO” has no team or person")).toBe("review");
    expect(issueSection("Schedule: the start column 'x' must be a date column")).toBe("dates");
    expect(issueSection("The source grid 'T' is scheduled by dates, so month columns should use the source")).toBe("dates");
    expect(issueSection("Column 'x': 'period' is not a column of 'T'")).toBe("columns");
    expect(issueSection("Total mapping for 'hours' has no work item field")).toBe("totals");
    expect(issueSection("Child title column 'x' does not exist")).toBe("child");
    expect(issueSection("Data field Custom.X must be a text field")).toBe("storage");
    expect(issueSection("Source grid 'T' does not exist")).toBe("derived");
    expect(issueSection("Some values are not in the column's options")).toBe("columns");
    expect(issueSection("Some values are not in the column's options", "Grid “A” › preset “P”")).toBe("presets");
  });
  it("finds where to fix an issue", () => {
    expect(issueTarget({ level: "warn", where: "Grid “SDLC Timesheet”", message: "Review: x" })).toEqual({ tab: "grids", grid: "SDLC Timesheet", section: "review" });
    expect(issueTarget({ level: "warn", where: "Grid “A” › preset “P”", message: "The preset has no rows" })).toEqual({ tab: "grids", grid: "A", section: "presets" });
    expect(issueTarget({ level: "error", where: "Calculation “C”", message: "x" })).toEqual({ tab: "calcs" });
    expect(issueTarget({ level: "error", where: "Mapping “M”", message: "x" })).toEqual({ tab: "mappings" });
    expect(issueTarget({ level: "error", where: "Types", message: "x" })).toBeUndefined();
  });
  it("suggests one next step", () => {
    const c = emptyConfig();
    expect(nextStep(c, [], false)).toMatchObject({ kind: "start", action: { tab: "grids", create: true } });
    c.grids.G = { columns: [{ id: "a", name: "A", type: "string" }] };
    expect(nextStep(c, [], false)).toMatchObject({ kind: "fix", action: { tab: "grids", grid: "G", section: "storage" } });
    c.grids.G.dataField = "Custom.G";
    expect(nextStep(c, [{ level: "error", where: "Grid “G”", message: "Total mapping for 'a' has no work item field" }], true)).toMatchObject({ kind: "fix", action: { section: "totals" } });
    expect(nextStep(c, [{ level: "warn", where: "Mapping “M”", message: "x" }], true)).toMatchObject({ kind: "review", action: { tab: "mappings" } });
    expect(nextStep(c, [], true).kind).toBe("save");
    expect(nextStep(c, [], false).kind).toBe("done");
  });
});
