import * as SDK from "azure-devops-extension-sdk";
import { CapacityRecord, CapacityRegister, emptyRegister } from "../core/capacity";
import { coreClient, dataManager } from "./ado";

const COLLECTION = "wig-capacity";

export interface TeamRef { id: string; name: string }
export interface CapacitySettings {
  /** members of these Azure DevOps teams may edit capacity (empty = any project member). Project administrators always may. */
  editorTeams: TeamRef[];
  /** hours per month for registered people who have no default of their own */
  defaultHours: number | null;
}
export const defaultSettings = (): CapacitySettings => ({ editorTeams: [], defaultHours: null });

const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(16); };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
const recordId = (projectId: string, key: string) => `res-${projectId}-${slug(key)}-${hash(key)}`;
const settingsId = (projectId: string) => `settings-${projectId}`;
const is404 = (e: unknown) => (e as { status?: number })?.status === 404 || /not exist|404|DocumentDoesNotExist/i.test(String((e as Error)?.message ?? e));

export async function loadSettings(projectId: string): Promise<CapacitySettings> {
  try {
    const doc = await (await dataManager()).getDocument(COLLECTION, settingsId(projectId));
    return { ...defaultSettings(), ...(doc?.settings as Partial<CapacitySettings> | undefined) };
  } catch (e) { if (is404(e)) return defaultSettings(); throw e; }
}

export async function saveSettings(projectId: string, settings: CapacitySettings): Promise<void> {
  await (await dataManager()).setDocument(COLLECTION, { id: settingsId(projectId), kind: "settings", projectId, settings, __etag: -1 });
}

/** One document per person, so two managers editing different people never overwrite each other. */
export async function listRecords(projectId: string): Promise<CapacityRecord[]> {
  let docs: { kind?: string; projectId?: string; record?: CapacityRecord }[] = [];
  try { docs = await (await dataManager()).getDocuments(COLLECTION); } catch (e) { if (!is404(e)) throw e; }
  return docs.filter(d => d.kind === "resource" && d.projectId === projectId && d.record).map(d => d.record!)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveRecord(projectId: string, record: CapacityRecord): Promise<void> {
  await (await dataManager()).setDocument(COLLECTION, { id: recordId(projectId, record.key), kind: "resource", projectId, record, __etag: -1 });
}

export async function deleteRecord(projectId: string, key: string): Promise<void> {
  try { await (await dataManager()).deleteDocument(COLLECTION, recordId(projectId, key)); } catch (e) { if (!is404(e)) throw e; }
}

export async function loadRegister(projectId: string): Promise<CapacityRegister> {
  const [records, settings] = await Promise.all([listRecords(projectId), loadSettings(projectId)]);
  const reg = emptyRegister();
  reg.projectDefault = settings.defaultHours;
  for (const r of records) reg.resources[r.key] = r;
  return reg;
}

export const listTeams = async (projectId: string): Promise<TeamRef[]> =>
  (await (await coreClient()).getTeams(projectId, false, 200)).map(t => ({ id: t.id, name: t.name })).sort((a, b) => a.name.localeCompare(b.name));

/**
 * May the current user edit capacity? Yes when no team is configured, or when they are a (direct) member of a configured team.
 * Project administrators edit capacity in the Grid & Rules settings page, which only they can open.
 * Note: this is access control inside the extension's pages, not a security boundary of Azure DevOps.
 */
export async function checkCanEdit(projectId: string, settings: CapacitySettings): Promise<{ canEdit: boolean; reason: string }> {
  if (!settings.editorTeams.length) return { canEdit: true, reason: "No editor team is configured, so any project member may edit." };
  const me = SDK.getUser().id.toLowerCase();
  const core = await coreClient();
  for (const t of settings.editorTeams) {
    try {
      const members = await core.getTeamMembersWithExtendedProperties(projectId, t.id, 1000);
      if (members.some(m => m.identity?.id?.toLowerCase() === me)) return { canEdit: true, reason: `You are a member of the team “${t.name}”.` };
    } catch { /* team not readable: treat as not a member */ }
  }
  return { canEdit: false, reason: `Read-only: you are not a member of ${settings.editorTeams.map(t => `“${t.name}”`).join(" or ")}. Ask a team administrator to add you.` };
}
