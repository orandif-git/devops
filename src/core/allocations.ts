import { CapacityRecord, CapacityRegister, capacityFor, monthKey } from "./capacity";
import { keyNorm } from "./keys";
import { GridConfig, GridRow } from "./types";

/** What one work item (Epic) has allocated: hours per person and month, saved centrally when the Epic is saved. */
export interface AllocationDoc {
  workItemId: number;
  title?: string;
  updatedAt: string;
  /** "ann@x.com|2026-03" -> hours */
  entries: Record<string, number>;
}

export const allocKey = (resource: unknown, month: unknown) => `${keyNorm(resource)}|${monthKey(month)}`;

/** Hours per person+month of a derived grid (the rows of one Epic). Rows without a person or month are ignored. */
export function entriesFromRows(rows: GridRow[], cols: { resource: string; period: string; hours: string }): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const key = allocKey(r[cols.resource], r[cols.period]);
    const h = Number(r[cols.hours]);
    if (key.startsWith("|") || key.endsWith("|") || !Number.isFinite(h) || h === 0) continue;
    out[key] = Math.round(((out[key] ?? 0) + h) * 1e6) / 1e6;
  }
  return out;
}

/** Sum of every allocation, optionally leaving one work item out (the one being viewed). */
export function sumAllocations(docs: AllocationDoc[], excludeWorkItemId?: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of docs) {
    if (excludeWorkItemId !== undefined && d.workItemId === excludeWorkItemId) continue;
    for (const [k, h] of Object.entries(d.entries)) out[k] = Math.round(((out[k] ?? 0) + h) * 1e6) / 1e6;
  }
  return out;
}

export const sameEntries = (a: Record<string, number>, b: Record<string, number>) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

/** The column that publishes: configured explicitly, or the grid's key/hours columns of a standard capacity grid. */
export const allocationCols = (cfg: GridConfig) => cfg.allocation;

// ---------------- manager overview: capacity vs. hours across all Epics ----------------

export interface OverviewCell { month: string; capacity: number | null; allocated: number; utilization: number | null; over: boolean }
export interface OverviewRow { key: string; name: string; cells: OverviewCell[] }

export function buildOverview(records: CapacityRecord[], register: CapacityRegister, docs: AllocationDoc[], months: string[]): OverviewRow[] {
  const alloc = sumAllocations(docs);
  const names = new Map(records.map(r => [r.key, r.name]));
  const keys = new Set<string>(records.map(r => r.key));
  for (const k of Object.keys(alloc)) keys.add(k.split("|")[0]);                       // people with hours but no capacity registered
  return Array.from(keys).map(key => {
    const cells = months.map(month => {
      const capacity = capacityFor(register, names.get(key) ?? key, month);
      const allocated = alloc[`${key}|${month}`] ?? 0;
      const utilization = capacity ? Math.round((allocated / capacity) * 1000) / 10 : null;
      // a month with no available hours (leave) but hours booked is over capacity even though no percentage can be shown
      return { month, capacity, allocated, utilization, over: (utilization !== null && utilization > 100) || (capacity === 0 && allocated > 0) };
    });
    return { key, name: names.get(key) ?? key, cells };
  }).filter(r => r.cells.some(c => c.allocated > 0 || c.capacity)).sort((a, b) => a.name.localeCompare(b.name));
}
