import { chunk } from "../core/sync";
import { ColumnGuess, detectColumns } from "../core/detect";
import { restPost } from "../rest";

export interface GridSample { epicId: number; title: string; rows: number; scheduled: number; columns: ColumnGuess[]; looked: number }

/**
 * Find an Epic that has rows in the given field and describe its columns. Looks at the Epics changed most recently (up to `limit`)
 * and takes the one with the most rows, which tells the most about the grid.
 */
export async function sampleGrid(project: string, type: string, field: string, limit = 200): Promise<GridSample | undefined> {
  const q = await restPost<{ workItems?: { id: number }[] }>("wit/wiql", { query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.WorkItemType] = '${type.replace(/'/g, "''")}' ORDER BY [System.ChangedDate] DESC` }, { project, query: { $top: limit } });
  const ids = (q.workItems ?? []).map(w => w.id).slice(0, limit);
  let best: GridSample | undefined;
  for (const part of chunk(ids, 200)) {
    const r = await restPost<{ value: ({ id: number; fields: Record<string, unknown> } | null)[] }>("wit/workitemsbatch", { ids: part, fields: ["System.Title", field], errorPolicy: 2 });
    for (const w of r.value ?? []) {
      const text = w && typeof w.fields[field] === "string" ? (w.fields[field] as string) : "";
      if (!w || !text.trim()) continue;
      const d = detectColumns(text);
      if ("error" in d || !d.rows) continue;
      if (!best || d.rows > best.rows) best = { epicId: w.id, title: String(w.fields["System.Title"] ?? ""), rows: d.rows, scheduled: d.scheduled, columns: d.columns, looked: ids.length };
    }
  }
  return best;
}
