import { buildTeamBook, TeamBook, teamBookKey, TeamMembers } from "../core/teamBook";
import { getTeamMembersCompat, withTimeout } from "./ado";

interface Team { id: string; name: string }
let cache = new Map<string, { at: number; book: TeamBook }>();

/**
 * Members of the chosen Azure DevOps teams / groups (direct members), as a lookup from person to team names.
 * Uses an explicit older REST version so it also works on Azure DevOps Server. Cached for five minutes.
 */
export async function loadTeamBook(projectId: string, teams: Team[]): Promise<{ key: string; book: TeamBook; failed: string[] }> {
  const key = teamBookKey(teams);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 300000) return { key, book: hit.book, failed: [] };
  const failed: string[] = [];
  const lists: TeamMembers[] = [];
  for (const t of teams) {
    try {
      const members = await withTimeout(getTeamMembersCompat(projectId, t.id, 2000), `Reading the members of ${t.name}`);
      lists.push({ team: t.name, members: members.map(m => (m.identity ? `${m.identity.displayName} <${m.identity.uniqueName}>` : "")).filter(Boolean) });
    } catch { failed.push(t.name); lists.push({ team: t.name, members: [] }); }
  }
  const book = buildTeamBook(lists);
  if (!failed.length) cache.set(key, { at: Date.now(), book });
  return { key, book, failed };
}
export const clearTeamBookCache = () => { cache = new Map(); };
