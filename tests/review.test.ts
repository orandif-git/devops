import { describe, expect, it } from "vitest";
import { Actor, canDecide, decide, ensureStatus, isGridAdmin, isLocked, resetOnEdit, stateOf, withReview, reviewTeamIds } from "../src/core/review";
import { mappedTotals, newRow, recomputeAll, validateConfig } from "../src/core/gridModel";
import { GridConfig, GridRow } from "../src/core/types";

const base: GridConfig = {
  columns: [
    { id: "act", name: "Activity", type: "dropdown", options: ["Design", "Build"] },
    { id: "treat", name: "Treatment", type: "string" },
    { id: "res", name: "Resource", type: "identity" },
    { id: "effort", name: "Effort", type: "number", total: "sum" },
  ],
};
const cfg: GridConfig = {
  ...withReview(base),
};
cfg.review = {
  ...cfg.review!,
  approvers: [
    { id: "a", name: "Finance", teams: [{ id: "T-FIN", name: "Finance" }], people: [], when: { column: "treat", values: ["Capitalizable"] } },
    { id: "b", name: "PMO", teams: [], people: ["Pat PMO <pat@x.com>"] },
  ],
  admins: { teams: [{ id: "T-ADM", name: "Admins" }], people: ["Gina Grid <gina@x.com>"] },
};
const actor = (o: Partial<Actor> & { keys: string[] }): Actor => ({ teamIds: [], isProjectAdmin: false, isAdmin: false, ...o });
const row = (o: Record<string, unknown>): GridRow => recomputeAll([{ ...newRow(cfg), ...o }], cfg)[0];

