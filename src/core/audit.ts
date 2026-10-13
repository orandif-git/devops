/** Audit log of settings and configuration changes (not row data): who, when, what changed (before → after), and why. */
export interface AuditChange { path: string; before: string; after: string }
export interface AuditEntry {
  id: string;
  at: string;                                  // ISO time
  userId: string;
  userName: string;
  /** which settings were saved */
  area: "configuration" | "capacity-settings" | "audit-settings" | "backup-restore";
  reason: string;
  comment: string;
  changes: AuditChange[];
  /** changes left out because there were too many to keep */
  omitted?: number;
}

const randomId = () => { try { return crypto.randomUUID().replace(/-/g, "").slice(0, 16); } catch { return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10); } };

export const MIN_REASON = 10;
export const DEFAULT_RETENTION_MONTHS = 24;
const MAX_CHANGES = 150;
const MAX_VALUE = 300;

export const validReason = (s: string) => s.trim().length >= MIN_REASON;

const show = (v: unknown): string => {
  if (v === undefined) return "(not set)";
  const t = typeof v === "string" ? v : JSON.stringify(v);
  return t.length > MAX_VALUE ? t.slice(0, MAX_VALUE) + "…" : t;
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
/** Items of an array can be matched by id/name (so inserting a column does not look like every later column changed). */
function keyOf(arr: unknown[]): string | undefined {
  for (const k of ["id", "name"]) {
    const keys = arr.map(x => (isObj(x) && typeof x[k] === "string" ? (x[k] as string) : undefined));
    if (keys.every(x => x !== undefined) && new Set(keys).size === keys.length) return k;
  }
  return undefined;
}

/** A readable list of the leaf values that differ between two settings objects. */
export function diffSettings(before: unknown, after: unknown): { changes: AuditChange[]; omitted: number } {
  const out: AuditChange[] = [];
  let omitted = 0;
  const push = (path: string, b: unknown, a: unknown) => { if (out.length < MAX_CHANGES) out.push({ path: path || "(root)", before: show(b), after: show(a) }); else omitted++; };
  const walk = (path: string, b: unknown, a: unknown) => {
    if (JSON.stringify(b) === JSON.stringify(a)) return;
    if (isObj(b) && isObj(a)) {
      for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) walk(path ? `${path}.${k}` : k, b[k], a[k]);
    } else if (Array.isArray(b) && Array.isArray(a)) {
      const key = keyOf(b) && keyOf(a) && keyOf(b) === keyOf(a) ? keyOf(b) : undefined;
      if (key) {
        const bm = new Map(b.map(x => [(x as Record<string, string>)[key], x])), am = new Map(a.map(x => [(x as Record<string, string>)[key], x]));
        for (const k of new Set([...bm.keys(), ...am.keys()])) walk(`${path}[${k}]`, bm.get(k), am.get(k));
      } else if (b.every(x => typeof x !== "object") && a.every(x => typeof x !== "object")) {
        // a list of plain values (dropdown options, allowed values…): say exactly what was added and removed
        const added = a.filter(x => !b.includes(x)), removed = b.filter(x => !a.includes(x));
        for (const x of added) push(`${path}`, "(not in the list)", `added: ${String(x)}`);
        for (const x of removed) push(`${path}`, `removed: ${String(x)}`, "(no longer in the list)");
        if (!added.length && !removed.length) push(path, b, a);          // same values, different order
      }
      else for (let i = 0; i < Math.max(b.length, a.length); i++) walk(`${path}[${i}]`, b[i], a[i]);
    } else push(path, b, a);
  };
  walk("", before, after);
  return { changes: out, omitted };
}

export function newAuditEntry(p: { at?: Date; userId: string; userName: string; area: AuditEntry["area"]; reason: string; comment: string; before: unknown; after: unknown }): AuditEntry {
  const { changes, omitted } = diffSettings(p.before, p.after);
  const at = (p.at ?? new Date()).toISOString();
  return { id: `${at.replace(/[^0-9]/g, "")}-${randomId()}`, at, userId: p.userId, userName: p.userName, area: p.area, reason: p.reason.trim(), comment: p.comment.trim(), changes, ...(omitted ? { omitted } : {}) };
}

export const AREA_LABEL: Record<AuditEntry["area"], string> = { configuration: "Grid & Rules configuration", "capacity-settings": "Capacity settings", "audit-settings": "Audit log settings", "backup-restore": "Restore from backup" };

import { describeChange } from "./auditText";

const csvCell = (s: string) => /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
/** One CSV row per changed value (an entry without value changes still gets one row). */
export function auditCsv(entries: AuditEntry[], when: (iso: string) => string): string {
  const rows: string[][] = [["When", "User", "User id", "Area", "Reason", "Comment", "What changed", "Setting", "Previous value", "New value"]];
  for (const e of entries) {
    const head = [when(e.at), e.userName, e.userId, AREA_LABEL[e.area] ?? e.area, e.reason, e.comment];
    if (!e.changes.length) rows.push([...head, "", "", "", ""]);
    for (const c of e.changes) rows.push([...head, describeChange(c, e.area).text, c.path, c.before, c.after]);
    if (e.omitted) rows.push([...head, `(${e.omitted} more changes not kept)`, "", "", ""]);
  }
  return rows.map(r => r.map(c => `"${csvCell(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
}

export const olderThan = (entries: AuditEntry[], months: number, now = new Date()) => {
  const cut = new Date(now); cut.setMonth(cut.getMonth() - months);
  return entries.filter(e => new Date(e.at) < cut);
};
