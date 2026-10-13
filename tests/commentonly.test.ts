import { describe, expect, it } from "vitest";
import { commentOnlyApplies, fieldsToRevert, isRestrictedUser, normalizeCommentOnly } from "../src/core/commentOnly";
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
    expect(p.commentOnly).toMatchObject({ enabled: true, teams: [], people: [], allowedFields: ["System.History"] });
    const issues = validateProject(p, makeCatalog([], [], {}));
    expect(issues.some(i => i.where === "Comment-only access" && i.level === "error")).toBe(true);
  });
});
