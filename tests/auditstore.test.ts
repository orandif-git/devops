// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, Record<string, unknown>>();
let etag = 1;
const fake = {
  async getDocument(_c: string, id: string) { const d = store.get(id); if (!d) throw Object.assign(new Error("DocumentDoesNotExist"), { status: 404 }); return JSON.parse(JSON.stringify(d)); },
  async getDocuments() { return Array.from(store.values()).map(d => JSON.parse(JSON.stringify(d))); },
  async setDocument(_c: string, doc: Record<string, unknown>) {
    const cur = store.get(doc.id as string);
    if (cur && doc.__etag !== -1 && doc.__etag !== cur.__etag) throw new Error("1660003 etag mismatch");
    const saved = { ...doc, __etag: ++etag }; store.set(doc.id as string, saved); return saved;
  },
  async deleteDocument(_c: string, id: string) { store.delete(id); },
};
vi.mock("../src/shared/ado", () => ({ dataManager: async () => fake }));
vi.mock("azure-devops-extension-sdk", () => ({ getUser: () => ({ id: "u1", name: "DOM\\aman", displayName: "Aman S" }) }));

import { appendAudit, deleteAudit, listAudit } from "../src/shared/auditStore";

beforeEach(() => store.clear());
const add = (n: number) => appendAudit("P", { area: "configuration", reason: "reason " + n, comment: "comment " + n, before: { a: n - 1 }, after: { a: n } });

describe("audit store", () => {
  it("keeps every entry, newest first, with the exact values", async () => {
    await add(1); await add(2); await add(3);
    const list = await listAudit("P");
    expect(list).toHaveLength(3);
    expect(list.map(e => e.reason).sort()).toEqual(["reason 1", "reason 2", "reason 3"]);
    expect(list.find(e => e.reason === "reason 2")!.changes).toEqual([{ path: "a", before: "1", after: "2" }]);
  });
  it("does not lose entries when two people save at the same moment", async () => {
    await Promise.all([add(1), add(2), add(3), add(4)]);
    expect(await listAudit("P")).toHaveLength(4);
  });
  it("still reads entries written one document each by earlier versions, and other projects stay apart", async () => {
    store.set("audit-P-old", { id: "audit-P-old", kind: "entry", projectId: "P", entry: { id: "old", at: "2025-01-01T00:00:00.000Z", userId: "x", userName: "X", area: "configuration", reason: "old reason", comment: "c", changes: [] }, __etag: 1 });
    await add(1);
    await appendAudit("Q", { area: "configuration", reason: "other project", comment: "c", before: {}, after: { z: 1 } });
    const list = await listAudit("P");
    expect(list.map(e => e.reason)).toEqual(["reason 1", "old reason"]);
  });
  it("deletes selected entries from month and old documents", async () => {
    store.set("audit-P-old", { id: "audit-P-old", kind: "entry", projectId: "P", entry: { id: "old", at: "2025-01-01T00:00:00.000Z", userId: "x", userName: "X", area: "configuration", reason: "old", comment: "c", changes: [] }, __etag: 1 });
    const e1 = await add(1); await add(2);
    await deleteAudit("P", ["old", e1.id]);
    expect((await listAudit("P")).map(e => e.reason)).toEqual(["reason 2"]);
  });
});

import { loadRetention, saveRetention } from "../src/shared/auditStore";
describe("retention setting", () => {
  it("is 24 months until changed, and read without asking for a missing document", async () => {
    const asked: string[] = [];
    const orig = fake.getDocument; fake.getDocument = async (c: string, id: string) => { asked.push(id); return orig(c, id); };
    expect(await loadRetention("P")).toBe(24);
    expect(asked).toEqual([]);
    await saveRetention("P", 12);
    expect(await loadRetention("P")).toBe(12);
    fake.getDocument = orig;
  });
});

import { auditStorageCheck } from "../src/shared/auditStore";
describe("storage check", () => {
  it("reports success on a healthy store and leaves nothing behind", async () => {
    const lines = await auditStorageCheck("P");
    expect(lines.every(l => l.startsWith("✔"))).toBe(true);
    expect(lines.join("|")).toMatch(/three separate documents written, 3 found/);
    expect(lines.join("|")).toMatch(/3 entries inside/);
    expect(Array.from(store.keys()).filter(k => k.startsWith("audit-check"))).toEqual([]);
  });
});
