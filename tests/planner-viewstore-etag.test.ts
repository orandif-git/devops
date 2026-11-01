import { describe, expect, it, vi } from "vitest";
const sets = vi.hoisted(() => [] as { col: string; doc: Record<string, unknown> }[]);
vi.mock("../src/shared/ado", () => ({ dataManager: async () => ({ setDocument: async (col: string, doc: Record<string, unknown>) => { sets.push({ col, doc }); return doc; }, getDocument: async () => { throw Object.assign(new Error("DocumentDoesNotExist"), { status: 404 }); } }), isOnPremises: () => true }));
import { saveViews } from "../planner/src/data/viewStore";
import { saveExecViews } from "../planner/src/data/execViewStore";

describe("saved views are written over the existing document", () => {
  it("send the overwrite marker (-1): Azure DevOps Server refuses a save without it as “the document version does not match”", async () => {
    await saveViews("P", { views: [] }); await saveExecViews("P", { views: [] });
    expect(sets).toHaveLength(2); for (const s of sets) expect(s.doc.__etag).toBe(-1);
  });
});
