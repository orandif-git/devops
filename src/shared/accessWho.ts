import * as SDK from "azure-devops-extension-sdk";
import { accessTeamIds, AccessConfig, AccessWho, isAccessAdmin } from "../core/access";
import { keyNorm } from "../core/keys";
import { getTeamMembersCompat, withTimeout } from "./ado";
import { loadSettings } from "./capacityStore";
import { isProjectAdmin } from "./presetAccess";

/** The user looking at the grid, as far as it is known at once (their sign-in name, display name and id). Whether they are an administrator is added by `loadAccessAdmin`. */
export function currentWho(): AccessWho {
  const u = SDK.getUser();
  return { keys: [u.name, u.displayName, u.id].map(keyNorm).filter(Boolean), key: u.name || u.id, name: u.displayName };
}

/** Is the user a project administrator or one of the administrators named in the Rows & access settings (people, or members of a listed team)? Best effort: a team that cannot be read counts as "not a member". */
export async function loadAccessAdmin(projectId: string, a: AccessConfig | undefined, who: AccessWho): Promise<boolean> {
  const me = String(SDK.getUser().id ?? "").toLowerCase(), teamIds: string[] = [];
  for (const id of accessTeamIds(a)) {
    try { const members = await withTimeout(getTeamMembersCompat(projectId, id, 1000), "Loading team members"); if (members.some(m => m.identity?.id?.toLowerCase() === me)) teamIds.push(id); }
    catch { /* team not readable: not a member */ }
  }
  return (await isProjectAdmin(projectId)) || isAccessAdmin(a, { keys: who.keys, teamIds });
}

/** The people who share a capacity team (the Azure DevOps teams chosen in Capacity) with the user: their names, normalised. Best effort: a team that cannot be read adds nobody. */
export async function loadTeammates(projectId: string, who: AccessWho): Promise<string[]> {
  const teams = (await loadSettings(projectId)).capacityTeams, me = String(SDK.getUser().id ?? "").toLowerCase(), mates = new Set<string>();
  for (const t of teams) {
    try {
      const members = await withTimeout(getTeamMembersCompat(projectId, t.id, 1000), "Loading team members");
      const keysOf = (m: (typeof members)[number]) => [m.identity?.uniqueName, m.identity?.displayName, m.identity?.id].map(x => keyNorm(String(x ?? ""))).filter(Boolean);
      if (!members.some(m => m.identity?.id?.toLowerCase() === me || keysOf(m).some(k => who.keys.includes(k)))) continue;
      members.forEach(m => keysOf(m).forEach(k => mates.add(k)));
    } catch { /* team not readable: nobody is added */ }
  }
  return Array.from(mates);
}