describe("review: status, who may decide, lock", () => {
  it("adds the standard review columns and starts rows as pending", () => {
    expect(cfg.columns.map(c => c.id)).toEqual(["act", "treat", "res", "effort", "reviewstatus", "reviewedby", "reviewedat", "reviewreason"]);
    expect(validateConfig(cfg)).toEqual([]);
    const r = row({});
    expect(r.reviewstatus).toBe("Pending review");
    const odd: GridRow = { _id: "x", reviewstatus: "whatever" };
    ensureStatus(odd, cfg.review!);
    expect(odd.reviewstatus).toBe("Pending review");
    expect(stateOf({ _id: "y", reviewstatus: "approved" }, cfg.review!)).toBe("approved");   // case-insensitive
  });
  it("approvers by rule: team for capitalizable rows, named person for the rest, admins for everything", () => {
    const cap = row({ treat: "Capitalizable", res: "Rob <rob@x.com>" });
    const exp = row({ treat: "Expense", res: "Rob <rob@x.com>" });
    const finance = actor({ keys: ["fin@x.com"], teamIds: ["T-FIN"] });
    const pat = actor({ keys: ["pat@x.com"] });
    const admin = actor({ keys: ["gina@x.com"], isAdmin: true });
    const nobody = actor({ keys: ["zed@x.com"] });
    expect(canDecide(cap, cfg, finance).ok).toBe(true);
    expect(canDecide(exp, cfg, finance).ok).toBe(false);          // finance only covers capitalizable rows
    expect(canDecide(exp, cfg, pat).ok).toBe(true);                // PMO rule has no condition... applies to every row
    expect(canDecide(cap, cfg, pat).ok).toBe(true);
    expect(canDecide(cap, cfg, nobody).ok).toBe(false);
    expect(canDecide(cap, cfg, nobody).reason).toMatch(/Finance|PMO/);
    expect(canDecide(exp, cfg, admin).ok).toBe(true);
  });
  it("a row with no matching rule can only be decided by administrators", () => {
    const c2: GridConfig = { ...cfg, review: { ...cfg.review!, approvers: [cfg.review!.approvers[0]] } };
    const exp = { ...newRow(c2), treat: "Expense" };
    expect(canDecide(exp, c2, actor({ keys: ["fin@x.com"], teamIds: ["T-FIN"] })).ok).toBe(false);
    expect(canDecide(exp, c2, actor({ keys: ["a@x.com"], isAdmin: true })).ok).toBe(true);
  });
  it("nobody decides their own row (when switched on), not even an administrator", () => {
    const c2: GridConfig = { ...cfg, review: { ...cfg.review!, noSelfApproval: true } };
    const mine = { ...newRow(c2), res: "Pat PMO <pat@x.com>" };
    expect(canDecide(mine, c2, actor({ keys: ["pat@x.com"] })).ok).toBe(false);
    expect(canDecide(mine, c2, actor({ keys: ["pat@x.com"], isAdmin: true })).reason).toMatch(/own row/);
    expect(canDecide(mine, cfg, actor({ keys: ["pat@x.com"] })).ok).toBe(true);        // switched off
  });
  it("grid administrators: configured people or team members", () => {
    expect(isGridAdmin(cfg.review!, { keys: ["gina@x.com"], teamIds: [] })).toBe(true);
    expect(isGridAdmin(cfg.review!, { keys: ["x@x.com"], teamIds: ["T-ADM"] })).toBe(true);
    expect(isGridAdmin(cfg.review!, { keys: ["x@x.com"], teamIds: ["T-FIN"] })).toBe(false);
    expect(reviewTeamIds(cfg.review!).sort()).toEqual(["T-ADM", "T-FIN"]);
  });
  it("approve / reject: bulk and single, stamps who and when, skips rows the user may not decide, leaves done rows alone", () => {
    const rows = [row({ treat: "Capitalizable" }), row({ treat: "Expense" }), row({ treat: "Capitalizable" })];
    const finance = actor({ keys: ["fin@x.com"], teamIds: ["T-FIN"] });
    const all = new Set(rows.map(r => r._id));
    const now = new Date("2026-10-12T14:03:30Z");
    const res = decide(rows, all, "approved", cfg, finance, "Fin Ance", now);
    expect(res.changed).toBe(2);
    expect(res.skipped).toBe(1);
    expect(res.rows.map(r => r.reviewstatus)).toEqual(["Approved", "Pending review", "Approved"]);
    expect(res.rows[0].reviewedby).toBe("Fin Ance");
    expect(res.rows[0].reviewedat).toBe("2026-10-12 14:03");
    const again = decide(res.rows, all, "approved", cfg, finance, "Fin Ance", now);
    expect(again.changed).toBe(0);                                  // already approved
    const rej = decide(res.rows, new Set([rows[0]._id]), "rejected", cfg, finance, "Fin Ance", now);
    expect(rej.rows[0].reviewstatus).toBe("Rejected");
  });
  it("approved rows are locked for everyone but administrators (configurable)", () => {
    const approved = { ...row({}), reviewstatus: "Approved" };
    expect(isLocked(approved, cfg, actor({ keys: ["a@x.com"] }))).toBe(true);
    expect(isLocked(approved, cfg, actor({ keys: ["a@x.com"], isAdmin: true }))).toBe(false);
    expect(isLocked(row({}), cfg, actor({ keys: ["a@x.com"] }))).toBe(false);                 // pending rows are editable
    expect(isLocked(approved, { ...cfg, review: { ...cfg.review!, lockApproved: false } }, actor({ keys: ["a@x.com"] }))).toBe(false);
  });
  it("editing an approved or rejected row sends it back to pending (not for calculated or review columns); configurable", () => {
    const approved: GridRow = { ...row({ effort: 10 }), reviewstatus: "Approved", reviewedby: "Fin", reviewedat: "2026-10-12 10:00" };
    const edited = resetOnEdit([approved], [{ ...approved, effort: 12 }], cfg)[0];
    expect(edited.reviewstatus).toBe("Pending review");
    expect(edited.reviewedby).toBe("");
    expect(edited.reviewedat).toBe("");
    const comment = resetOnEdit([approved], [{ ...approved, reviewreason: "ok" }], cfg)[0];       // the comment is not an edit
    expect(comment.reviewstatus).toBe("Approved");
    const rejected = { ...approved, reviewstatus: "Rejected" };
    expect(resetOnEdit([rejected], [{ ...rejected, act: "Build" }], cfg)[0].reviewstatus).toBe("Pending review");
    expect(resetOnEdit([approved], [{ ...approved, effort: 12 }], { ...cfg, review: { ...cfg.review!, resetOnEdit: false } })[0].reviewstatus).toBe("Approved");
    const pending = row({ effort: 1 });
    expect(resetOnEdit([pending], [{ ...pending, effort: 2 }], cfg)[0].reviewstatus).toBe("Pending review");
  });
  it("totals by status work with the normal total filter (approved effort to its own field)", () => {
    const c2: GridConfig = { ...cfg, totals: [
      { column: "effort", aggregate: "sum", field: "Custom.ApprovedEffort", where: { column: "reviewstatus", values: ["Approved"] } },
      { column: "effort", aggregate: "sum", field: "Custom.PendingEffort", where: { column: "reviewstatus", values: ["Pending review"] } },
    ] };
    const rows = [{ ...row({ effort: 10 }), reviewstatus: "Approved" }, row({ effort: 5 }), row({ effort: 7 })];
    expect(mappedTotals(rows, c2)).toEqual({ "Custom.ApprovedEffort": 10, "Custom.PendingEffort": 12 });
  });
  it("config validation", () => {
    expect(validateConfig({ ...cfg, review: { ...cfg.review!, statusColumn: "nope" } }).join("|")).toMatch(/status column/);
    expect(validateConfig({ ...cfg, review: { ...cfg.review!, statuses: { pending: "A", approved: "a", rejected: "R" } } }).join("|")).toMatch(/different/);
    expect(validateConfig({ ...cfg, review: { ...cfg.review!, approvers: [{ id: "z", name: "Z", teams: [], people: [], when: { column: "zzz", values: ["x"] } }] } }).join("|")).toMatch(/unknown column/);
  });
});
