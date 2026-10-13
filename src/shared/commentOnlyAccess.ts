import * as SDK from "azure-devops-extension-sdk";
import { isRestrictedUser } from "../core/commentOnly";
import { keyNorm } from "../core/keys";
import { CommentOnlyConfig } from "../core/types";
import { commentOnlyApplies } from "../core/commentOnly";
import { getFormService, getTeamMembersCompat, loadConfig, withTimeout } from "./ado";

/**
 * Is the current user restricted to comments? By name, or by direct membership of a restricted team.
 * If a team cannot be read it counts as "not a member" (the restriction is a form-level guard, not a lock), and the reason is logged.
 */
export async function isCommentOnlyUser(projectId: string, c: CommentOnlyConfig): Promise<boolean> {
  const u = SDK.getUser();
  const keys = [u.name, u.displayName, u.id].map(keyNorm).filter(Boolean);
  const me = String(u.id ?? "").toLowerCase();
  const teamIds: string[] = [];
  for (const t of c.teams) {
    try {
      const members = await withTimeout(getTeamMembersCompat(projectId, t.id, 2000), "Loading team members");
      if (members.some(m => m.identity?.id?.toLowerCase() === me)) teamIds.push(t.id);
    } catch (e) { console.warn(`[Grid & Rules] comment-only: could not read team ${t.name}:`, (e as Error).message); }
  }
  return isRestrictedUser(c, { keys, teamIds });
}

/** For the controls on the form: is the person looking at this work item restricted to comments (so the control should be read-only)? */
export async function commentOnlyHere(projectId: string): Promise<boolean> {
  try {
    const co = (await loadConfig(projectId)).commentOnly;
    if (!co?.enabled) return false;
    const svc = await getFormService();
    if (await svc.isNew()) return false;
    if (!commentOnlyApplies(co, String(await svc.getFieldValue("System.WorkItemType")))) return false;
    return await isCommentOnlyUser(projectId, co);
  } catch { return false; }
}
