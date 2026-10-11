// @vitest-environment jsdom
import * as React from "react";
import * as ReactDOM from "react-dom";
import { act, Simulate } from "react-dom/test-utils";
import { describe, expect, it, vi } from "vitest";
import { Grid } from "../src/grid/Grid";
import { Actor, withReview } from "../src/core/review";
import { newRow, recomputeAll } from "../src/core/gridModel";
import { makeCatalog, validateProject } from "../src/hub/validate";
import { GridConfig, GridRow } from "../src/core/types";

vi.mock("../src/shared/ado", () => ({ listPeople: () => Promise.resolve([]) }));
vi.mock("azure-devops-extension-api/Identities", () => ({ IdentityServiceIds: { IdentityService: "x" } }));
vi.mock("azure-devops-extension-sdk", () => ({ getService: () => Promise.reject(new Error("no host")) }));

const base: GridConfig = { columns: [
  { id: "act", name: "Activity", type: "string" },
  { id: "treat", name: "Treatment", type: "string" },
  { id: "effort", name: "Effort", type: "number" },
] };
const cfg: GridConfig = withReview(base);
cfg.review = { ...cfg.review!, approvers: [{ id: "f", name: "Finance", teams: [{ id: "T", name: "Fin" }], people: [], when: { column: "treat", values: ["Capitalizable"] } }] };

const finance: Actor = { keys: ["fin@x.com"], teamIds: ["T"], isProjectAdmin: false, isAdmin: false };
const admin: Actor = { keys: ["adm@x.com"], teamIds: [], isProjectAdmin: true, isAdmin: true };
const outsider: Actor = { keys: ["zed@x.com"], teamIds: [], isProjectAdmin: false, isAdmin: false };

const mkRow = (o: Record<string, unknown>): GridRow => recomputeAll([{ ...newRow(cfg), ...o }], cfg)[0];

function mount(rows0: GridRow[], actor: Actor | undefined) {
  const host = document.createElement("div"); document.body.appendChild(host);
  let rows = rows0;
  const render = () => ReactDOM.render(<Grid cfg={cfg} rows={rows} readOnly={false} projectId="p" busyChildren={false} status="" review={{ actor, actorName: "Fin Ance" }}
    onChange={r => { rows = r; render(); }} onCreateChild={() => undefined} onCreateAllChildren={() => undefined} onImport={() => undefined} onExport={() => undefined} />, host);
  act(() => { render(); });
  return { host, get rows() { return rows; } };
}
const btn = (host: HTMLElement, text: RegExp) => Array.from(host.querySelectorAll("button")).find(b => text.test(b.textContent ?? "")) as HTMLButtonElement | undefined;

describe("Grid: approve / reject", () => {
  it("an approver sees Approve / Reject only on rows they may decide, and can approve one row", () => {
    const m = mount([mkRow({ treat: "Capitalizable", effort: 5 }), mkRow({ treat: "Expense", effort: 7 })], finance);
    const rowButtons = Array.from(m.host.querySelectorAll("tbody tr")).map(tr => Array.from(tr.querySelectorAll("button")).map(b => b.textContent));
    expect(rowButtons[0]).toContain("Approve");
    expect(rowButtons[1]).not.toContain("Approve");                              // finance does not cover Expense rows
    act(() => { Simulate.click(m.host.querySelector("tbody tr button[title='Approve this row']")!); });
    expect(m.rows[0].reviewstatus).toBe("Approved");
    expect(m.rows[0].reviewedby).toBe("Fin Ance");
    expect(m.host.querySelector("td.tint-green")).toBeTruthy();
  });

  it("bulk Approve all acts on the rows the user may decide and reports the skipped ones", () => {
    const m = mount([mkRow({ treat: "Capitalizable" }), mkRow({ treat: "Capitalizable" }), mkRow({ treat: "Expense" })], finance);
    const b = btn(m.host, /Approve all/)!;
    expect(b.textContent).toContain("(2)");
    act(() => { Simulate.click(b); });
    expect(m.rows.map(r => r.reviewstatus)).toEqual(["Approved", "Approved", "Pending review"]);
    expect(btn(m.host, /Approve all/)!.disabled).toBe(true);                      // nothing left to approve
    const rej = btn(m.host, /Reject all/)!;
    act(() => { Simulate.click(rej); });
    expect(m.rows.map(r => r.reviewstatus)).toEqual(["Rejected", "Rejected", "Pending review"]);
  });

  it("people who may not approve see no approve / reject buttons", () => {
    const m = mount([mkRow({ treat: "Capitalizable" })], outsider);
    expect(btn(m.host, /Approve/)).toBeUndefined();
    expect(btn(m.host, /Reject/)).toBeUndefined();
  });

  it("approved rows are locked for regular users (inputs disabled, no move / duplicate / delete) but not for administrators", () => {
    const approved = { ...mkRow({ treat: "Capitalizable", effort: 5 }), reviewstatus: "Approved" };
    const user = mount([approved], finance);
    expect(Array.from(user.host.querySelectorAll("tbody input, tbody select")).every(i => (i as HTMLInputElement).disabled)).toBe(true);
    expect(user.host.querySelector("button[aria-label='Delete row']")).toBeNull();
    expect(user.host.querySelector("button[aria-label='Duplicate row']")).toBeNull();
    expect(user.host.textContent).toContain("🔒");
    const adm = mount([approved], admin);
    expect(adm.host.querySelector("button[aria-label='Delete row']")).toBeTruthy();
    expect(Array.from(adm.host.querySelectorAll("tbody input[type=number]")).every(i => !(i as HTMLInputElement).disabled)).toBe(true);
  });

  it("until the user is known, approved rows stay locked and nobody sees the buttons", () => {
    const approved = { ...mkRow({ treat: "Capitalizable" }), reviewstatus: "Approved" };
    const m = mount([approved], undefined);
    expect(m.host.querySelector("button[aria-label='Delete row']")).toBeNull();
    expect(btn(m.host, /Approve|Reject/)).toBeUndefined();
  });

  it("editing an approved row (as an administrator) sends it back to pending review; the review comment does not", () => {
    const approved = { ...mkRow({ treat: "Capitalizable", effort: 5 }), reviewstatus: "Approved", reviewedby: "Fin Ance", reviewedat: "2026-10-12 10:00" };
    const m = mount([approved], admin);
    const text = m.host.querySelectorAll("tbody input[type=text]");
    const comment = Array.from(text).find(i => (i as HTMLInputElement).value === "" && !(i as HTMLInputElement).disabled) as HTMLInputElement;   // an editable text cell: the comment column is the last one
    const comments = Array.from(text).filter(i => !(i as HTMLInputElement).disabled);
    act(() => { const c = comments[comments.length - 1] as HTMLInputElement; c.value = "ok"; Simulate.change(c); });
    expect(m.rows[0].reviewreason).toBe("ok");
    expect(m.rows[0].reviewstatus).toBe("Approved");
    const num = m.host.querySelector("tbody input[type=number]") as HTMLInputElement;
    act(() => { num.value = "9"; Simulate.change(num); });
    expect(m.rows[0].reviewstatus).toBe("Pending review");
    expect(m.rows[0].reviewedby).toBe("");
    expect(comment).toBeTruthy();
  });

  it("the review status cell cannot be typed in", () => {
    const m = mount([mkRow({})], admin);
    const header = Array.from(m.host.querySelectorAll("thead th")).findIndex(th => /Review status/.test(th.textContent ?? ""));
    const cell = m.host.querySelectorAll("tbody tr")[0].querySelectorAll("td")[header].querySelector("input") as HTMLInputElement;
    expect(cell.disabled).toBe(true);
  });
});

