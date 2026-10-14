import { describe, expect, it } from "vitest";
import { commentOnlyApplies, fieldsToRevert, isRestrictedUser, normalizeCommentOnly, normalizeRule, readControls, revertsForRules, ruleBlocks } from "../src/core/commentOnly";
import { normalizeProject } from "../src/core/normalize";
import { emptyConfig } from "../src/core/types";
import { makeCatalog, validateProject } from "../src/hub/validate";

const cfg = normalizeCommentOnly({ enabled: true, teams: [{ id: "t1", name: "NFR" }], people: ["Laith I <CBQNT2000\\uiskan>"], workItemTypes: ["Epic"] })!;

describe("comment-only guard", () => {
  it("applies to the chosen types and needs someone to restrict", () => {
    expect(commentOnlyApplies(cfg, "Epic")).toBe(true);
    expect(commentOnlyApplies(cfg, "Bug")).toBe(false);
    expect(commentOnlyApplies({ ...cfg, workItemTypes: [] }, "Bug")).toBe(true);
    expect(commentOnlyApplies({ ...cfg, teams: [], people: [] }, "Epic")).toBe(false);
    expect(commentOnlyApplies({ ...cfg, enabled: false }, "Epic")).toBe(false);
    expect(commentOnlyApplies(undefined, "Epic")).toBe(false);
  });
  it("restricts by person (with or without domain) or by team", () => {
    expect(isRestrictedUser(cfg, { keys: ["uiskan"], teamIds: [] })).toBe(true);
    expect(isRestrictedUser(cfg, { keys: ["other"], teamIds: ["t1"] })).toBe(true);
    expect(isRestrictedUser(cfg, { keys: ["other"], teamIds: ["t2"] })).toBe(false);
  });
  it("undoes changes to other fields, keeps the discussion and ignores system noise", () => {
    const snap = { "System.Title": "Old", "Custom.Hours": 10, "System.History": "", "System.Rev": 3, "System.State": "Active" };
    const back = fieldsToRevert({ "System.Title": "New", "Custom.Hours": "10", "System.History": "hello", "System.Rev": 4, "System.State": "Closed", "Unknown.Field": 1 }, snap, []);
    expect(back).toEqual([{ field: "System.Title", value: "Old" }, { field: "System.State", value: "Active" }]);
    expect(fieldsToRevert({ "System.State": "Closed" }, snap, ["System.State"])).toEqual([]);
  });
  it("is normalized and checked", () => {
    const p = normalizeProject({ ...emptyConfig(), commentOnly: { enabled: true } as never });
    expect(p.commentOnly).toBeUndefined();                                       // converted into a rule
    expect(p.controls).toMatchObject([{ name: "Comment-only access", enabled: true, mode: "comments", teams: [], people: [], fields: ["System.History"] }]);
    const issues = validateProject(p, makeCatalog([], [], {}));
    expect(issues.some(i => i.where === "Controls › Comment-only access" && i.level === "error")).toBe(true);
  });
});

describe("several control rules", () => {
  const g2 = normalizeRule({ id: "g2", name: "Group 2", enabled: true, mode: "lock", teams: [{ id: "t2", name: "G2" }], fields: ["Custom.Budget", "Custom.Owner"], workItemTypes: ["Epic"] })!;
  const g3 = normalizeRule({ id: "g3", name: "Group 3", enabled: true, mode: "lock", people: ["X <x>"], fields: ["Custom.A", "Custom.B", "Custom.C"] })!;
  const g1 = normalizeRule({ id: "g1", name: "Group 1", enabled: true, mode: "comments", teams: [{ id: "t1", name: "G1" }] })!;
  const snap = { "Custom.Budget": 10, "Custom.Owner": "Ann", "Custom.A": 1, "System.Title": "T", "System.History": "" };

  it("normalizes a list, converts the older single setting, and defaults by mode", () => {
    expect(readControls({ controls: [{ name: "  ", mode: "lock", fields: ["Custom.A", " Custom.A "] }] })).toMatchObject([{ id: "rule-1", name: "Rule 1", mode: "lock", fields: ["Custom.A"], enabled: false }]);
    expect(readControls({ commentOnly: { enabled: true, teams: [], people: ["a"], workItemTypes: [], allowedFields: ["System.State"] } })).toMatchObject([{ mode: "comments", fields: ["System.State"], people: ["a"] }]);
    expect(readControls({})).toBeUndefined();
    expect(normalizeRule({ mode: "comments" })!.fields).toEqual(["System.History"]);
    expect(normalizeRule({ mode: "lock" })!.fields).toEqual([]);
  });
  it("a locking rule undoes only the listed fields (case-insensitive) and leaves everything else editable", () => {
    expect(ruleBlocks(g2, "custom.budget")).toBe(true);
    expect(ruleBlocks(g2, "System.Title")).toBe(false);
    const back = revertsForRules({ "Custom.Budget": 99, "Custom.Owner": "Ann", "System.Title": "New", "Custom.A": 5 }, snap, [g2]);
    expect(back).toEqual([{ field: "Custom.Budget", value: 10, message: expect.stringContaining("cannot change") }]);
  });
  it("a comments-only rule undoes everything except the allowed fields and the discussion", () => {
    expect(ruleBlocks(g1, "System.History")).toBe(false);
    expect(revertsForRules({ "System.Title": "New", "System.History": "hi" }, snap, [g1]).map(b => b.field)).toEqual(["System.Title"]);
  });
  it("the stricter result wins when a person is in several groups, and each rule's own message is used", () => {
    const withMsg = { ...g2, message: "Budget is locked." };
    const back = revertsForRules({ "Custom.Budget": 99, "Custom.A": 7, "System.Title": "New" }, snap, [withMsg, g3]);
    expect(back.map(b => [b.field, b.message])).toEqual([["Custom.Budget", "Budget is locked."], ["Custom.A", expect.stringContaining("cannot change")]]);
    expect(revertsForRules({ "System.Title": "New", "Custom.A": 7 }, snap, [g3, g1]).map(b => b.field)).toEqual(["System.Title", "Custom.A"]);
  });
  it("never undoes fields the extension writes itself, system noise or fields not in the snapshot", () => {
    expect(revertsForRules({ "Custom.Budget": 99, "System.Rev": 9, "Unknown.X": 1 }, snap, [g2], new Set(["custom.budget"]))).toEqual([]);
  });
  it("applies by work item type and needs someone to restrict", () => {
    expect(commentOnlyApplies(g2, "Epic")).toBe(true);
    expect(commentOnlyApplies(g2, "Bug")).toBe(false);
    expect(commentOnlyApplies(g3, "Bug")).toBe(true);
    expect(commentOnlyApplies({ ...g3, people: [] }, "Bug")).toBe(false);
  });
  it("validation: lock rules need fields and someone, duplicate names and written fields are flagged", () => {
    const cfg = { ...emptyConfig(), controls: [{ ...g2, fields: [] }, { ...g3, name: "Group 3" }, { ...g3, id: "dup", name: "Group 3" }] };
    const issues = validateProject(cfg, makeCatalog([], [], {}));
    expect(issues.some(i => i.where.includes("Group 2") && /at least one field/.test(i.message))).toBe(true);
    expect(issues.some(i => i.where.includes("Group 3") && /same name/.test(i.message))).toBe(true);
  });
});
