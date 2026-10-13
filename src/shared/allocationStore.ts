import { AllocationDoc } from "../core/allocations";
import { dataManager, witClient, withTimeout } from "./ado";
import { shortHash } from "./ids";

const COLLECTION = "wig-allocations";
const is404 = (e: unknown) => (e as { status?: number })?.status === 404 || /not exist|404|DocumentDoesNotExist/i.test(String((e as Error)?.message ?? e));
const docId = (projectId: string, workItemId: number) => `al-${shortHash(projectId)}-${workItemId}`;
const isShortId = (id: string) => id.startsWith("al-");

/** One document per work item, so Epics never overwrite each other's figures. */
export async function listAllocations(projectId: string): Promise<AllocationDoc[]> {
  let docs: { id: string; kind?: string; projectId?: string; alloc?: AllocationDoc }[] = [];
  try { docs = await (await dataManager()).getDocuments(COLLECTION); } catch (e) { if (!is404(e)) throw e; }
  // a work item found under an old (long) and a new id counts once, so its hours are never counted twice: the newest wins
  const byItem = new Map<number, { id: string; alloc: AllocationDoc }>();
  for (const d of docs) {
    if (d.kind !== "alloc" || d.projectId !== projectId || !d.alloc) continue;
    const cur = byItem.get(d.alloc.workItemId);
    if (!cur || (d.alloc.updatedAt ?? "") > (cur.alloc.updatedAt ?? "") || ((d.alloc.updatedAt ?? "") === (cur.alloc.updatedAt ?? "") && isShortId(d.id))) byItem.set(d.alloc.workItemId, { id: d.id, alloc: d.alloc });
  }
  return Array.from(byItem.values()).map(x => x.alloc);
}

export async function saveAllocation(projectId: string, alloc: AllocationDoc): Promise<void> {
  await (await dataManager()).setDocument(COLLECTION, { id: docId(projectId, alloc.workItemId), kind: "alloc", projectId, alloc, __etag: -1 });
}

/** Drop allocations of work items that were deleted or moved to the Removed state, so they stop counting. */
export async function onlyLiveWorkItems(docs: AllocationDoc[]): Promise<AllocationDoc[]> {
  if (!docs.length) return docs;
  const client = await witClient();
  const live = new Set<number>();
  const ids = docs.map(d => d.workItemId);
  for (let i = 0; i < ids.length; i += 200) {
    // POST batch (errorPolicy Omit = 2: missing items are skipped instead of failing the request)
    const items = await client.getWorkItemsBatch({ ids: ids.slice(i, i + 200), fields: ["System.State"], errorPolicy: 2 } as never);
    for (const w of items ?? []) if (w && String(w.fields?.["System.State"] ?? "") !== "Removed") live.add(w.id);
  }
  return docs.filter(d => live.has(d.workItemId));
}

export interface LiveAllocations {
  docs: AllocationDoc[];
  /** false when the "does this Epic still exist?" check could not be completed (deleted Epics may then still be counted) */
  verified: boolean;
}

/**
 * Allocations of all Epics. The existence check is best effort: if Azure DevOps is slow or refuses, the hours are
 * still returned (unfiltered) so the feature never fails because of a clean-up step.
 */
export async function loadLiveAllocations(projectId: string): Promise<LiveAllocations> {
  const docs = await listAllocations(projectId);
  try { return { docs: await withTimeout(onlyLiveWorkItems(docs), "Checking work items", 6000), verified: true }; }
  catch (e) { console.info("[Grid & Rules] could not verify which Epics still exist:", (e as Error).message); return { docs, verified: false }; }
}

/** Move allocations stored under an old, long id to the short id (and drop the old document). Returns how many were moved. */
export async function migrateAllocationIds(projectId: string): Promise<number> {
  const m = await dataManager();
  let moved = 0;
  let docs: { id: string; kind?: string; projectId?: string; alloc?: AllocationDoc }[] = [];
  try { docs = await m.getDocuments(COLLECTION); } catch (e) { if (!is404(e)) throw e; }
  const have = new Map(docs.filter(d => d.kind === "alloc" && d.projectId === projectId && d.alloc && isShortId(d.id)).map(d => [d.alloc!.workItemId, d.alloc!.updatedAt ?? ""]));
  for (const d of docs) {
    if (d.kind !== "alloc" || d.projectId !== projectId || !d.alloc || isShortId(d.id)) continue;
    if (!have.has(d.alloc.workItemId) || have.get(d.alloc.workItemId)! < (d.alloc.updatedAt ?? "")) await m.setDocument(COLLECTION, { id: docId(projectId, d.alloc.workItemId), kind: "alloc", projectId, alloc: d.alloc, __etag: -1 });     // an equal or newer copy under the short id is kept
    try { await m.deleteDocument(COLLECTION, d.id); } catch (e) { if (!is404(e)) throw e; }
    moved++;
  }
  return moved;
}
