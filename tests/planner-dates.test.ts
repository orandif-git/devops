import { describe, expect, it } from "vitest";
import { fmtDate, fmtMonth } from "../planner/src/core/dates";
import { normalizeSettings } from "../planner/src/core/settings";

describe("planner date and month formats", () => {
  it("keeps the standard look until the administrator chooses a format", () => {
    expect(fmtDate(undefined, "2026-10-25")).toBe("2026-10-25"); expect(fmtMonth(undefined, "2026-10")).toBe("2026-10");
    expect(fmtDate({ dateFormat: "" }, "2026-10-25")).toBe("2026-10-25");
  });
  it("shows dates and months in the chosen format, and leaves other text alone", () => {
    expect(fmtDate({ dateFormat: "DD/MM/YYYY" }, "2026-10-05")).toBe("05/10/2026");
    expect(fmtDate({ dateFormat: "D MMM YYYY" }, "2026-10-05")).toMatch(/^5 \w+ 2026$/);
    expect(fmtMonth({ monthFormat: "MM/YYYY" }, "2026-10")).toBe("10/2026");
    expect(fmtMonth({ monthFormat: "MMM-YY" }, "2026-10")).toMatch(/-26$/);
    expect(fmtDate({ dateFormat: "DD/MM/YYYY" }, undefined)).toBe(""); expect(fmtDate({ dateFormat: "DD/MM/YYYY" }, "soon")).toBe("soon");
  });
  it("drops a format that is not a date pattern when settings are read", () => {
    expect(normalizeSettings({ dateFormat: "DD/MM/YYYY", monthFormat: "<script>" })).toMatchObject({ dateFormat: "DD/MM/YYYY", monthFormat: "" });
  });
});
