// @vitest-environment jsdom
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";

const entries = [
  { id: "2", at: "2026-10-13T14:57:00.000Z", userId: "a@x", userName: "Aman S", area: "configuration", reason: "testing changes", comment: "second", changes: [{ path: "grids.G.columns[c15]", before: "(not set)", after: "{\"id\":\"c15\",\"name\":\"test\",\"type\":\"boolean\"}" }] },
  { id: "1", at: "2026-10-13T14:23:00.000Z", userId: "a@x", userName: "Aman S", area: "configuration", reason: "test for control", comment: "first", changes: [
    { path: "grids.G.columns[p].name", before: "Phase", after: "Stage" }, { path: "grids.G.columns[p].options", before: "(not in the list)", after: "added: Test" } ] },
];
vi.mock("../src/shared/auditStore", () => ({ listAudit: async () => entries, loadRetention: async () => 24, saveRetention: async () => undefined, appendAudit: async () => undefined, deleteAudit: async () => undefined, auditStorageCheck: async () => [] }));
import { AuditTab } from "../src/hub/AuditTab";

describe("audit log table", () => {
  it("shows one row per change with the entry's date, user and reason shared across its rows", async () => {
    const host = document.createElement("div"); document.body.appendChild(host);
    await act(async () => { ReactDOM.render(<AuditTab projectId="P" />, host); });
    await act(async () => { await Promise.resolve(); });
    const rows = Array.from(host.querySelectorAll("table.audit tbody tr"));
    expect(rows).toHaveLength(3);
    const first = rows[0].querySelectorAll("td");
    expect(first[0].getAttribute("rowspan")).toBe("1");
    expect(rows[0].textContent).toContain("Added");
    expect(rows[0].textContent).toContain("test");
    expect(rows[0].textContent).toContain("checkbox");
    expect(rows[1].querySelector("td")!.getAttribute("rowspan")).toBe("2");           // two changes of one save share date, user and reason
    expect(rows[1].textContent).toContain("PhaseStage");
    expect(rows[2].textContent).toContain("Test");
    expect(host.querySelector(".last")!.textContent).toContain("testing changes");
  });
});
