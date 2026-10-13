import { describe, expect, it } from "vitest";
import { HARDENING_STEPS, LEVEL_LABEL, SECURITY_ROWS } from "../src/hub/securityInfo";

describe("security information", () => {
  it("states for every feature what it does, what it does not stop and how to harden it", () => {
    expect(SECURITY_ROWS.length).toBeGreaterThanOrEqual(8);
    for (const r of SECURITY_ROWS) { expect(LEVEL_LABEL[r.level]).toBeTruthy(); expect(r.feature.length).toBeGreaterThan(5); for (const t of [r.what, r.bypass, r.harden]) expect(t.length).toBeGreaterThan(10); }
    expect(HARDENING_STEPS.length).toBeGreaterThan(3);
  });
  it("only secure approvals are called enforced by Azure DevOps", () => {
    expect(SECURITY_ROWS.filter(r => r.level === "enforced").map(r => r.feature)).toEqual(["Approvals (secure mode)"]);
  });
});
