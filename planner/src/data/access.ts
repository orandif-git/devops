import * as SDK from "azure-devops-extension-sdk";
import { projectAdminStatus } from "../../../src/shared/presetAccess";
import { getTeamMembersCompat, withTimeout } from "../../../src/shared/ado";
import { TeamRef } from "../core/types";

export interface Access {
  /** project administrator: yes / no / unknown (the permission check itself failed) */
  admin: "yes" | "no" | "unknown";
  /** may open the planner pages: everyone when no Access teams are chosen; otherwise administrators and members of those teams */
  mayOpen: boolean;
}

/**
 * Who gets in. Pure: `isMember` answers for one team. When the administrator check could not run (`unknown`) nobody is locked out,
 * because a real administrator must always be able to reach the settings.
 */
export async function evaluateAccess(accessTeams: TeamRef[], admin: Access["admin"], isMember: (teamId: string) => Promise<boolean>): Promise<Access> {
  if (!accessTeams.length || admin !== "no") return { admin, mayOpen: true };
  for (const t of accessTeams) if (await isMember(t.id)) return { admin, mayOpen: true };
  return { admin, mayOpen: false };
}

/** The current user's access to the Resource Planner, the Executive Dashboard and the dashboard widgets. A display guard, not security: Azure DevOps still trims the Epics a person can read. Team membership counts direct members only. */
export async function checkAccess(projectId: string, accessTeams: TeamRef[]): Promise<Access> {
  const admin = await projectAdminStatus(projectId);
  const me = SDK.getUser().id.toLowerCase();
  return evaluateAccess(accessTeams, admin, async id => {
    try { return (await withTimeout(getTeamMembersCompat(projectId, id, 2000), "Loading team members")).some(m => m.identity?.id?.toLowerCase() === me); }
    catch { return false; }       // a team that cannot be read counts as "not a member"
  });
}

/** The teams that may open the Executive Dashboard: its own list when one is set, otherwise the Resource Planner's Access teams. */
export const execAccessTeams = (s: { accessTeams: TeamRef[]; executive: { accessTeams: TeamRef[] } }): TeamRef[] => (s.executive.accessTeams.length ? s.executive.accessTeams : s.accessTeams);
export const NO_EXEC_ACCESS = "You do not have access to the Executive Dashboard for this project. Ask a project administrator to add you to one of its Executive Dashboard access teams.";
export const NO_ACCESS = "You do not have access to the Resource Planner for this project. Ask a project administrator to add you to one of its access teams.";
