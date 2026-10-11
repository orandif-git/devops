import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sha256 } from "../src/core/sha256";
import { Actor, withReview } from "../src/core/review";
import { applyDecisions, decideSecure, emptyReviewDoc, gridFields, loadGridRows, parseReviewDoc, rowFingerprint, serializeReviewDoc, staleCount, verifiedState } from "../src/core/reviewDoc";
import { newRow, recomputeAll, serialize, validateConfig } from "../src/core/gridModel";
import { calcRefs, evaluateCalculations } from "../src/core/calc";
import { Calculation, GridConfig, GridRow } from "../src/core/types";

describe("sha256", () => {
  it("matches the standard test vectors and node's implementation", () => {
    expect(sha256("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
    for (const t of ["héllo wörld", "日本語 ✓ 😀", "x".repeat(1000), JSON.stringify({ a: [1, 2, null] })])
      expect(sha256(t)).toBe(createHash("sha256").update(t, "utf8").digest("hex"));
  });
});

const base: GridConfig = { columns: [
  { id: "act", name: "Activity", type: "string" },
  { id: "treat", name: "Treatment", type: "string" },
  { id: "res", name: "Resource", type: "identity" },
  { id: "effort", name: "Effort", type: "number", total: "sum" },
  { id: "double", name: "Double", type: "calculated", formula: "effort * 2" },
] };
const cfg: GridConfig = { ...withReview(base), dataField: "Custom.Rows" };
cfg.review = { ...cfg.review!, secure: { dataField: "Custom.ReviewData" }, approvers: [{ id: "a", name: "PMO", teams: [], people: ["Pat <pat@x.com>"] }] };
const pat: Actor = { keys: ["pat@x.com"], teamIds: [], isProjectAdmin: false, isAdmin: false };
const mk = (o: Record<string, unknown>): GridRow => recomputeAll([{ ...newRow(cfg), ...o }], cfg)[0];

describe("secure approvals: fingerprints and verified status", () => {
  it("the fingerprint covers typed values only (not calculated or review columns)", () => {
    const r = mk({ act: "A", effort: 5 });
    const fp = rowFingerprint(r, cfg);
    expect(rowFingerprint({ ...r, double: 999, reviewstatus: "Approved", reviewedby: "x", reviewreason: "y" }, cfg)).toBe(fp);
    expect(rowFingerprint({ ...r, effort: 6 }, cfg)).not.toBe(fp);
    expect(rowFingerprint({ ...r, act: "B" }, cfg)).not.toBe(fp);
    expect(rowFingerprint({ ...r, _id: "other" }, cfg)).not.toBe(fp);
  });
  it("a forged 'Approved' in the rows field is ignored; a recorded decision counts only while the row is unchanged", () => {
    const row = { ...mk({ act: "A", effort: 5 }), reviewstatus: "Approved", reviewedby: "Mallory" };          // forged copy in the rows
    expect(applyDecisions([row], cfg, emptyReviewDoc())[0].reviewstatus).toBe("Pending review");
    expect(applyDecisions([row], cfg, emptyReviewDoc())[0].reviewedby).toBe("");
    const res = decideSecure([row], new Set([row._id]), "approved", cfg, pat, "Pat", emptyReviewDoc(), new Date("2026-10-12T10:05:00Z"));
    expect(res.changed).toBe(1);
    expect(res.rows[0].reviewstatus).toBe("Approved");
    expect(res.rows[0].reviewedby).toBe("Pat");
    expect(res.rows[0].reviewedat).toBe("2026-10-12 10:05");
    const edited = { ...res.rows[0], effort: 500 };                                // edited from outside after approval
    expect(verifiedState(edited, cfg, res.doc)).toMatchObject({ state: "pending", stale: true });
    expect(applyDecisions([edited], cfg, res.doc)[0].reviewstatus).toBe("Pending review");
    expect(staleCount([edited], cfg, res.doc)).toBe(1);
    expect(staleCount(res.rows, cfg, res.doc)).toBe(0);
  });
  it("only people the rules allow can record a decision; rejected keeps the typed reason; deleted rows are pruned", () => {
    const a = mk({ act: "A" }), b = { ...mk({ act: "B" }), reviewreason: "wrong hours" };
    const stranger: Actor = { keys: ["z@x.com"], teamIds: [], isProjectAdmin: false, isAdmin: false };
    expect(decideSecure([a], new Set([a._id]), "approved", cfg, stranger, "Z", emptyReviewDoc()).changed).toBe(0);
    const first = decideSecure([a, b], new Set([a._id, b._id]), "approved", cfg, pat, "Pat", emptyReviewDoc());
    const rej = decideSecure(first.rows, new Set([b._id]), "rejected", cfg, pat, "Pat", first.doc);
    expect(rej.rows.map(r => r.reviewstatus)).toEqual(["Approved", "Rejected"]);
    expect(rej.doc.decisions[b._id].reason).toBe("wrong hours");
    expect(rej.rows[1].reviewreason).toBe("wrong hours");
    const afterDelete = decideSecure([a], new Set([a._id]), "rejected", cfg, pat, "Pat", rej.doc);
    expect(Object.keys(afterDelete.doc.decisions)).toEqual([a._id]);
  });
  it("the decisions document survives serialization, HTML mangling and garbage", () => {
    const r = mk({ act: "A" });
    const doc = decideSecure([r], new Set([r._id]), "approved", cfg, pat, "Pat <&>", emptyReviewDoc()).doc;
    const text = serializeReviewDoc(doc);
    expect(text).not.toMatch(/[<>&]/);
    expect(parseReviewDoc(text)).toEqual(doc);
    expect(parseReviewDoc(`<div>${text.replace(/"/g, "&quot;")}</div>`)).toEqual(doc);
    expect(parseReviewDoc("not json")).toEqual(emptyReviewDoc());
    expect(parseReviewDoc(null)).toEqual(emptyReviewDoc());
    expect(parseReviewDoc('{"decisions":{"x":{"s":"approved"}}}')).toEqual(emptyReviewDoc());   // no fingerprint: not a decision
  });
});

describe("secure approvals: totals and calculations use verified decisions only", () => {
  const calc: Calculation = {
    id: "c", name: "Approved effort", enabled: true, workItemTypes: [], resultField: "Custom.ApprovedEffort", formula: "Approved", decimals: 2, onEmpty: "zero", onDivZero: "zero", mode: "always",
    inputs: [{ name: "Approved", source: { kind: "grid", grid: "G", column: "effort", aggregate: "sum", where: [{ column: "reviewstatus", values: ["Approved"] }] } }],
  };
  it("reads the decisions field, so a forged status in the rows field adds nothing", () => {
    const real = mk({ act: "A", effort: 10 }), fake = { ...mk({ act: "B", effort: 90 }), reviewstatus: "Approved" };
    const doc = decideSecure([real], new Set([real._id]), "approved", cfg, pat, "Pat", emptyReviewDoc()).doc;
    const fields: Record<string, unknown> = { "Custom.Rows": serialize([{ ...real, reviewstatus: "Approved" }, fake]), "Custom.ReviewData": serializeReviewDoc(doc) };
    expect(gridFields(cfg)).toEqual(["Custom.Rows", "Custom.ReviewData"]);
    expect(calcRefs([calc], { G: cfg }).sort()).toEqual(["Custom.ApprovedEffort", "Custom.ReviewData", "Custom.Rows"]);
    expect(loadGridRows(cfg, f => fields[f]).map(r => r.reviewstatus)).toEqual(["Approved", "Pending review"]);
    expect(evaluateCalculations([calc], "Epic", f => fields[f], { G: cfg }).changes["Custom.ApprovedEffort"]).toBe(10);
    // the approved row is edited from outside: it stops counting
    fields["Custom.Rows"] = serialize([{ ...real, effort: 11, reviewstatus: "Approved" }, fake]);
    expect(evaluateCalculations([calc], "Epic", f => fields[f], { G: cfg }).changes["Custom.ApprovedEffort"]).toBe(0);
    // with no decisions field at all, nothing is approved
    expect(evaluateCalculations([calc], "Epic", f => (f === "Custom.ReviewData" ? undefined : fields[f]), { G: cfg }).changes["Custom.ApprovedEffort"]).toBe(0);
  });
  it("config validation of the approvals field", () => {
    expect(validateConfig(cfg)).toEqual([]);
    expect(validateConfig({ ...cfg, review: { ...cfg.review!, secure: { dataField: "" } } }).join("|")).toMatch(/need an approvals field/);
    expect(validateConfig({ ...cfg, review: { ...cfg.review!, secure: { dataField: "Custom.Rows" } } }).join("|")).toMatch(/different field/);
  });
});
