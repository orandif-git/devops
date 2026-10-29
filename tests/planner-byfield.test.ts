import { describe, expect, it, vi } from "vitest";
vi.mock("../src/shared/ado", () => ({ dataManager: () => Promise.resolve({}) }));
import { autoChart, looksOrdered, orderedSort } from "../planner/src/core/byField";
import { normalizeSettings } from "../planner/src/core/settings";
import { normalizeExecView } from "../planner/src/data/execViewStore";

describe("By-field chart rules", () => {
  it("Auto: columns for few values or an ordered field, bars up to 12, a table above", () => {
    expect(autoChart(3, false)).toBe("columns"); expect(autoChart(6, false)).toBe("columns"); expect(autoChart(7, false)).toBe("bars"); expect(autoChart(12, false)).toBe("bars");
    expect(autoChart(13, false)).toBe("table"); expect(autoChart(44, false)).toBe("table"); expect(autoChart(20, true)).toBe("columns");
  });
  it("recognises ordered fields and sorts them naturally", () => {
    expect(looksOrdered(["P1 Critical", "P3 Medium", "P2 High"])).toBe(true); expect(looksOrdered(["1 - Critical", "2 - High"])).toBe(true); expect(looksOrdered(["High", "Low", "Medium"])).toBe(true);
    expect(looksOrdered(["Retail", "Corporate"])).toBe(false); expect(looksOrdered(["P1"])).toBe(false);
    expect(["P10", "P2", "P1"].sort(orderedSort)).toEqual(["P1", "P2", "P10"]); expect(["Low", "Critical", "High"].sort(orderedSort)).toEqual(["Critical", "High", "Low"]);
  });
  it("keeps only known chart types in the settings and the saved views, and drops Auto", () => {
    expect(normalizeSettings({ executive: { chartTypes: { "Custom.A": "pie", "Custom.B": "auto", "Custom.C": "radar", "Custom.D": "table" } } }).executive.chartTypes).toEqual({ "Custom.A": "pie", "Custom.D": "table" });
    expect(normalizeSettings({}).executive.chartTypes).toEqual({});
    expect(normalizeExecView({ chart: { "Custom.A": "pie", "Custom.B": "nope" } }, "report").chart).toEqual({ "Custom.A": "pie" });
  });
});
