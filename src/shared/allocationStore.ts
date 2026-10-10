import { AllocationDoc } from "../core/allocations";
import { dataManager, witClient, withTimeout } from "./ado";

const COLLECTION = "wig-allocations";
const is404 = (e: unknown) => (e as { status?: number })?.status === 404 || /not exist|404|DocumentDoesNotExist/i.test(String((e as Error)?.message ?? e));
const docId = (projectId: string, workItemId: number) => `alloc-${projectId}-${workItemId}`;

/** One document per work item, so Epics never overwrite each other's figures. */
export async function listAllocations(projectId: string): Promise<AllocationDoc[]> {
  let docs: { kind?: string; projectId?: string; alloc?: AllocationDoc }[] = [];
  try { docs = await (await dataManager()).getDocuments(COLLECTION); } catch (e) { if (!is404(e)) throw e; }
  return docs.filter(d => d.kind === "alloc" && d.projectId === projectId && d.alloc).map(d => d.alloc!);
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
