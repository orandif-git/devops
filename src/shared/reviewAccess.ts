import * as SDK from "azure-devops-extension-sdk";
import { keyNorm } from "../core/keys";
import { Actor, isGridAdmin, reviewTeamIds } from "../core/review";
import { ReviewConfig } from "../core/types";
import { getTeamMembersCompat, withTimeout } from "./ado";
import { isProjectAdmin } from "./presetAccess";

/**
 * Who is looking at the grid, for approvals: the user's identities, the review teams they belong to (direct members only),
 * whether they are a project administrator (best effort) and whether they are a configured grid administrator.
 */
export async function loadActor(projectId: string, review: ReviewConfig): Promise<Actor> {
  const u = SDK.getUser();
  const keys = [u.name, u.displayName, u.id].map(keyNorm).filter(Boolean);
  const me = String(u.id ?? "").toLowerCase();
  const teamIds: string[] = [];
  for (const id of reviewTeamIds(review)) {
    try {
      const members = await withTimeout(getTeamMembersCompat(projectId, id, 1000), "Loading team members");
      if (members.some(m => m.identity?.id?.toLowerCase() === me)) teamIds.push(id);
    } catch { /* team not readable: not a member */ }
  }
  const project = await isProjectAdmin(projectId);
  return { keys, teamIds, isProjectAdmin: project, isAdmin: project || isGridAdmin(review, { keys, teamIds }) };
}
