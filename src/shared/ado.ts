import * as SDK from "azure-devops-extension-sdk";
import { CommonServiceIds, getClient, IExtensionDataService, ILocationService, IProjectPageService } from "azure-devops-extension-api";
import { CoreRestClient } from "azure-devops-extension-api/Core";
import { WorkRestClient } from "azure-devops-extension-api/Work";
import { WorkItemTrackingRestClient, WorkItemTypeFieldsExpandLevel } from "azure-devops-extension-api/WorkItemTracking";
import { IWorkItemFormService, WorkItemTrackingServiceIds } from "azure-devops-extension-api/WorkItemTracking/WorkItemTrackingServices";
import { emptyConfig, ProjectConfig } from "../core/types";
import { normalizeProject } from "../core/normalize";
import { withTimeout } from "./timeout";

export async function init(loadSucceeded = true): Promise<void> {
  await SDK.init({ loaded: false, applyTheme: true });
  await SDK.ready();
  if (loadSucceeded) await SDK.notifyLoadSucceeded();
}

export async function getProject(): Promise<{ id: string; name: string }> {
  const svc = await SDK.getService<IProjectPageService>(CommonServiceIds.ProjectPageService);
  const p = await svc.getProject();
  if (!p) throw new Error("No project context");
  return { id: p.id, name: p.name };
}

export const getFormService = () =>
  SDK.getService<IWorkItemFormService>(WorkItemTrackingServiceIds.WorkItemFormService);

/**
 * Azure DevOps Services: use the organization address directly instead of asking the host's location service
 * (a lookup that can stall silently inside an extension frame). Server: let the SDK resolve it.
 */
const restOptions = () => {
  try { const h = SDK.getHost(); return h.isHosted && h.name ? { rootPath: `https://dev.azure.com/${h.name}/` } : undefined; } catch { return undefined; }
};
export const witClient = () => getClient(WorkItemTrackingRestClient, restOptions());
export const coreClient = () => getClient(CoreRestClient, restOptions());
export const workClient = () => getClient(WorkRestClient, restOptions());

export { withTimeout };

/**
 * GET with an explicit, old REST api-version. The typed clients request the newest version (7.x), which Azure DevOps Server 2020
 * (max 6.1) rejects with HTTP 400. Version 5.0 is accepted by Server 2019+ and by Services.
 */
