import * as SDK from "azure-devops-extension-sdk";
import { AuditEntry, DEFAULT_RETENTION_MONTHS, newAuditEntry } from "../core/audit";
import { dataManager } from "./ado";
import { shortHash } from "./ids";

const COLLECTION = "wig-audit";
const is404 = (e: unknown) => (e as { status?: number })?.status === 404 || /not exist|404|DocumentDoesNotExist/i.test(String((e as Error)?.message ?? e));
/**
 * Short, fixed-length document ids. Azure DevOps keeps documents of an extension apart by id, and a long id that differs from another
 * one only near its end was seen to be stored as the same document (each new audit entry replaced the previous one), so the
 * project is represented by a short hash and the ids stay well under 40 characters.
 */
const pid = shortHash;
const settingsId = (projectId: string) => `as-${pid(projectId)}`;
const legacySettingsId = (projectId: string) => `audit-settings-${projectId}`;

export const currentActor = () => { const u = SDK.getUser(); return { userId: u.name || u.id, userName: u.displayName }; };

type Doc = Record<string, unknown> & { id: string; kind?: string; projectId?: string; entries?: AuditEntry[]; entry?: AuditEntry; __etag?: number };
const monthId = (projectId: string, ym: string, seq: number) => `am-${pid(projectId)}-${ym}${seq ? `-${seq}` : ""}`;
const MONTH_DOC_LIMIT = 1_500_000;                       // characters; a busier month continues in a second document
const sleep = (ms: number) => new Promise(r => window.setTimeout(r, ms));

/**
 * Entries are kept together per month, written by reading the month's document, adding the entry and saving it with the
 * version that was read (so two people saving at the same time cannot overwrite each other: the loser reads again and retries).
 * Entries written by earlier versions (one document each) are still read.
 */
/** Store one finished entry in its month's document (read, add, save with the version read, retry on a clash, read back). */
async function writeEntry(projectId: string, entry: AuditEntry): Promise<void> {
  const m = await dataManager();
  const ym = entry.at.slice(0, 7);
  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      let seq = 0, doc: Doc | undefined, id = monthId(projectId, ym, 0);
      for (;; seq++) {                                   // the first month document that still has room
        id = monthId(projectId, ym, seq);
        doc = undefined;
        try { doc = (await m.getDocument(COLLECTION, id)) as Doc; } catch (e) { if (!is404(e)) throw e; }
        if (!doc || JSON.stringify(doc.entries ?? []).length < MONTH_DOC_LIMIT) break;
      }
      const entries = Array.isArray(doc?.entries) ? doc!.entries! : [];
      if (!entries.some(e => e.id === entry.id)) {
        const next: Doc = doc ? { ...doc, entries: [...entries, entry] } : { id, kind: "month", projectId, entries: [entry], __etag: -1 };
        await m.setDocument(COLLECTION, next);
      }
      const back = (await m.getDocument(COLLECTION, id)) as Doc;          // read it back: an entry that was not stored must be reported
      if (!back?.entries?.some(e => e.id === entry.id)) throw new Error("the entry was not found after it was written");
      return;
    } catch (e) { lastError = e; await sleep(150 * (attempt + 1)); }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function appendAudit(projectId: string, p: Omit<Parameters<typeof newAuditEntry>[0], "userId" | "userName">): Promise<AuditEntry> {
  const entry = newAuditEntry({ ...currentActor(), ...p });
  await writeEntry(projectId, entry);
  return entry;
}

/** Entries from a backup file: only the ones the log does not have are added; existing entries are never changed. */
export async function importAudit(projectId: string, entries: AuditEntry[]): Promise<number> {
  const have = new Set((await listAudit(projectId)).map(e => e.id));
  let n = 0;
  for (const e of entries) if (!have.has(e.id)) { await writeEntry(projectId, e); n++; }
  return n;
}

async function allDocs(): Promise<Doc[]> {
  try { return (await (await dataManager()).getDocuments(COLLECTION)) as Doc[]; } catch (e) { if (!is404(e)) throw e; return []; }
}

export async function listAudit(projectId: string): Promise<AuditEntry[]> {
  const byId = new Map<string, AuditEntry>();
  for (const d of await allDocs()) {
    if (d.projectId !== projectId) continue;
    if (d.kind === "month") for (const e of d.entries ?? []) byId.set(e.id, e);
    else if (d.kind === "entry" && d.entry) byId.set(d.entry.id, d.entry);       // written by an earlier version
  }
  return Array.from(byId.values()).map(e => ({ ...e, at: String(e.at ?? "") })).sort((a, b) => b.at.localeCompare(a.at));        // `at` is always text, even if the host returned a Date
}

