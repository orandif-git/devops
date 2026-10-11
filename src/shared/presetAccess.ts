import * as SDK from "azure-devops-extension-sdk";
import { getCompat, getTeamMembersCompat, withTimeout } from "./ado";

/** Security namespace "Project" and its "Edit project-level information" bit: project administrators have it, contributors do not. */
const PROJECT_NAMESPACE = "52d39943-cb85-4d7f-8fa8-c6baac873819";
const EDIT_PROJECT = 2;

/** Best effort: false when it cannot be determined (then only the team rule can grant access). */
export async function isProjectAdmin(projectId: string): Promise<boolean> {
  try {
    const r = await withTimeout(getCompat<{ value?: boolean[] }>(`permissions/${PROJECT_NAMESPACE}/${EDIT_PROJECT}`, { tokens: `$PROJECT:vstfs:///Classification/TeamProject/${projectId}` }), "Checking permissions");
    return r.value?.[0] === true;
  } catch { return false; }
}

export interface PresetSaveRule { enabled: boolean; teams: { id: string; name: string }[]; admins: boolean }

/** May the current user save presets from the work item? Members of the chosen teams, and/or project administrators. */
export async function canSavePresets(projectId: string, rule?: PresetSaveRule): Promise<boolean> {
  if (!rule?.enabled) return false;
  if (rule.admins && await isProjectAdmin(projectId)) return true;
  const me = SDK.getUser().id.toLowerCase();
  for (const t of rule.teams ?? []) {
    try {
      const members = await withTimeout(getTeamMembersCompat(projectId, t.id, 1000), "Loading team members");
      if (members.some(m => m.identity?.id?.toLowerCase() === me)) return true;
    } catch { /* team not readable: not a member */ }
  }
  return false;
}
