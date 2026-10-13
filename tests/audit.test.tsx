// @vitest-environment jsdom
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";
import { auditCsv, diffSettings, newAuditEntry, olderThan, validReason } from "../src/core/audit";
import { ReasonDialog } from "../src/hub/ReasonDialog";

describe("audit diff", () => {
  it("lists each changed value with its before and after", () => {
    const { changes } = diffSettings({ grids: { A: { title: "Old", columns: [{ id: "a", name: "A" }, { id: "b", name: "B" }] } } }, { grids: { A: { title: "New", columns: [{ id: "a", name: "A2" }, { id: "b", name: "B" }] } } });
    expect(changes).toEqual([
      { path: "grids.A.title", before: "Old", after: "New" },
      { path: "grids.A.columns[a].name", before: "A", after: "A2" },
    ]);
  });
  it("matches array items by id, so an inserted column is one change, not a shift of all", () => {
    const { changes } = diffSettings({ c: [{ id: "a" }, { id: "b" }] }, { c: [{ id: "x" }, { id: "a" }, { id: "b" }] });
    expect(changes.map(c => c.path)).toEqual(["c[x]"]);
    expect(changes[0].before).toBe("(not set)");
  });
  it("lists exactly which dropdown options were added or removed", () => {
    const { changes } = diffSettings({ c: { options: ["Discovery", "Build"] } }, { c: { options: ["Discovery", "Test"] } });
    expect(changes).toEqual([
      { path: "c.options", before: "(not in the list)", after: "added: Test" },
      { path: "c.options", before: "removed: Build", after: "(no longer in the list)" },
    ]);
  });
  it("shows added and removed values, truncates long ones and caps the number kept", () => {
    expect(diffSettings({ a: 1 }, { a: 1, b: "x" }).changes).toEqual([{ path: "b", before: "(not set)", after: "x" }]);
    expect(diffSettings({ t: "x" }, { t: "y".repeat(1000) }).changes[0].after.length).toBeLessThan(310);
    const big = diffSettings({}, Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`k${i}`, i])));
    expect(big.changes.length).toBe(150);
    expect(big.omitted).toBe(250);
  });
  it("builds an entry and exports CSV with formula guard; selects entries older than the retention", () => {
    const e = newAuditEntry({ at: new Date("2024-01-05T10:00:00Z"), userId: "a@x", userName: "A", area: "configuration", reason: " Because it is needed ", comment: "=cmd", before: { a: 1 }, after: { a: 2 } });
    expect(e.reason).toBe("Because it is needed");
    const csv = auditCsv([e], iso => iso.slice(0, 10));
    expect(csv).toContain('"2024-01-05"');
    expect(csv).toContain("\"'=cmd\"");
    expect(olderThan([e], 24, new Date("2026-10-13T00:00:00Z"))).toHaveLength(1);
    expect(olderThan([e], 24, new Date("2025-10-13T00:00:00Z"))).toHaveLength(0);
  });
  it("needs at least 10 characters", () => { expect(validReason("too short")).toBe(false); expect(validReason("   a long enough text ")).toBe(true); });
});

describe("reason dialog", () => {
  it("cannot be confirmed until both fields are filled in", () => {
    const host = document.createElement("div"); document.body.appendChild(host);
    const done = vi.fn(), cancel = vi.fn();
    act(() => { ReactDOM.render(<ReasonDialog title="Why?" onConfirm={done} onCancel={cancel} />, host); });
    const ok = host.querySelector("button.primary") as HTMLButtonElement;
    expect(ok.disabled).toBe(true);
    const [reason, comment] = Array.from(host.querySelectorAll("textarea"));
    const type = (el: HTMLTextAreaElement, v: string) => act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!; set.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    type(reason, "Quarterly change request");
    expect(ok.disabled).toBe(true);
    type(comment, "short");
    expect(ok.disabled).toBe(true);
    type(comment, "Ticket CHG-1234 approved");
    expect(ok.disabled).toBe(false);
    act(() => { ok.click(); });
    expect(done).toHaveBeenCalledWith({ reason: "Quarterly change request", comment: "Ticket CHG-1234 approved" });
  });
});

import { formatValue, staleOutputs } from "../src/core/written";
describe("calculated output fields", () => {
  it("finds the fields that no longer match the calculation", () => {
    expect(staleOutputs({ "A": 160, "B": "Approved", "C": 0 }, { A: "160", B: "Rejected", C: null })).toEqual(["B", "C"]);
    expect(staleOutputs({ A: 10.5 }, { A: 10.5000001 })).toEqual([]);
    expect(staleOutputs({ S: "" }, { S: null })).toEqual([]);
  });
  it("shows dates and yes/no in the read-only control", () => {
    expect(formatValue("2026-10-12T00:00:00Z")).toBe("2026-10-12");
    expect(formatValue(true)).toBe("Yes");
  });
});
