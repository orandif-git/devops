import { describe, expect, it } from "vitest";
import { formatDateText, isDateFormat } from "../src/core/dateFormat";
import { validateConfig } from "../src/core/gridModel";

describe("month / date display format", () => {
  it("formats months and dates without changing the stored value", () => {
    expect(formatDateText("2026-10", "MM-YYYY")).toBe("10-2026");
    expect(formatDateText("2026-10-01", "MM-YYYY")).toBe("10-2026");
    expect(formatDateText("2026-10", "MMM-YY")).toMatch(/^Oct.*-26$/);
    expect(formatDateText("2026-10-12", "DD/MM/YYYY")).toBe("12/10/2026");
    expect(formatDateText("2026-10", "YYYY-MM")).toBe("2026-10");
  });
  it("leaves other text alone and cannot show a month as a day", () => {
    expect(formatDateText("ETU", "MM-YYYY")).toBe("ETU");
    expect(formatDateText("", "MM-YYYY")).toBe("");
    expect(formatDateText("2026-10", "DD/MM/YYYY")).toBe("2026-10");
    expect(formatDateText("2026-13", "MM-YYYY")).toBe("2026-13");
    expect(formatDateText("2026-10", undefined)).toBe("2026-10");
  });
  it("validates patterns", () => {
    expect(isDateFormat("MMM-YY")).toBe(true);
    expect(isDateFormat("<b>")).toBe(false);
    expect(isDateFormat("")).toBe(false);
    expect(validateConfig({ columns: [{ id: "p", name: "P", type: "string", displayFormat: "abc" }] }).join("|")).toMatch(/invalid display format/);
  });
});
