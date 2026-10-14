import * as SDK from "azure-devops-extension-sdk";
import { isRestrictedUser, ruleApplies } from "../core/commentOnly";
import { keyNorm } from "../core/keys";
import { ControlRule } from "../core/types";
import { getFormService, getTeamMembersCompat, withTimeout } from "./ado";
import { loadConfig } from "./configStore";

/**
 * The enabled rules that apply to this work item type AND to the current user (by name, or by direct membership of a rule's team).
 * Each team is read once even when several rules use it. A team that cannot be read counts as "not a member" (the restriction is a form-level guard, not a lock), and the reason is logged.
 */
export async function restrictedRules(projectId: string, rules: ControlRule[], type: string): Promise<ControlRule[]> {
  const applicable = rules.filter(r => ruleApplies(r, type));
  if (!applicable.length) return [];
  const u = SDK.getUser();
  const keys = [u.name, u.displayName, u.id].map(keyNorm).filter(Boolean);
  const me = String(u.id ?? "").toLowerCase();
  const member = new Map<string, boolean>();
  const teamIds: string[] = [];
  for (const t of applicable.flatMap(r => r.teams)) {
    if (!member.has(t.id)) {
      try { member.set(t.id, (await withTimeout(getTeamMembersCompat(projectId, t.id, 2000), "Loading team members")).some(m => m.identity?.id?.toLowerCase() === me)); }
      catch (e) { member.set(t.id, false); console.warn(`[Grid & Rules] controls: could not read team ${t.name}:`, (e as Error).message); }
    }
    if (member.get(t.id)) teamIds.push(t.id);
  }
  return applicable.filter(r => isRestrictedUser(r, { keys, teamIds }));
}

/** For the Smart Grid on the form: must it be read-only for the person looking at this work item (comments-only rule, or a rule that locks the grid's data field)? */
export async function gridLockedHere(projectId: string, gridField?: string): Promise<boolean> {
  try {
    const rules = (await loadConfig(projectId)).controls ?? [];
    if (!rules.some(r => r.enabled)) return false;
    const svc = await getFormService();
    if (await svc.isNew()) return false;
    const mine = await restrictedRules(projectId, rules, String(await svc.getFieldValue("System.WorkItemType")));
    const f = (gridField ?? "").toLowerCase();
    return mine.some(r => r.mode === "comments" || (!!f && r.fields.some(x => x.toLowerCase() === f)));
  } catch { return false; }
}
