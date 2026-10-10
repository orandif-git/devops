// @vitest-environment jsdom
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { describe, expect, it } from "vitest";
import { formatValue, writtenFields } from "../src/core/written";
import { ReadOnlyValue } from "../src/readonly/ReadOnlyValue";
import { ReadOnlyTab } from "../src/hub/ReadOnlyTab";
import { emptyConfig } from "../src/core/types";
import { readFileSync } from "node:fs";

describe("written fields", () => {
  const cfg = () => {
    const c = emptyConfig();
    c.grids.G = { columns: [{ id: "h", name: "H", type: "number" }, { id: "t", name: "T", type: "string" }],
      totals: [{ column: "h", aggregate: "sum", field: "Custom.Total" }, { column: "h", aggregate: "sum", field: "Custom.Cap", where: { column: "t", values: ["Capitalizable"] } }],
      breakdowns: [{ by: "t", column: "h", aggregate: "sum", fields: { Expense: "Custom.Exp", Conditional: "Custom.Cond" } }] };
    c.calculations = [{ id: "1", name: "Pct", enabled: true, workItemTypes: [], formula: "A", resultField: "Custom.Pct", onEmpty: "blank", onDivZero: "blank", mode: "always", inputs: [] }];
    return c;
  };
  it("lists calculation results, grid totals and grouped totals, sorted and de-duplicated", () => {
    expect(writtenFields(cfg()).map(f => f.field)).toEqual(["Custom.Cap", "Custom.Cond", "Custom.Exp", "Custom.Pct", "Custom.Total"]);
    const c = cfg(); c.calculations[0].resultField = "Custom.Total";
    expect(writtenFields(c).find(f => f.field === "Custom.Total")!.by).toHaveLength(2);       // flagged as written twice in the UI
  });
  it("the shipped example lists every mapped output", () => {
    const ex = JSON.parse(readFileSync("examples/sdlc-timesheet.json", "utf8"));
    const fields = writtenFields(ex).map(f => f.field);
    expect(fields).toEqual(expect.arrayContaining(["Custom.CapitalizationPercent", "Custom.PeakDemandTeam", "Custom.TotalPlannedCapacity"]));
  });
  it("formats values without float noise", () => {
    expect(formatValue(0.1 + 0.2)).toBe("0.3"); expect(formatValue("47.060000")).toBe("47.06"); expect(formatValue("Alpha")).toBe("Alpha");
    expect(formatValue(null)).toBe("–"); expect(formatValue("")).toBe("–"); expect(formatValue(undefined)).toBe("–");
  });
  it("read-only value shows the value with a lock and no input", () => {
    const host = document.createElement("div");
    act(() => { ReactDOM.render(<ReadOnlyValue value={50} />, host); });
    expect(host.textContent).toContain("50"); expect(host.querySelector("input")).toBeNull(); expect(host.querySelector(".lock")).not.toBeNull();
  });
  it("hub tab lists the fields and both ways to lock them", () => {
    const host = document.createElement("div");
    act(() => { ReactDOM.render(<ReadOnlyTab config={cfg()} />, host); });
    expect(host.querySelectorAll("tbody tr")).toHaveLength(5);
    expect(host.textContent).toContain("Option A"); expect(host.textContent).toContain("Make read-only");
    const dup = cfg(); dup.calculations[0].resultField = "Custom.Total";
    act(() => { ReactDOM.render(<ReadOnlyTab config={dup} />, host); });
    expect(host.textContent).toContain("written by more than one source");
  });
});
