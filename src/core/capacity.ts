import { keyNorm } from "./keys";
import { parseCsv, toCsv } from "./csv";

export interface CapacityChange { at: string; by: string; what: string }

/** One person's capacity: default hours per month plus exceptions for specific months. */
export interface CapacityRecord {
  /** normalized key (email) – see keyNorm */
  key: string;
  /** display text, e.g. "Ann Lee <ann@x.com>" */
  name: string;
  defaultHours: number | null;
  /** "2026-03" -> hours (leave, part time, holidays …) */
  overrides: Record<string, number>;
  updatedBy?: string;
  updatedAt?: string;
  history?: CapacityChange[];
}

export interface CapacityRegister {
  /** applies to registered people who have neither a default nor an override */
  projectDefault: number | null;
  resources: Record<string, CapacityRecord>;
}

export const emptyRegister = (): CapacityRegister => ({ projectDefault: null, resources: {} });
export const MONTH = /^\d{4}-\d{2}$/;

/** "2026-03-14" / "2026-03" / Date -> "2026-03"; anything else -> "". */
export function monthKey(v: unknown): string {
  const m = /^(\d{4})-(\d{2})/.exec(String(v ?? "").trim());
  return m ? `${m[1]}-${m[2]}` : "";
}

/**
 * Available hours of a person in a month: exception for that month, else the person's default, else the project default.
 * A person who is not registered has no capacity (null) – the grid shows "not registered" instead of guessing.
 */
export function capacityFor(reg: CapacityRegister, resource: unknown, month: string): number | null {
  const rec = reg.resources[keyNorm(resource)];
  if (!rec) return null;
  const m = monthKey(month);
  if (m && rec.overrides[m] !== undefined) return rec.overrides[m];
  if (rec.defaultHours !== null && rec.defaultHours !== undefined) return rec.defaultHours;
  return reg.projectDefault;
}

export const recordKey = (name: string) => keyNorm(name);

export function newRecord(name: string, defaultHours: number | null = null): CapacityRecord {
  return { key: recordKey(name), name: name.trim(), defaultHours, overrides: {} };
}

export const addHistory = (rec: CapacityRecord, by: string, what: string, at = new Date().toISOString()): CapacityRecord =>
  ({ ...rec, updatedBy: by, updatedAt: at, history: [{ at, by, what }, ...(rec.history ?? [])].slice(0, 30) });

// ---------------- import / export (wide format: Resource, Default hours, 2026-01, 2026-02, …) ----------------

export const monthsOf = (year: number) => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);

export function toMatrix(records: CapacityRecord[], year: number): (string | number)[][] {
  const months = monthsOf(year);
  return [["Resource", "Default hours", ...months],
    ...records.map(r => [r.name, r.defaultHours ?? "", ...months.map(m => (r.overrides[m] !== undefined ? r.overrides[m] : ""))])];
}
export const exportCapacityCsv = (records: CapacityRecord[], year: number) => toCsv(toMatrix(records, year));

export interface ImportResult { records: CapacityRecord[]; created: number; updated: number; skipped: string[] }

const num = (v: unknown): number | null | undefined => {
  const s = String(v ?? "").trim();
  if (s === "") return undefined;                    // blank cell = leave as is
  const n = parseFloat(s.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;    // null = invalid
};

/**
 * Merge a wide-format sheet into existing records. Blank cells change nothing; a month cell with a number sets that
 * month's exception; "Default hours" sets the default. Unknown people are created.
 */
export function importMatrix(matrix: unknown[][], existing: CapacityRecord[]): ImportResult {
  const out: ImportResult = { records: [], created: 0, updated: 0, skipped: [] };
  if (!matrix.length) return out;
  const header = matrix[0].map(h => String(h ?? "").trim());
  const iName = header.findIndex(h => /^(resource|name|person|email)$/i.test(h));
  const iDef = header.findIndex(h => /^default( hours)?$/i.test(h));
  const monthCols = header.map((h, i) => ({ h: monthKey(h), i })).filter(x => x.h && MONTH.test(String(header[x.i]).slice(0, 7)));
  if (iName < 0) { out.skipped.push("No “Resource” column found in the first row"); return out; }
  const byKey = new Map(existing.map(r => [r.key, r]));
  matrix.slice(1).forEach((row, n) => {
    const name = String(row[iName] ?? "").trim();
    if (!name) return;
    const key = recordKey(name);
    const had = byKey.get(key);
    const rec: CapacityRecord = had ? { ...had, overrides: { ...had.overrides } } : newRecord(name);
    let bad = false;
    if (iDef >= 0) { const d = num(row[iDef]); if (d === null) bad = true; else if (d !== undefined) rec.defaultHours = d; }
    for (const { h, i } of monthCols) { const v = num(row[i]); if (v === null) bad = true; else if (v !== undefined) rec.overrides[h] = v; }
    if (bad) { out.skipped.push(`Row ${n + 2} (${name}): a value is not a valid number of hours`); return; }
    byKey.set(key, rec);
    out.records.push(rec);
    if (had) out.updated++; else out.created++;
  });
  return out;
}

export const parseCapacityCsv = (text: string, existing: CapacityRecord[]) => importMatrix(parseCsv(text), existing);
