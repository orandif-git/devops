import { restGet } from "../rest";
import { StateGroups } from "../core/timeline";

/** The state groups (Proposed / In Progress / Completed / Removed) of a work item type, read from the process. Empty when they cannot be read. */
export async function loadStateGroups(project: string, workItemType: string): Promise<StateGroups> {
  try {
    const r = await restGet<{ states?: { name?: string; category?: string }[] }>(`wit/workitemtypes/${encodeURIComponent(workItemType)}`, {}, project);
    const out: StateGroups = {};
    for (const s of r.states ?? []) if (s.name && s.category) out[s.name.toLowerCase().trim()] = s.category.toLowerCase().replace(/[\s_-]/g, "");
    return out;
  } catch { return {}; }
}
