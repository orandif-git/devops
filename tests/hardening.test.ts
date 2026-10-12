import { describe, expect, it } from "vitest";
import { evaluate, EvalAbort } from "../src/core/expr";
import { coerce, newRow, parseStored, recomputeAll, serialize, validateConfig } from "../src/core/gridModel";
import { parseCapacityCsv } from "../src/core/capacity";
import { toCsv } from "../src/core/csv";
import { applySchedule, defaultCalendar, registerCalendarBook, scheduleEffort, setCalendarBook } from "../src/core/schedule";
import { Actor, withReview } from "../src/core/review";
import { applyDecisions, decideSecure, emptyReviewDoc, parseReviewDoc, rowFingerprint } from "../src/core/reviewDoc";
import { mergePreset, presetFromRows } from "../src/core/presets";
import { buildOverview } from "../src/core/allocations";
import { GridConfig, GridRow } from "../src/core/types";

describe("formula engine", () => {
  const strict = { strictDiv: true };
  it("IF only fails on the branch that is taken", () => {
    expect(evaluate("IF(0=0, 0, 5/0)", () => 0, strict)).toBe(0);
    expect(evaluate("IF(1=0, 5/0, 7)", () => 0, strict)).toBe(7);
    expect(() => evaluate("IF(1=1, 5/0, 7)", () => 0, strict)).toThrow(/division by zero/);
    const empty = (n: string) => { if (n === "x") throw new EvalAbort("x is empty"); return 3; };
    expect(evaluate("IF(y > 0, y, x)", empty, strict)).toBe(3);                    // x is in the branch not taken
    expect(() => evaluate("IF(y < 0, y, x)", empty, strict)).toThrow(/empty/);
    expect(evaluate("IF(capacity = 0, 0, hours / capacity)", n => (n === "capacity" ? 0 : 5), strict)).toBe(0);
    expect(evaluate('IF(1=1, "yes")', () => 0)).toBe("yes");
  });
  it("a number compares as a number against numeric text; text against text stays text", () => {
    expect(evaluate("a > 5", () => "10")).toBe(true);
    expect(evaluate("a > 5", () => 10)).toBe(true);
    expect(evaluate("a = 10", () => "10")).toBe(true);
    expect(evaluate('a = "007"', () => "7")).toBe(false);
    expect(evaluate("a < b", n => (n === "a" ? "10" : "9"))).toBe(true);           // both text: lexicographic, as before
  });
});

describe("numbers and files", () => {
  it("a decimal comma is read as a decimal, a thousands comma is dropped", () => {
    const col = { id: "n", name: "N", type: "number" as const };
    expect([coerce(col, "7,5"), coerce(col, "7,25"), coerce(col, "1,234"), coerce(col, "1,234.5"), coerce(col, "-3,5")]).toEqual([7.5, 7.25, 1234, 1234.5, -3.5]);
    const res = parseCapacityCsv("Resource,Default hours,2026-03\nA <a@x.com>,\"7,5\",160", []);
    expect(res.records[0].defaultHours).toBe(7.5);
  });
  it("CSV export marks text that looks like a spreadsheet formula; numbers and normal text are untouched", () => {
    expect(toCsv([["=HYPERLINK(\"x\")", "+1", "-1", "@a", "ok", -5, 3]])).toBe("\"'=HYPERLINK(\"\"x\"\")\",'+1,'-1,'@a,ok,-5,3");
  });
});

describe("stored text that looks like a tag bomb", () => {
  const cfg: GridConfig = { columns: [{ id: "a", name: "A", type: "string" }] };
  it("is rejected quickly, and valid or rich-text wrapped JSON still parses", () => {
    const t = Date.now();
    expect(parseStored("<".repeat(300000), cfg)).toEqual([]);
    expect(Date.now() - t).toBeLessThan(1500);
    const text = serialize([{ _id: "r1", a: "x" }]);
    expect(parseStored(text, cfg)).toHaveLength(1);
    expect(parseStored(`<div>${text.replace(/"/g, "&quot;")}</div>`, cfg)).toHaveLength(1);
  });
});

