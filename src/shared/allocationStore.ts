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
    // WorkItemErrorPolicy.Omit = 2: missing items come back as null instead of failing the whole request
    const items = await withTimeout(client.getWorkItems(ids.slice(i, i + 200), undefined, ["System.State"], undefined, undefined, 2 as never), "Checking work items");
    for (const w of items ?? []) if (w && String(w.fields?.["System.State"] ?? "") !== "Removed") live.add(w.id);
  }
  return docs.filter(d => live.has(d.workItemId));
}

export const loadLiveAllocations = async (projectId: string) => onlyLiveWorkItems(await listAllocations(projectId));
