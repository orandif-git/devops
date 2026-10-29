import { describe, expect, it, vi } from "vitest";
vi.mock("../src/shared/ado", () => ({ dataManager: () => Promise.resolve({}) }));
import { autoChart, looksOrdered, orderedSort } from "../planner/src/core/byField";
import { normalizeSettings } from "../planner/src/core/settings";
import { normalizeExecView } from "../planner/src/data/execViewStore";

describe("By-field chart rules", () => {
  it("Auto: bars up to 12 values, a table above", () => { expect(autoChart(3)).toBe("bars"); expect(autoChart(12)).toBe("bars"); expect(autoChart(13)).toBe("table"); expect(autoChart(44)).toBe("table"); });
  it("recognises ordered fields and sorts them naturally", () => {
    expect(looksOrdered(["P1 Critical", "P3 Medium", "P2 High"])).toBe(true); expect(looksOrdered(["1 - Critical", "2 - High"])).toBe(true); expect(looksOrdered(["High", "Low", "Medium"])).toBe(true);
    expect(looksOrdered(["Retail", "Corporate"])).toBe(false); expect(looksOrdered(["P1"])).toBe(false);
    expect(["P10", "P2", "P1"].sort(orderedSort)).toEqual(["P1", "P2", "P10"]); expect(["Low", "Critical", "High"].sort(orderedSort)).toEqual(["Critical", "High", "Low"]);
  });
  it("keeps only known chart types in the settings and the saved views, and drops Auto", () => {
    expect(normalizeSettings({ executive: { chartTypes: { "Custom.A": "bars", "Custom.B": "auto", "Custom.C": "pie", "Custom.D": "table", "Custom.E": "columns" } } }).executive.chartTypes).toEqual({ "Custom.A": "bars", "Custom.D": "table" });
    expect(normalizeSettings({}).executive.chartTypes).toEqual({});
    expect(normalizeExecView({ chart: { "Custom.A": "table", "Custom.B": "pie", "Custom.C": "nope" } }, "report").chart).toEqual({ "Custom.A": "table" });
  });
});
