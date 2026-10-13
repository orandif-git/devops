// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const stores = new Map<string, Map<string, Record<string, unknown>>>();
let etag = 1;
let cutAt = 50;                              // this fake platform keeps only the first 50 characters of an id
const col = (c: string) => { if (!stores.has(c)) stores.set(c, new Map()); return stores.get(c)!; };
const cut = (id: string) => id.slice(0, cutAt);
const fake = {
  async getDocument(c: string, id: string) { const d = col(c).get(cut(id)); if (!d) throw Object.assign(new Error("DocumentDoesNotExist"), { status: 404 }); return JSON.parse(JSON.stringify(d)); },
  async getDocuments(c: string) { return Array.from(col(c).values()).map(d => JSON.parse(JSON.stringify(d))); },
  async setDocument(c: string, doc: Record<string, unknown>) {
    const id = cut(doc.id as string); const cur = col(c).get(id);
    if (cur && doc.__etag !== -1 && doc.__etag !== cur.__etag) throw new Error("1660003 etag mismatch");
    const saved = { ...doc, id, __etag: ++etag }; col(c).set(id, saved); return JSON.parse(JSON.stringify(saved));
  },
  async deleteDocument(c: string, id: string) { if (!col(c).delete(cut(id))) throw Object.assign(new Error("404"), { status: 404 }); },
};
vi.mock("../src/shared/ado", () => ({ dataManager: async () => fake }));
vi.mock("azure-devops-extension-sdk", () => ({ getUser: () => ({ id: "u1", name: "DOM\\aman", displayName: "Aman S" }), getHost: () => ({ name: "h" }), getExtensionContext: () => ({ id: "x", version: "2.2.0" }) }));

import { etagCheck, probeIdLimit, scanLongIds } from "../src/shared/diagnostics";
import { deleteRecord, listRecords, migrateRecordIds, saveRecord } from "../src/shared/capacityStore";
import { listAllocations, migrateAllocationIds, saveAllocation } from "../src/shared/allocationStore";
import { ConfigConflictError, loadConfigDoc, saveConfig } from "../src/shared/configStore";
import { emptyConfig } from "../src/core/types";

beforeEach(() => { stores.clear(); cutAt = 50; });
const rec = (key: string, updatedAt = "2026-01-01T00:00:00Z") => ({ key, name: key, defaultHours: 160, overrides: {}, updatedAt });
const P = "ecab1482-e97e-4217-8db8-8e20e4ad8318";

describe("diagnostics", () => {
  it("measures how long an id can be before the platform mixes documents up, and cleans up", async () => {
    expect((await probeIdLimit()).safeUpTo).toBe(50);
    cutAt = 40; expect((await probeIdLimit()).safeUpTo).toBe(40);
    cutAt = 1000; expect((await probeIdLimit()).safeUpTo).toBe(80);
    expect(Array.from(col("wig-audit").values())).toEqual([]);
  });
  it("tells whether stale saves are refused", async () => {
    expect(await etagCheck()).toBe(true);
    const orig = fake.setDocument; fake.setDocument = async (c: string, d: Record<string, unknown>) => orig(c, { ...d, __etag: -1 });
    expect(await etagCheck()).toBe(false);
    fake.setDocument = orig;
  });
  it("counts stored documents with old long ids", async () => {
    col("wig-capacity").set(cut(`res-${P}-aman-sulthan-gmail-com-abc`), { id: `res-${P}-aman-sulthan-gmail-com-abc`, kind: "resource" });
    col("wig-capacity").set("rg-xxxxxxxxxxxxxx-yyyyyyyyyyyyyy", { id: "rg-xxxxxxxxxxxxxx-yyyyyyyyyyyyyy", kind: "resource" });
    const rows = await scanLongIds(40);
    expect(rows.find(r => r.collection === "wig-capacity")).toMatchObject({ total: 2, long: 1, legacy: 1 });
  });
});

