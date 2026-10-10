import * as SDK from "azure-devops-extension-sdk";
import { IdentityServiceIds, IVssIdentityService } from "azure-devops-extension-api/Identities";
import { listPeople } from "./ado";

export interface IdentityHit { text: string; displayName: string; detail: string; kind: "user" | "group" }

interface RawIdentity {
  displayName?: string; mail?: string; signInAddress?: string; samAccountName?: string; principalName?: string;
  entityType?: string; scopeName?: string; subjectDescriptor?: string;
}

/** "Display Name <sign-in>" – the format Azure DevOps identity fields accept. */
export function identityLabel(r: RawIdentity): IdentityHit | null {
  const name = r.displayName || r.principalName || "";
  if (!name) return null;
  const kind = /group/i.test(r.entityType ?? "") ? "group" : "user";
  const uid = r.signInAddress || r.mail || r.principalName || r.samAccountName || "";
  const detail = kind === "group" ? (r.scopeName || r.principalName || "Group") : uid;
  const text = kind === "group" ? (r.principalName || (r.scopeName ? `[${r.scopeName}]\\${name}` : name)) : uid ? `${name} <${uid}>` : name;
  return { text, displayName: name, detail, kind };
}

/**
 * Directory search through the host's people-picker service (the same one the work item form uses):
 * finds users and, optionally, AD / Azure AD / project groups. Falls back to project team members.
 */
export async function searchIdentities(query: string, includeGroups: boolean, projectId: string): Promise<IdentityHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    const svc = await SDK.getService<IVssIdentityService>(IdentityServiceIds.IdentityService);
    const raw = (await svc.searchIdentitiesAsync(q, includeGroups ? ["user", "group"] : ["user"], ["ims", "source"], "General", { MinResults: 5, MaxResults: 40 })) as unknown as RawIdentity[];
    const hits = raw.map(identityLabel).filter((x): x is IdentityHit => !!x);
    if (hits.length) return hits;
  } catch (e) {
    console.warn("[Grid & Rules] identity search failed, using team members", e);
  }
  try {
    const lq = q.toLowerCase();
    return (await listPeople(projectId)).filter(p => p.text.toLowerCase().includes(lq)).slice(0, 20)
      .map(p => ({ text: p.text, displayName: p.displayName, detail: p.uniqueName, kind: "user" as const }));
  } catch { return []; }
}
