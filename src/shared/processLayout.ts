import * as SDK from "azure-devops-extension-sdk";
import { CommonServiceIds, ILocationService } from "azure-devops-extension-api";
import { withTimeout } from "./timeout";

/**
 * Adds or removes the “Delivery progress” group in the layout of a work item type of an inherited process, through the process API.
 * A process is shared by every project that uses it, so the caller shows which projects before anything is changed.
 * Everything that can go wrong (no permission, a system or XML process, an old server) comes back as a ProcessLayoutError with a plain message and the manual steps.
 */
export interface Rest { get(path: string, query?: Record<string, string>): Promise<unknown>; send(method: "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<unknown> }
export class ProcessLayoutError extends Error { constructor(message: string, readonly kind: "permission" | "unsupported" | "notfound" | "other") { super(message); this.name = "ProcessLayoutError"; } }

export interface ProcessInfo { id: string; name: string; /** "inherited" is the only kind the extension can change */ kind: string; projects: { id: string; name: string }[] }
export interface LayoutGroup { id: string; label: string; controls?: { contribution?: { contributionId?: string } }[] }
export interface LayoutSection { id: string; groups?: LayoutGroup[] }
export interface LayoutPage { id: string; label: string; pageType?: string; sections?: LayoutSection[] }
export interface Layout { pages?: LayoutPage[] }

const API_LIST = "5.0-preview.2", API_LAYOUT = "5.0-preview.1";
const base = async () => {
  try { const h = SDK.getHost(); if (h.isHosted && h.name) return `https://dev.azure.com/${h.name}`; } catch { /* Server */ }
  return (await withTimeout((await SDK.getService<ILocationService>(CommonServiceIds.LocationService)).getServiceLocation(), "Finding the server address")).replace(/\/+$/, "");
};
const explain = async (res: Response, what: string): Promise<never> => {
  let detail = ""; try { const j = await res.json() as { message?: string }; detail = j.message ?? ""; } catch { /* no body */ }
  if (res.status === 401 || res.status === 403) throw new ProcessLayoutError(`You do not have permission to edit this process (${what}).`, "permission");
  if (res.status === 404) throw new ProcessLayoutError(`${what} was not found. This server may not support changing the layout from an extension, or the process is not an inherited one.`, "notfound");
  throw new ProcessLayoutError(`${what} failed (HTTP ${res.status}${detail ? ": " + detail : ""}).`, "other");
};
/** The real REST calls, with the user’s own token (so only people who may edit the process can change it). */
export const realRest: Rest = {
  async get(path, query = {}) {
    const res = await fetch(`${await base()}/_apis/${path}?${new URLSearchParams({ ...query, "api-version": path.includes("/layout") ? API_LAYOUT : API_LIST })}`, { headers: { Authorization: `Bearer ${await SDK.getAccessToken()}`, Accept: "application/json" } });
    return res.ok ? res.json() : explain(res, "Reading the process");
  },
  async send(method, path, body) {
    const res = await fetch(`${await base()}/_apis/${path}?api-version=${API_LAYOUT}`, { method, headers: { Authorization: `Bearer ${await SDK.getAccessToken()}`, Accept: "application/json", "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!res.ok) return explain(res, method === "DELETE" ? "Removing the group" : "Changing the layout");
    return res.status === 204 ? undefined : res.json().catch(() => undefined);
  },
};

type P = { typeId?: string; id?: string; name?: string; customizationType?: string; projects?: { id: string; name: string }[] };
/** The process the project uses, with the other projects on it. */
export async function findProcess(rest: Rest, projectId: string): Promise<ProcessInfo> {
  const r = (await rest.get("work/processes", { $expand: "projects" })) as { value?: P[] };
  const p = (r.value ?? []).find(x => (x.projects ?? []).some(y => y.id === projectId));
  if (!p) throw new ProcessLayoutError("The process of this project could not be found.", "notfound");
  return { id: String(p.typeId ?? p.id), name: p.name ?? "", kind: p.customizationType ?? "", projects: (p.projects ?? []).map(x => ({ id: x.id, name: x.name })) };
}
/** The reference name of a work item type of the process, found by its name. */
export async function findType(rest: Rest, processId: string, typeName: string): Promise<string> {
  const r = (await rest.get(`work/processes/${encodeURIComponent(processId)}/workItemTypes`)) as { value?: { referenceName: string; name: string }[] };
  const t = (r.value ?? []).find(x => x.name.toLowerCase() === typeName.toLowerCase());
  if (!t) throw new ProcessLayoutError(`The work item type “${typeName}” is not in this process.`, "notfound");
  return t.referenceName;
}
export async function getLayout(rest: Rest, processId: string, typeRef: string): Promise<Layout> {
  return (await rest.get(`work/processes/${encodeURIComponent(processId)}/workItemTypes/${encodeURIComponent(typeRef)}/layout`)) as Layout;
}
/** The Details page (the first custom page) and its first column. */
export function detailsSlot(layout: Layout): { pageId: string; sectionId: string } {
  const page = (layout.pages ?? []).find(x => x.pageType === "custom") ?? (layout.pages ?? [])[0], section = page?.sections?.[0];
  if (!page || !section) throw new ProcessLayoutError("The layout of this work item type has no Details page to add the group to.", "unsupported");
  return { pageId: page.id, sectionId: section.id };
}
/** Where the group is now, if it is in the layout (by the control it holds, or by its name). */
export function findGroup(layout: Layout, contributionId: string, label: string): { pageId: string; sectionId: string; groupId: string; position: number } | undefined {
  const all: { pageId: string; sectionId: string; groupId: string; position: number; label: string; holds: boolean }[] = [];
  for (const pg of layout.pages ?? []) for (const sec of pg.sections ?? []) (sec.groups ?? []).forEach((g, position) => all.push({ pageId: pg.id, sectionId: sec.id, groupId: g.id, position, label: g.label, holds: (g.controls ?? []).some(c => c.contribution?.contributionId === contributionId) }));
  const hit = all.find(x => x.holds) ?? all.find(x => x.label === label);
  return hit && { pageId: hit.pageId, sectionId: hit.sectionId, groupId: hit.groupId, position: hit.position };
}

export interface AddResult { groupId: string; /** the group could not be put first, so it is at this place (0 = first) */ position?: number }
/** Adds the group with the control, first in the first column of the Details page. If the control cannot be added the group is taken out again. */
export async function addGroup(rest: Rest, p: { processId: string; typeRef: string; label: string; contributionId: string; height: number }): Promise<AddResult> {
  const layout = await getLayout(rest, p.processId, p.typeRef), have = findGroup(layout, p.contributionId, p.label);
  if (have) return { groupId: have.groupId, position: have.position };                         // already there: nothing to add
  const slot = detailsSlot(layout), root = `work/processes/${encodeURIComponent(p.processId)}/workItemTypes/${encodeURIComponent(p.typeRef)}/layout`;
  const g = (await rest.send("POST", `${root}/pages/${encodeURIComponent(slot.pageId)}/sections/${encodeURIComponent(slot.sectionId)}/groups`, { label: p.label, order: 0, visible: true })) as { id?: string } | undefined;
  if (!g?.id) throw new ProcessLayoutError("The group was not created.", "other");
  try { await rest.send("POST", `${root}/groups/${encodeURIComponent(g.id)}/controls`, { label: p.label, isContribution: true, visible: true, contribution: { contributionId: p.contributionId, inputs: {}, height: p.height } }); }
  catch (e) { try { await rest.send("DELETE", `${root}/pages/${encodeURIComponent(slot.pageId)}/sections/${encodeURIComponent(slot.sectionId)}/groups/${encodeURIComponent(g.id)}`); } catch { /* the empty group is left for the administrator */ } throw e; }
  const after = findGroup(await getLayout(rest, p.processId, p.typeRef), p.contributionId, p.label);
  return { groupId: g.id, ...(after && after.position !== 0 ? { position: after.position } : {}) };
}
/** Takes the group out of the layout (nothing happens if it is not there). */
export async function removeGroup(rest: Rest, p: { processId: string; typeRef: string; label: string; contributionId: string }): Promise<boolean> {
  const have = findGroup(await getLayout(rest, p.processId, p.typeRef), p.contributionId, p.label);
  if (!have) return false;
  await rest.send("DELETE", `work/processes/${encodeURIComponent(p.processId)}/workItemTypes/${encodeURIComponent(p.typeRef)}/layout/pages/${encodeURIComponent(have.pageId)}/sections/${encodeURIComponent(have.sectionId)}/groups/${encodeURIComponent(have.groupId)}`);
  return true;
}
/** The contribution id of the control, as the layout needs it: publisher.extension.contribution. */
export function contributionId(): string { const c = SDK.getExtensionContext(); return `${c.publisherId}.${c.extensionId}.delivery-progress`; }