describe("capacity records with short ids", () => {
  it("keeps people apart even when their names start the same, on a platform that cuts ids", async () => {
    await saveRecord(P, rec("ahmed.alsayed@x.com")); await saveRecord(P, rec("ahmed.alhassan@x.com")); await saveRecord(P, rec("ahmed.alnuaimi@x.com"));
    expect((await listRecords(P)).map(r => r.key).sort()).toEqual(["ahmed.alhassan@x.com", "ahmed.alnuaimi@x.com", "ahmed.alsayed@x.com"]);
  });
  it("counts a person stored under an old and a new id once (the new one wins), and removes both", async () => {
    cutAt = 1000;
    col("wig-capacity").set(`res-${P}-ann-x-com-1`, { id: `res-${P}-ann-x-com-1`, kind: "resource", projectId: P, record: rec("ann@x.com", "2026-01-01T00:00:00Z") });
    await saveRecord(P, { ...rec("ann@x.com", "2026-02-01T00:00:00Z"), defaultHours: 100 });
    const list = await listRecords(P);
    expect(list).toHaveLength(1);
    expect(list[0].defaultHours).toBe(100);
    await deleteRecord(P, "ann@x.com");
    expect(await listRecords(P)).toEqual([]);
  });
  it("migrates old ids without overwriting a newer copy", async () => {
    cutAt = 1000;
    col("wig-capacity").set(`res-${P}-a-1`, { id: `res-${P}-a-1`, kind: "resource", projectId: P, record: rec("a@x.com") });
    col("wig-capacity").set(`res-${P}-b-1`, { id: `res-${P}-b-1`, kind: "resource", projectId: P, record: rec("b@x.com", "2026-01-01T00:00:00Z") });
    await saveRecord(P, { ...rec("b@x.com", "2026-03-01T00:00:00Z"), defaultHours: 120 });
    expect(await migrateRecordIds(P)).toBe(2);
    const list = await listRecords(P);
    expect(list.map(r => [r.key, r.defaultHours])).toEqual([["a@x.com", 160], ["b@x.com", 120]]);
    expect(Array.from(col("wig-capacity").keys()).every(k => k.startsWith("rg-"))).toBe(true);
  });
});

describe("allocations with short ids", () => {
  it("never count an Epic twice while old and new copies exist, and migrate", async () => {
    cutAt = 1000;
    col("wig-allocations").set(`alloc-${P}-7`, { id: `alloc-${P}-7`, kind: "alloc", projectId: P, alloc: { workItemId: 7, updatedAt: "2026-01-01T00:00:00Z", entries: { "a|2026-10": 10 } } });
    await saveAllocation(P, { workItemId: 7, updatedAt: "2026-02-01T00:00:00Z", entries: { "a|2026-10": 40 } });
    const list = await listAllocations(P);
    expect(list).toHaveLength(1);
    expect(list[0].entries["a|2026-10"]).toBe(40);
    expect(await migrateAllocationIds(P)).toBe(1);
    expect((await listAllocations(P))[0].entries["a|2026-10"]).toBe(40);
    expect(Array.from(col("wig-allocations").keys())).toHaveLength(1);
  });
});

describe("saving settings with a version check", () => {
  it("refuses a save made from an out-of-date copy, accepts the next one with the new version", async () => {
    cutAt = 1000;
    const first = await loadConfigDoc(P);
    expect(first.etag).toBe(-1);
    const e1 = await saveConfig(P, { ...emptyConfig(), rules: [] }, first.etag);
    const mine = await loadConfigDoc(P);
    await saveConfig(P, emptyConfig(), mine.etag);                     // someone else saves
    await expect(saveConfig(P, emptyConfig(), mine.etag)).rejects.toBeInstanceOf(ConfigConflictError);
    expect(typeof e1).toBe("number");
    const latest = await loadConfigDoc(P);
    await expect(saveConfig(P, emptyConfig(), latest.etag)).resolves.toBeTypeOf("number");
    await expect(saveConfig(P, emptyConfig())).resolves.toBeTypeOf("number");      // without a version: overwrite
  });
});
