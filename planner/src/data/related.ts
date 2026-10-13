import { chunk } from "../core/sync";
import { restGet, restPost } from "../rest";

export interface Related { id: number; title: string; type: string; state: string; relation: "Parent" | "Child" | "Related" | "Other" }

const REL: Record<string, Related["relation"]> = {
  "System.LinkTypes.Hierarchy-Reverse": "Parent", "System.LinkTypes.Hierarchy-Forward": "Child", "System.LinkTypes.Related": "Related",
};

/** Parent, children and related work items of an Epic (read when its dialog opens, not up front). */
export async function loadRelated(id: number): Promise<Related[]> {
  const wi = await restGet<{ relations?: { rel: string; url: string }[] }>(`wit/workitems/${id}`, { $expand: "relations" });
  const links = (wi.relations ?? []).map(r => ({ rel: REL[r.rel] ?? ("Other" as const), id: Number(/\/workItems\/(\d+)$/i.exec(r.url)?.[1]) })).filter(x => Number.isFinite(x.id) && x.rel !== "Other").slice(0, 100);
  if (!links.length) return [];
  const info = new Map<number, { title: string; type: string; state: string }>();
  for (const part of chunk(links.map(l => l.id), 100)) {
    const r = await restPost<{ value: ({ id: number; fields: Record<string, unknown> } | null)[] }>("wit/workitemsbatch", { ids: part, fields: ["System.Title", "System.WorkItemType", "System.State"], errorPolicy: 2 });
    for (const w of r.value ?? []) if (w) info.set(w.id, { title: String(w.fields["System.Title"] ?? ""), type: String(w.fields["System.WorkItemType"] ?? ""), state: String(w.fields["System.State"] ?? "") });
  }
  return links.filter(l => info.has(l.id)).map(l => ({ id: l.id, relation: l.rel, ...info.get(l.id)! }))
    .sort((a, b) => ["Parent", "Child", "Related"].indexOf(a.relation) - ["Parent", "Child", "Related"].indexOf(b.relation) || a.id - b.id);
}
