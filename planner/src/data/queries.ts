import { restGet } from "../rest";

export interface SavedQuery { id: string; name: string; path: string }
interface QNode { id: string; name: string; path?: string; isFolder?: boolean; children?: QNode[] }

/** The saved queries of the project (shared and own), flattened with their folder path. */
export async function listSavedQueries(project: string): Promise<SavedQuery[]> {
  const r = await restGet<{ value: QNode[] }>("wit/queries", { $depth: 2, $expand: "none" }, project);
  const out: SavedQuery[] = [];
  const walk = (n: QNode, trail: string) => {
    const here = trail ? `${trail} / ${n.name}` : n.name;
    if (n.isFolder) (n.children ?? []).forEach(c => walk(c, here)); else out.push({ id: n.id, name: n.name, path: here });
  };
  (r.value ?? []).forEach(n => walk(n, ""));
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** The work item ids a saved query returns (flat, tree or one-hop queries). */
export async function runSavedQuery(project: string, queryId: string): Promise<number[]> {
  const r = await restGet<{ workItems?: { id: number }[]; workItemRelations?: { target?: { id: number } }[] }>(`wit/wiql/${encodeURIComponent(queryId)}`, {}, project);
  const ids = r.workItems?.length ? r.workItems.map(w => w.id) : (r.workItemRelations ?? []).map(x => x.target?.id).filter((x): x is number => typeof x === "number");
  return Array.from(new Set(ids));
}
