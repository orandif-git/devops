import { ProjectConfig } from "./types";

export interface WrittenField { field: string; by: string[] }

/**
 * Every work item field the extension WRITES to (calculation results, grid totals, grouped totals).
 * These should be read-only for users: the extension recalculates them, so a typed value would be overwritten.
 * (Grid data fields are not listed: the Smart Grid control already replaces their input.)
 */
export function writtenFields(config: Pick<ProjectConfig, "calculations" | "grids">): WrittenField[] {
  const map = new Map<string, string[]>();
  const add = (field: string | undefined, by: string) => { if (field) map.set(field, [...(map.get(field) ?? []), by]); };
  for (const c of config.calculations ?? []) add(c.resultField, `Calculation “${c.name}”`);
  for (const [name, g] of Object.entries(config.grids ?? {})) {
    for (const t of g.totals ?? []) add(t.field, `Grid “${name}” total (${t.aggregate} of ${t.column}${t.where ? ` where ${t.where.column} is ${t.where.values.join("/")}` : ""})`);
    for (const b of g.breakdowns ?? []) for (const [group, field] of Object.entries(b.fields ?? {})) add(field, `Grid “${name}” group “${group}”`);
  }
  return Array.from(map, ([field, by]) => ({ field, by })).sort((a, b) => a.field.localeCompare(b.field));
}

/** Display text for a read-only value: numbers without float noise, empty as an en dash. */
export function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "–";
  if (typeof v === "number") return Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : "–";
  const s = String(v);
  const n = /^-?\d+(\.\d+)?$/.test(s.trim()) ? parseFloat(s) : NaN;
  return Number.isFinite(n) ? String(Math.round(n * 1e6) / 1e6) : s;
}
