import { describe, expect, it } from "vitest";
import { unrevive } from "../src/shared/unrevive";

describe("unrevive (Dates returned by the extension data service)", () => {
  it("turns Date objects back into ISO text, at any depth, and leaves everything else alone", () => {
    const d = new Date("2026-10-14T09:30:00.000Z");
    const out = unrevive({ id: "a", at: d, entries: [{ at: d, n: 1, ok: true, none: null }], nested: { when: d }, text: "2026-10-14" });
    expect(out).toEqual({ id: "a", at: "2026-10-14T09:30:00.000Z", entries: [{ at: "2026-10-14T09:30:00.000Z", n: 1, ok: true, none: null }], nested: { when: "2026-10-14T09:30:00.000Z" }, text: "2026-10-14" });
    expect(unrevive(5)).toBe(5); expect(unrevive(undefined)).toBeUndefined(); expect(unrevive(new Date("nope"))).toBe("");
  });
  it("makes the audit sort work on entries whose time came back as a Date", () => {
    const entries = unrevive([{ at: new Date("2026-10-01T00:00:00Z") }, { at: new Date("2026-10-02T00:00:00Z") }]) as unknown as { at: string }[];
    expect(entries.sort((a, b) => b.at.localeCompare(a.at)).map(e => e.at)).toEqual(["2026-10-02T00:00:00.000Z", "2026-10-01T00:00:00.000Z"]);
  });
});