/** `scope` is an optional "{project}/{team}" prefix (already URL-encoded) in front of /_apis/. */
export async function getCompat<T>(path: string, query: Record<string, string | number> = {}, scope = ""): Promise<T> {
  // Services: the organization address directly (the location service can stall inside an extension frame, see restOptions); Server: ask the host
  let base = "";
  try { const h = SDK.getHost(); if (h.isHosted && h.name) base = `https://dev.azure.com/${h.name}`; } catch { /* use the location service */ }
  if (!base) base = (await withTimeout((await SDK.getService<ILocationService>(CommonServiceIds.LocationService)).getServiceLocation(), "Finding the server address")).replace(/\/+$/, "");
  const token = await SDK.getAccessToken();
  const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])), "api-version": "5.0" });
  const res = await fetch(`${base}/${scope ? scope + "/" : ""}_apis/${path}?${qs}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return (await res.json()) as T;
}

export interface TeamLite { id: string; name: string }
export interface MemberLite { identity?: { id?: string; displayName: string; uniqueName: string } }

export async function getTeamsCompat(projectId: string, top = 200): Promise<TeamLite[]> {
  return (await getCompat<{ value: TeamLite[] }>(`projects/${encodeURIComponent(projectId)}/teams`, { $top: top })).value;
}
export async function getTeamMembersCompat(projectId: string, teamId: string, top = 500): Promise<MemberLite[]> {
  return (await getCompat<{ value: MemberLite[] }>(`projects/${encodeURIComponent(projectId)}/teams/${encodeURIComponent(teamId)}/members`, { $top: top })).value;
}

// ---------- config storage (extension data service, one document per project) ----------
const COLLECTION = "wig-config";

export async function dataManager() {
  const svc = await SDK.getService<IExtensionDataService>(CommonServiceIds.ExtensionDataService);
  return svc.getExtensionDataManager(SDK.getExtensionContext().id, await SDK.getAccessToken());
}

export async function loadConfig(projectId: string): Promise<ProjectConfig> {
  try {
    const m = await dataManager();
    const doc = await m.getDocument(COLLECTION, `project-${projectId}`);
    const c = doc?.config as ProjectConfig | undefined;
    return c ? normalizeProject({ ...emptyConfig(), ...c }) : emptyConfig();
  } catch (e) {
    // 404 = not configured yet
    if ((e as { status?: number })?.status === 404 || /not exist|404|DocumentDoesNotExist/i.test(String((e as Error)?.message ?? e))) return emptyConfig();
    throw e;
  }
}

export async function saveConfig(projectId: string, config: ProjectConfig): Promise<void> {
  const m = await dataManager();
  // __etag -1 = overwrite whatever version is stored (last save wins); without it a second save fails with 1660003
  await m.setDocument(COLLECTION, { id: `project-${projectId}`, config, __etag: -1 });
}

// ---------- field helpers ----------
const TYPE_NAMES = ["string", "integer", "dateTime", "plainText", "html", "treePath", "history", "double", "guid", "boolean", "identity", "picklistString", "picklistInteger", "picklistDouble"];
/** The REST API returns field types as strings; the SDK typings say numeric enum. Accept both. */
export const normType = (t: unknown): string => (typeof t === "number" ? TYPE_NAMES[t] ?? String(t) : String(t ?? ""));

export interface FieldInfo {
  referenceName: string; name: string; type: string; readOnly: boolean; isPicklist: boolean; isIdentity: boolean;
  /** allowed values from the process (picklists / state / etc.), when known */
  allowedValues?: string[];
}

/** Fields of a work item type (real process fields) merged with org field metadata; no type = all fields. */
export async function listFields(project: string, workItemType?: string): Promise<FieldInfo[]> {
  const c = await witClient();
  const all = await withTimeout(c.getFields(project), "Loading fields");
  const meta = new Map(all.map(f => [f.referenceName, f]));
  const toInfo = (f: (typeof all)[number], allowed?: string[]): FieldInfo => ({
    referenceName: f.referenceName, name: f.name, type: normType(f.type), readOnly: !!f.readOnly,
    isPicklist: !!f.isPicklist, isIdentity: !!f.isIdentity, allowedValues: allowed,
  });
  if (!workItemType) return all.map(f => toInfo(f)).sort((a, b) => a.name.localeCompare(b.name));
  const typed = await withTimeout(c.getWorkItemTypeFieldsWithReferences(project, workItemType, WorkItemTypeFieldsExpandLevel.AllowedValues), `Loading the fields of ${workItemType}`);
  return typed.map(t => {
    const m = meta.get(t.referenceName);
    const allowed = Array.isArray(t.allowedValues) && t.allowedValues.length ? t.allowedValues.map(String) : undefined;
    return m ? toInfo(m, allowed) : { referenceName: t.referenceName, name: t.name, type: "", readOnly: false, isPicklist: false, isIdentity: false, allowedValues: allowed };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export async function listWorkItemTypes(project: string): Promise<string[]> {
  const t = await withTimeout((await witClient()).getWorkItemTypes(project), "Loading work item types");
  return t.map(x => x.name).sort();
}

/** Accessible name of an identity field value (IdentityRef object or string). */
export function identityText(v: unknown): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  const o = v as { displayName?: string; uniqueName?: string };
  return o.displayName ? `${o.displayName}${o.uniqueName ? ` <${o.uniqueName}>` : ""}` : "";
}

export interface Person { displayName: string; uniqueName: string; text: string }

let peopleCache: Promise<Person[]> | undefined;
/** Project team members (works on Services and Server). */
export function listPeople(projectId: string): Promise<Person[]> {
  peopleCache ??= (async () => {
    const teams = await withTimeout(getTeamsCompat(projectId, 50), "Loading teams");
    const seen = new Map<string, Person>();
    for (const t of teams) {
      try {
        for (const m of await withTimeout(getTeamMembersCompat(projectId, t.id, 500), "Loading team members")) {
          const id = m.identity;
          if (!id?.uniqueName) continue;
          seen.set(id.uniqueName.toLowerCase(), { displayName: id.displayName, uniqueName: id.uniqueName, text: `${id.displayName} <${id.uniqueName}>` });
        }
      } catch { /* team not readable */ }
    }
    return Array.from(seen.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
  })();
  return peopleCache;
}

export function downloadFile(name: string, data: Blob | string, mime = "text/plain") {
  const blob = typeof data === "string" ? new Blob([data], { type: mime }) : data;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}
