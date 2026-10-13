import { extractJson } from "../../../src/core/gridModel";
import { keyNorm } from "../../../src/core/keys";
import { Booking, GridSource, ParseStats, Task } from "./types";

const MONTH = /^\d{4}-\d{2}$/;
const num = (v: unknown): number | undefined => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : undefined; };
const day = (v: unknown): number | undefined => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? "")); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : undefined; };
const round = (n: number) => Math.round(n * 100) / 100;

/** Effort spread over the Monday–Friday days between two dates, per month. Used only when the grid stored no monthly hours. */
export function spreadEffort(start: string, end: string, effort: number): Record<string, number> {
  const a = day(start), b = day(end);
  if (a === undefined || b === undefined || b < a || !(effort > 0)) return {};
  const perMonth: Record<string, number> = {};
  let total = 0;
  for (let t = a; t <= b; t += 86400000) {
    const wd = new Date(t).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const m = new Date(t).toISOString().slice(0, 7);
    perMonth[m] = (perMonth[m] ?? 0) + 1; total++;
  }
  if (!total) return {};
  const out: Record<string, number> = {};
  for (const [m, d] of Object.entries(perMonth)) out[m] = round(effort * d / total);
  return out;
}

/** Read one Epic's grid text into bookings (hours per person and month). Rows in an excluded status are left out. */
export function parseSource(raw: string | undefined | null, src: GridSource, epicId: number, estimateUnscheduled = true): { bookings: Booking[]; tasks: Task[]; stats: ParseStats } {
  const stats: ParseStats = { rows: 0, counted: 0, excluded: 0, noPerson: 0, unscheduled: 0, estimated: 0, errored: 0, unreadable: false };
  const bookings: Booking[] = [];
  const tasks: Task[] = [];
  const text = String(raw ?? "").trim();
  if (!text) return { bookings, tasks, stats };
  let data: unknown;
  try { data = extractJson(text); } catch { stats.unreadable = true; return { bookings, tasks, stats }; }
  const rows = Array.isArray(data) ? data : Array.isArray((data as { rows?: unknown })?.rows) ? (data as { rows: unknown[] }).rows : null;
  if (!rows) { stats.unreadable = true; return { bookings, tasks, stats }; }
  const excluded = new Set(src.excludedStatuses.map(s => s.trim().toLowerCase()).filter(Boolean));
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const row = r as Record<string, unknown>;
    stats.rows++;
    const name = String(row[src.columns.resource] ?? "").trim();
    const person = keyNorm(name);
    if (!person) { stats.noPerson++; continue; }
    if (src.columns.status && excluded.has(String(row[src.columns.status] ?? "").trim().toLowerCase())) { stats.excluded++; continue; }
    if (typeof row._schedErr === "string" && row._schedErr) { stats.errored++; continue; }
    let months: Record<string, number> | undefined;
    let estimated = false;
    const stored = row._months;
    if (stored && typeof stored === "object" && !Array.isArray(stored)) months = stored as Record<string, number>;
    else if (estimateUnscheduled && src.columns.start && src.columns.end && src.columns.effort) {
      const e = num(row[src.columns.effort]);
      const m = e !== undefined ? spreadEffort(String(row[src.columns.start] ?? ""), String(row[src.columns.end] ?? ""), e) : {};
      if (Object.keys(m).length) { months = m; estimated = true; }
    }
    if (!months) { stats.unscheduled++; continue; }
    let any = false;
    for (const [month, h] of Object.entries(months)) {
      const hours = num(h);
      if (!MONTH.test(month) || hours === undefined || !(hours > 0)) continue;
      bookings.push({ epicId, sourceId: src.id, person, personName: name, month, hours, ...(estimated ? { estimated: true } : {}) });
      any = true;
    }
    if (any) {
      stats.counted++; if (estimated) stats.estimated++;
      // the row as a piece of work: its own dates when it has them, otherwise from the first to the last month with hours
      const ms = Object.keys(months).filter(m => MONTH.test(m) && (num(months![m]) ?? 0) > 0).sort();
      const iso = (v: unknown) => { const t = day(v); return t === undefined ? "" : new Date(t).toISOString().slice(0, 10); };
      let start = src.columns.start ? iso(row[src.columns.start]) : "", end = src.columns.end ? iso(row[src.columns.end]) : "";
      if (!start || !end || end < start) { start = `${ms[0]}-01`; end = new Date(Date.UTC(+ms[ms.length - 1].slice(0, 4), +ms[ms.length - 1].slice(5), 0)).toISOString().slice(0, 10); }
      tasks.push({ epicId, sourceId: src.id, person, personName: name, start, end, effort: src.columns.effort ? num(row[src.columns.effort]) : undefined,
        allocation: src.columns.allocation ? num(row[src.columns.allocation]) : undefined, label: src.columns.task ? String(row[src.columns.task] ?? "").trim() || undefined : undefined, ...(estimated ? { estimated: true } : {}) });
    } else stats.unscheduled++;
  }
  return { bookings, tasks, stats };
}

export const sumStats = (list: ParseStats[]): ParseStats => list.reduce((a, s) => ({
  rows: a.rows + s.rows, counted: a.counted + s.counted, excluded: a.excluded + s.excluded, noPerson: a.noPerson + s.noPerson,
  unscheduled: a.unscheduled + s.unscheduled, estimated: a.estimated + s.estimated, errored: a.errored + s.errored, unreadable: a.unreadable || s.unreadable,
}), { rows: 0, counted: 0, excluded: 0, noPerson: 0, unscheduled: 0, estimated: 0, errored: 0, unreadable: false });