export async function deleteAudit(projectId: string, ids: string[]): Promise<void> {
  const gone = new Set(ids);
  const m = await dataManager();
  for (const d of await allDocs()) {
    if (d.projectId !== projectId) continue;
    try {
      if (d.kind === "entry" && d.entry && gone.has(d.entry.id)) await m.deleteDocument(COLLECTION, d.id);
      else if (d.kind === "month" && (d.entries ?? []).some(e => gone.has(e.id))) {
        const keep = (d.entries ?? []).filter(e => !gone.has(e.id));
        if (keep.length) await m.setDocument(COLLECTION, { ...d, entries: keep }); else await m.deleteDocument(COLLECTION, d.id);
      }
    } catch (e) { if (!is404(e)) throw e; }
  }
}

/** Read from the list of stored documents (no separate request for a record that may not exist yet, which would show up as a 404 in the browser console). */
export async function loadRetention(projectId: string): Promise<number> {
  const docs = await allDocs();
  const d = (docs.find(x => x.id === settingsId(projectId)) ?? docs.find(x => x.id === legacySettingsId(projectId))) as (Doc & { retentionMonths?: number }) | undefined;
  const n = Number(d?.retentionMonths);
  return Number.isInteger(n) && n >= 1 && n <= 120 ? n : DEFAULT_RETENTION_MONTHS;
}
export async function saveRetention(projectId: string, months: number): Promise<void> {
  await (await dataManager()).setDocument(COLLECTION, { id: settingsId(projectId), kind: "settings", projectId, retentionMonths: months, __etag: -1 });
}

/**
 * Diagnostic: writes throw-away records and reads them back (the real log is not touched):
 *  1. three documents with short, different ids – how entries are stored now
 *  2. three documents with long ids that differ only at the end – shows whether this server treats them as one
 *  3. three saves into one month document – read, add, save with the version read
 */
export async function auditStorageCheck(projectId: string): Promise<string[]> {
  const out: string[] = [];
  const m = await dataManager();
  const tag = `ac${Date.now().toString(36)}`;
  const mark = (ok: boolean, text: string) => out.push(`${ok ? "✔" : "✖"} ${text}`);
  const created: string[] = [];
  const put = async (id: string, extra: Record<string, unknown> = {}) => { created.push(id); await m.setDocument(COLLECTION, { id, kind: "check", projectId, ...extra, __etag: -1 }); };
  try {
    for (let i = 1; i <= 3; i++) await put(`${tag}-s${i}`, { n: i });
    const listed = ((await m.getDocuments(COLLECTION)) as Doc[]).filter(d => d.id.startsWith(`${tag}-s`));
    mark(listed.length === 3, `three documents with short ids: ${listed.length} found when listing`);
  } catch (e) { mark(false, "short ids: " + (e as Error).message); }
  try {
    const long = `audit-check-${projectId}-${tag}`;
    for (let i = 1; i <= 3; i++) await put(`${long}-long-${i}`, { n: i });
    const listed = ((await m.getDocuments(COLLECTION)) as Doc[]).filter(d => d.kind === "check" && d.id.startsWith("audit-check-"));
    out.push(`${listed.length === 3 ? "✔" : "ℹ"} three documents with long ids that differ only at the end: ${listed.length} found${listed.length === 3 ? "" : " – this server treats long ids as the same document, which is why short ids are used"}`);
  } catch (e) { mark(false, "long ids: " + (e as Error).message); }
  try {
    const id = `${tag}-m`;
    created.push(id);
    for (let i = 1; i <= 3; i++) {
      let doc: Doc | undefined;
      try { doc = (await m.getDocument(COLLECTION, id)) as Doc; } catch (e) { if (!is404(e)) throw e; }
      const entries = (Array.isArray(doc?.entries) ? doc!.entries! : []) as unknown[];
      await m.setDocument(COLLECTION, doc ? { ...doc, entries: [...entries, { id: String(i) }] } : { id, kind: "check", projectId, entries: [{ id: "1" }], __etag: -1 });
    }
    const back = (await m.getDocument(COLLECTION, id)) as Doc;
    mark((back.entries ?? []).length === 3, `three saves into one month document: ${(back.entries ?? []).length} entries inside`);
  } catch (e) { mark(false, "month document: " + (e as Error).message); }
  for (const d of ((await m.getDocuments(COLLECTION).catch(() => [])) as Doc[]).filter(x => x.kind === "check" && (created.includes(x.id) || x.id.startsWith("audit-check-")))) { try { await m.deleteDocument(COLLECTION, d.id); } catch { /* already gone */ } }
  try {
    const all = (await m.getDocuments(COLLECTION)) as Doc[];
    const kinds = new Map<string, number>();
    for (const d of all) { const k = `${d.kind ?? "other"}${d.projectId && d.projectId !== projectId ? " (other project)" : ""}`; kinds.set(k, (kinds.get(k) ?? 0) + 1); }
    mark(true, `stored in this collection: ${all.length} document(s) – ${Array.from(kinds, ([k, n]) => `${n} ${k}`).join(", ") || "none"}`);
    const n = (await listAudit(projectId)).length;
    mark(true, `the log currently holds ${n} entr${n === 1 ? "y" : "ies"}`);
  } catch (e) { mark(false, "reading the log: " + (e as Error).message); }
  return out;
}
