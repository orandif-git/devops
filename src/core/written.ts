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
    if (g.review?.overall?.field) add(g.review.overall.field, `Grid “${name}” overall review status`);
    for (const b of g.breakdowns ?? []) for (const [group, field] of Object.entries(b.fields ?? {})) add(field, `Grid “${name}” group “${group}”`);
  }
  return Array.from(map, ([field, by]) => ({ field, by })).sort((a, b) => a.field.localeCompare(b.field));
}

/** Display text for a read-only value: numbers without float noise, empty as an en dash. */
export function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "–";
  if (typeof v === "number") return Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : "–";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);          // a date/time field: show the date
  const n = /^-?\d+(\.\d+)?$/.test(s.trim()) ? parseFloat(s) : NaN;
  return Number.isFinite(n) ? String(Math.round(n * 1e6) / 1e6) : s;
}

/** Control types the Read-only Value control can show (Azure DevOps field types, lower case). */
export const READONLY_CONTROL_TYPES = ["integer", "double", "string", "plaintext", "datetime", "boolean"];

/** The output fields whose current value differs from what the grid and the rules calculate (compared as numbers when both are numbers). */
export function staleOutputs(wanted: Record<string, number | string>, current: Record<string, unknown>): string[] {
  const same = (a: unknown, b: unknown) => {
    const x = a === null || a === undefined ? "" : a, y = b === null || b === undefined ? "" : b;
    if (x === "" || y === "") return x === y;
    if (typeof x !== "object" && typeof y !== "object" && x !== "" && y !== "" && Number.isFinite(Number(x)) && Number.isFinite(Number(y))) return Math.abs(Number(x) - Number(y)) < 1e-6;
    return String(x) === String(y);
  };
  return Object.keys(wanted).filter(f => !same(current[f], wanted[f]));
}