describe("scheduling edge cases", () => {
  const cols = { resource: "res", start: "start", effort: "effort", allocation: "alloc", end: "end" };
  const book = registerCalendarBook([{ key: "a@x.com", name: "A <a@x.com>", defaultHours: null, overrides: {}, leave: [{ start: "2026-11-03", end: "" }] }], defaultCalendar());
  it("a leave entry without an end date is a single day", () => {
    const r = scheduleEffort("2026-11-02", 16, 100, book("A <a@x.com>").days!);
    expect(r.end).toBe("2026-11-04");                                              // 2 Nov, (3 Nov leave), 4 Nov
  });
  it("a long, low-allocation task still fits", () => {
    const r = scheduleEffort("2026-01-30", 2000, 25, book("A <a@x.com>").days!);
    expect(r.error).toBeUndefined();
    expect(Object.values(r.months).reduce((a, b) => a + b, 0)).toBe(2000);
  });
  it("without a calendar, stored results are kept only while the inputs have not changed", () => {
    setCalendarBook(book);
    const row: Record<string, unknown> = { res: "A <a@x.com>", start: "2026-11-02", effort: 40, alloc: 100, end: "" };
    applySchedule(row, cols);
    const calculated = row.end;
    expect(calculated).toBe("2026-11-09");
    setCalendarBook(undefined);
    applySchedule(row, cols);                                                       // nothing changed: results stay
    expect(row.end).toBe(calculated);
    expect(row._months).toBeTruthy();
    row.effort = 400;                                                               // edited while the calendar is not loaded
    applySchedule(row, cols);
    expect(row.end).toBe("");
    expect(row._months).toBeUndefined();
    expect(String(row._schedErr)).toMatch(/calendar is not loaded/);
  });
});

describe("approvals", () => {
  const base: GridConfig = { columns: [{ id: "act", name: "Activity", type: "string" }, { id: "effort", name: "Effort", type: "number" }] };
  const cfg: GridConfig = { ...withReview(base), dataField: "Custom.Rows" };
  cfg.review = { ...cfg.review!, secure: { dataField: "Custom.ReviewData" }, lockApproved: true, approvers: [{ id: "a", name: "PMO", teams: [], people: ["Pat <pat@x.com>"] }] };
  const pat: Actor = { keys: ["pat@x.com"], teamIds: [], isProjectAdmin: false, isAdmin: false };
  const user: Actor = { keys: ["u@x.com"], teamIds: [], isProjectAdmin: false, isAdmin: false };
  const admin: Actor = { keys: ["adm@x.com"], teamIds: [], isProjectAdmin: true, isAdmin: true };
  const mk = (o: Record<string, unknown>): GridRow => recomputeAll([{ ...newRow(cfg), ...o }], cfg)[0];

  it("adding a column or an empty value does not invalidate an approval; changing a value does", () => {
    const r = mk({ act: "A", effort: 5 });
    const doc = decideSecure([r], new Set([r._id]), "approved", cfg, pat, "Pat", emptyReviewDoc()).doc;
    const wider: GridConfig = { ...cfg, columns: [...cfg.columns, { id: "extra", name: "Extra", type: "string" }] };
    expect(applyDecisions([{ ...r, extra: "" }], wider, doc)[0].reviewstatus).toBe("Approved");
    expect(applyDecisions([{ ...r, effort: 6 }], cfg, doc)[0].reviewstatus).toBe("Pending review");
    expect(rowFingerprint({ ...r, effort: 5 }, cfg)).toBe(rowFingerprint(r, cfg));
  });
  it("an approval that went stale is dropped at the next decision, so restoring the old values does not bring it back", () => {
    const a = mk({ act: "A", effort: 5 }), b = mk({ act: "B", effort: 7 });
    const first = decideSecure([a, b], new Set([a._id, b._id]), "approved", cfg, pat, "Pat", emptyReviewDoc());
    const edited = { ...first.rows[0], effort: 6 };                                // a changed after approval
    const second = decideSecure([edited, first.rows[1]], new Set([b._id]), "rejected", cfg, pat, "Pat", first.doc);
    expect(Object.keys(second.doc.decisions)).toEqual([b._id]);                    // a's old approval is gone
    expect(applyDecisions([{ ...edited, effort: 5 }, first.rows[1]], cfg, second.doc)[0].reviewstatus).toBe("Pending review");
  });
  it("Replace all rows with a preset keeps approved rows for everyone but administrators", () => {
    const approved = { ...mk({ act: "Locked", effort: 1 }), reviewstatus: "Approved" };
    const open = mk({ act: "Open", effort: 2 });
    const plain: GridConfig = { ...cfg, review: { ...cfg.review!, secure: undefined } };
    const preset = { id: "p", name: "P", columns: ["act", "effort"], rows: [{ act: "New", effort: 3 }] };
    const asUser = mergePreset([approved, open], preset, plain, "replace", user);
    expect(asUser.rows.map(r => r.act)).toEqual(["Locked", "New"]);
    const asAdmin = mergePreset([approved, open], preset, plain, "replace", admin);
    expect(asAdmin.rows.map(r => r.act)).toEqual(["New"]);
    expect(mergePreset([approved, open], preset, plain, "replace", undefined).rows.map(r => r.act)).toEqual(["Locked", "New"]);   // unknown user: locked
  });
  it("a saved preset survives a removed column", () => {
    const p = presetFromRows([mk({ act: "A", effort: 1 })], cfg, "P", ["act", "gone", "effort"]);
    expect(p.columns).toEqual(["act", "effort"]);
  });
  it("hostile decision ids are ignored, and a review config without statuses is valid", () => {
    const doc = parseReviewDoc('{"decisions":{"__proto__":{"s":"approved","fp":"x"},"ok":{"s":"approved","fp":"y"}}}');
    expect(Object.keys(doc.decisions)).toEqual(["ok"]);
    const noStatuses = { ...cfg, review: { ...cfg.review!, statuses: undefined as never } };
    expect(validateConfig(noStatuses).filter(e => /status names/.test(e))).toEqual([]);
    expect(validateConfig({ ...base, columns: [{ id: "__proto__", name: "x", type: "string" }] }).join("|")).toMatch(/reserved/);
  });
});