describe("hub validation of review settings", () => {
  const issues = (g: GridConfig) => validateProject({ version: 1, rules: [], cascades: [], grids: { G: { ...g, dataField: "Custom.G" } }, calculations: [], lookups: {} } as never, makeCatalog([], [])).map(i => `${i.level}:${i.message}`).join("|");
  it("warns when nobody can approve, or a rule is empty", () => {
    expect(issues(withReview(base))).toMatch(/only project administrators can approve/);
    const g = withReview(base); g.review!.approvers = [{ id: "a", name: "Empty", teams: [], people: [] }];
    expect(issues(g)).toMatch(/has no team or person/);
  });
  it("is quiet for a complete setup", () => {
    expect(issues(cfg)).not.toMatch(/Review:/);
  });
});

describe("Grid: secure approvals route decisions through the protected field", () => {
  function mountSecure(rows0: GridRow[], onDecide: NonNullable<NonNullable<Parameters<typeof Grid>[0]["review"]>["onDecide"]>) {
    const host = document.createElement("div"); document.body.appendChild(host);
    const sc: GridConfig = { ...cfg, review: { ...cfg.review!, secure: { dataField: "Custom.ReviewData" } } };
    let rows = rows0;
    const render = () => ReactDOM.render(<Grid cfg={sc} rows={rows} readOnly={false} projectId="p" busyChildren={false} status="" review={{ actor: finance, actorName: "Fin Ance", onDecide }}
      onChange={r => { rows = r; render(); }} onCreateChild={() => undefined} onCreateAllChildren={() => undefined} onImport={() => undefined} onExport={() => undefined} />, host);
    act(() => { render(); });
    return { host, get rows() { return rows; } };
  }
  const flush = () => new Promise(r => setTimeout(r, 0));

  it("Approve calls onDecide (not the local decision) and shows its result; the grid itself does not change status", async () => {
    const calls: [string[], string][] = [];
    const m = mountSecure([mkRow({ treat: "Capitalizable" })], async (ids, to) => { calls.push([ids, to]); return { changed: 1, skipped: 0 }; });
    await act(async () => { Simulate.click(m.host.querySelector("tbody tr button[title='Approve this row']")!); await flush(); });
    expect(calls).toEqual([[[m.rows[0]._id], "approved"]]);
    expect(m.rows[0].reviewstatus).toBe("Pending review");                         // the caller applies the verified decision
    expect(m.host.textContent).toContain("Approved 1 row");
    expect(m.host.textContent).toContain("Save the work item");
  });

  it("shows the error when Azure DevOps refuses the change to the protected field", async () => {
    const m = mountSecure([mkRow({ treat: "Capitalizable" })], async () => ({ changed: 0, skipped: 0, error: "Azure DevOps did not allow changing the approvals field Custom.ReviewData (the field is read-only for you)." }));
    await act(async () => { Simulate.click(m.host.querySelector("tbody tr button[title='Approve this row']")!); await flush(); });
    expect(m.host.textContent).toContain("did not allow changing the approvals field");
  });
});
