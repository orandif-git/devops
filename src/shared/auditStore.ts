import * as SDK from "azure-devops-extension-sdk";
import { AuditEntry, DEFAULT_RETENTION_MONTHS, newAuditEntry } from "../core/audit";
import { dataManager } from "./ado";

const COLLECTION = "wig-audit";
const is404 = (e: unknown) => (e as { status?: number })?.status === 404 || /not exist|404|DocumentDoesNotExist/i.test(String((e as Error)?.message ?? e));
const docId = (projectId: string, id: string) => `audit-${projectId}-${id}`;
const settingsId = (projectId: string) => `audit-settings-${projectId}`;

export const currentActor = () => { const u = SDK.getUser(); return { userId: u.name || u.id, userName: u.displayName }; };

export async function appendAudit(projectId: string, p: Omit<Parameters<typeof newAuditEntry>[0], "userId" | "userName">): Promise<AuditEntry> {
  const entry = newAuditEntry({ ...currentActor(), ...p });
  await (await dataManager()).setDocument(COLLECTION, { id: docId(projectId, entry.id), kind: "entry", projectId, entry, __etag: -1 });
  return entry;
}

export async function listAudit(projectId: string): Promise<AuditEntry[]> {
  let docs: { kind?: string; projectId?: string; entry?: AuditEntry }[] = [];
  try { docs = await (await dataManager()).getDocuments(COLLECTION); } catch (e) { if (!is404(e)) throw e; }
  return docs.filter(d => d.kind === "entry" && d.projectId === projectId && d.entry).map(d => d.entry!).sort((a, b) => b.at.localeCompare(a.at));
}

export async function deleteAudit(projectId: string, ids: string[]): Promise<void> {
  const m = await dataManager();
  for (const id of ids) { try { await m.deleteDocument(COLLECTION, docId(projectId, id)); } catch (e) { if (!is404(e)) throw e; } }
}

export async function loadRetention(projectId: string): Promise<number> {
  try {
    const d = await (await dataManager()).getDocument(COLLECTION, settingsId(projectId));
    const n = Number(d?.retentionMonths);
    return Number.isInteger(n) && n >= 1 && n <= 120 ? n : DEFAULT_RETENTION_MONTHS;
  } catch (e) { if (is404(e)) return DEFAULT_RETENTION_MONTHS; throw e; }
}
export async function saveRetention(projectId: string, months: number): Promise<void> {
  await (await dataManager()).setDocument(COLLECTION, { id: settingsId(projectId), kind: "settings", projectId, retentionMonths: months, __etag: -1 });
}