describe("overview", () => {
  it("a month with no capacity but hours booked is over capacity", () => {
    const rec = { key: "a@x.com", name: "A <a@x.com>", defaultHours: 160, overrides: { "2026-03": 0 } };
    const reg = { projectDefault: null, resources: { "a@x.com": rec } };
    const rows = buildOverview([rec], reg, [{ workItemId: 1, updatedAt: "", entries: { "a@x.com|2026-03": 40 } }], ["2026-03"]);
    expect(rows[0].cells[0]).toMatchObject({ capacity: 0, allocated: 40, over: true });
  });
});

import { syncDerived, capacityTemplate } from "../src/core/derived";
describe("derived grid and approvals", () => {
  const src: GridConfig = withReview({ columns: [
    { id: "res", name: "Resource", type: "string" }, { id: "period", name: "Period", type: "date" }, { id: "hours", name: "Hours", type: "number" },
  ] });
  const tpl = (rows?: "all" | "notRejected" | "approved"): GridConfig => ({ derived: { source: "T", rows }, columns: [
    { id: "resource", name: "Resource", type: "string", derive: { role: "key", source: "res" } },
    { id: "period", name: "Period", type: "string", derive: { role: "key", source: "period", bucket: "month" } },
    { id: "hours", name: "Hours", type: "number", derive: { role: "agg", source: "hours", aggregate: "sum" } },
  ] });
  const mk = (status: string, hours: number): GridRow => ({ ...recomputeAll([{ ...newRow(src), res: "A <a@x.com>", period: "2026-03-02", hours }], src)[0], reviewstatus: status });
  const rows = [mk("Approved", 10), mk("Pending review", 20), mk("Rejected", 40)];
  it("counts all rows, all but rejected, or approved only", () => {
    expect(syncDerived(rows, tpl(), [], undefined, undefined, src)[0].hours).toBe(70);
    expect(syncDerived(rows, tpl("notRejected"), [], undefined, undefined, src)[0].hours).toBe(30);
    expect(syncDerived(rows, tpl("approved"), [], undefined, undefined, src)[0].hours).toBe(10);
  });
  it("the over-capacity flag also works when no hours are available", () => {
    const cols = capacityTemplate({ resource: "res", period: "period", hours: "hours" }, { fromRegister: true });
    const cfg: GridConfig = { columns: cols, derived: { source: "T" } };
    const reg = { projectDefault: null, resources: { "a@x.com": { key: "a@x.com", name: "A <a@x.com>", defaultHours: 160, overrides: { "2026-03": 0 } } } };
    const plain: GridConfig = { columns: src.columns };
    const out = syncDerived([{ ...newRow(plain), res: "A <a@x.com>", period: "2026-03-02", hours: 40 }], cfg, [], reg, {}, plain);
    expect(out[0].overcapacity).toBe("Yes");
    const ok = syncDerived([{ ...newRow(plain), res: "A <a@x.com>", period: "2026-04-02", hours: 40 }], cfg, [], reg, {}, plain);
    expect(ok[0].overcapacity).toBe("No");
  });
});

import { keyNorm } from "../src/core/keys";
import { nativeCalendarBook } from "../src/core/schedule";
describe("the same person with and without a domain", () => {
  it("DOMAIN\\user and user are one person", () => {
    expect(keyNorm("Tennyson G <CBQNT2000\\utennys>")).toBe("utennys");
    expect(keyNorm("Tennyson G <utennys>")).toBe("utennys");
    expect(keyNorm("utennys")).toBe("utennys");
    expect(keyNorm("CBQNT2000\\UTennys")).toBe("utennys");
    expect(keyNorm("Ann <ann@x.com>")).toBe("ann@x.com");                 // e-mail addresses are kept whole
  });
  it("the calendar finds a person the people picker spells without the domain", () => {
    const team = { teamName: "T", workingDays: [1, 2, 3, 4, 5], iterations: [{ name: "2026", start: "2026-01-01", finish: "2026-12-31", teamDaysOff: [], members: [{ name: "Tennyson G <CBQNT2000\\utennys>", capacityPerDay: 8, daysOff: [] }] }] };
    const book = nativeCalendarBook([team]);
    const r = scheduleEffort("2026-10-07", 50, 100, book("Tennyson G <utennys>").days!);
    expect(r.error).toBeUndefined();
    expect(r.end).toBe("2026-10-15");                                      // 6 full days and 2 h
    expect(book("Someone <other>").error).toMatch(/looked up as “other”/);
  });
});
