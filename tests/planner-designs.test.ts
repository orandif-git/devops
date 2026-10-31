import { describe, expect, it } from "vitest";
import { normDesigns, normalizeSettings } from "../planner/src/core/settings";

describe("dashboard designs in the settings", () => {
  it("are Classic only unless set otherwise, so existing setups do not change", () => {
    expect(normalizeSettings({}).executive.designs).toEqual({ classic: true, modern: false, default: "classic" });
    expect(normalizeSettings({ executive: { enabled: true } }).executive.designs).toEqual({ classic: true, modern: false, default: "classic" });
  });
  it("keep at least one design on and a default that is on", () => {
    expect(normDesigns({ classic: false, modern: false })).toEqual({ classic: true, modern: false, default: "classic" });
    expect(normDesigns({ classic: true, modern: true, default: "modern" })).toEqual({ classic: true, modern: true, default: "modern" });
    expect(normDesigns({ classic: true, modern: true })).toEqual({ classic: true, modern: true, default: "classic" });
    expect(normDesigns({ classic: false, modern: true, default: "classic" })).toEqual({ classic: false, modern: true, default: "modern" });
    expect(normDesigns({ classic: true, modern: false, default: "modern" })).toEqual({ classic: true, modern: false, default: "classic" });
    expect(normDesigns({ classic: "yes", modern: "no", default: 7 })).toEqual({ classic: true, modern: false, default: "classic" });
  });
});
