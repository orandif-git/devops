import { describe, expect, it } from "vitest";
import { formatStamp, isTimeZone } from "../src/core/time";
import { validateConfig } from "../src/core/gridModel";
import { decide, Actor, withReview } from "../src/core/review";
import { decideSecure, emptyReviewDoc } from "../src/core/reviewDoc";
import { newRow } from "../src/core/gridModel";
import { normalizeReview } from "../src/core/normalize";
import { GridConfig } from "../src/core/types";

describe("decision time stamps in a chosen time zone", () => {
  const t = new Date("2026-10-12T14:03:30Z");
  it("formats in the zone with its offset", () => {
    expect(formatStamp(t, "Asia/Qatar")).toBe("2026-10-12 17:03 UTC+03:00");
    expect(formatStamp(t, "UTC")).toBe("2026-10-12 14:03 UTC");
    expect(formatStamp(t)).toBe("2026-10-12 14:03 UTC");
    expect(formatStamp(t, "Asia/Kolkata")).toBe("2026-10-12 19:33 UTC+05:30");
    expect(formatStamp(t, "Not/AZone")).toBe("2026-10-12 14:03 UTC");                 // unknown zone: UTC, never a crash
  });
  it("follows daylight saving and rolls the date over", () => {
    expect(formatStamp(new Date("2026-01-15T12:00:00Z"), "America/New_York")).toBe("2026-01-15 07:00 UTC-05:00");
    expect(formatStamp(new Date("2026-07-15T12:00:00Z"), "America/New_York")).toBe("2026-07-15 08:00 UTC-04:00");
    expect(formatStamp(new Date("2026-10-12T23:30:00Z"), "Asia/Qatar")).toBe("2026-10-13 02:30 UTC+03:00");
    expect(formatStamp(new Date("2026-10-12T00:05:00Z"), "America/Los_Angeles")).toBe("2026-10-11 17:05 UTC-07:00");
  });
  it("is used for both normal and secure decisions, and checked in the settings", () => {
    const base: GridConfig = { columns: [{ id: "a", name: "A", type: "string" }] };
    const cfg: GridConfig = { ...withReview(base), dataField: "Custom.R" };
    cfg.review = { ...cfg.review!, timeZone: "Asia/Qatar", approvers: [{ id: "x", name: "P", teams: [], people: ["P <p@x.com>"] }], secure: undefined };
    const p: Actor = { keys: ["p@x.com"], teamIds: [], isProjectAdmin: false, isAdmin: false };
    const row = newRow(cfg);
    expect(decide([row], new Set([row._id]), "approved", cfg, p, "P", t).rows[0].reviewedat).toBe("2026-10-12 17:03 UTC+03:00");
    const sec: GridConfig = { ...cfg, review: { ...cfg.review!, secure: { dataField: "Custom.D" } } };
    expect(decideSecure([row], new Set([row._id]), "approved", sec, p, "P", emptyReviewDoc(), t).rows[0].reviewedat).toBe("2026-10-12 17:03 UTC+03:00");
    expect(validateConfig({ ...cfg, review: { ...cfg.review!, timeZone: "Mars/Olympus" } }).join("|")).toMatch(/not a known time zone/);
    expect(validateConfig(cfg)).toEqual([]);
    expect(isTimeZone("Asia/Qatar")).toBe(true);
    expect(normalizeReview({ statusColumn: "s", timeZone: "  Asia/Qatar " })!.timeZone).toBe("Asia/Qatar");
  });
});
