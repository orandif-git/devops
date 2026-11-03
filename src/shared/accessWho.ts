import * as SDK from "azure-devops-extension-sdk";
import { accessTeamIds, AccessConfig, AccessWho, isAccessAdmin } from "../core/access";
import { keyNorm } from "../core/keys";
import { getTeamMembersCompat, withTimeout } from "./ado";
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
