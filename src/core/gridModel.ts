import { evaluate } from "./expr";
import { Aggregate, ColumnDef, GridConfig, GridRow } from "./types";

let seq = 0;
export const newId = () => `r${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const decodeEntities = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ");

/**
 * Parse the stored field value. Accepts: plain JSON, `{version,rows}`, a bare array
 * (format of the older "Data Table" extension) and HTML-wrapped JSON (HTML fields).
 */
export function parseStored(raw: unknown, cfg: GridConfig): GridRow[] {
  if (raw === null || raw === undefined) return [];
  let text = String(raw).trim();
  if (!text) return [];
  if (text.startsWith("<")) text = decodeEntities(text.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).trim();
  let data: unknown;
  try { data = JSON.parse(text); } catch { return []; }
  const arr = Array.isArray(data) ? data : Array.isArray((data as { rows?: unknown }).rows) ? (data as { rows: unknown[] }).rows : [];
  return arr.filter(r => r && typeof r === "object").map(r => normalizeRow(r as Record<string, unknown>, cfg));
}

export function serialize(rows: GridRow[]): string {
  return JSON.stringify({ version: 1, rows });
}

export function defaultFor(col: ColumnDef): unknown {
  if (col.defaultValue !== undefined) return coerce(col, col.defaultValue);
  switch (col.type) {
    case "number": return null;
    case "boolean": return false;
    default: return "";
  }
}

export function coerce(col: ColumnDef, v: unknown): unknown {
  switch (col.type) {
    case "number": {
      if (v === "" || v === null || v === undefined) return null;
      const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
      return Number.isFinite(n) ? n : null;
    }
    case "boolean":
      if (typeof v === "boolean") return v;
      return ["true", "yes", "y", "1", "x"].includes(String(v ?? "").trim().toLowerCase());
    case "date": {
      if (!v) return "";
      if (v instanceof Date) return isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
      const s = String(v).trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
      const d = new Date(s);
      return isNaN(d.getTime()) ? "" : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    }
    default:
      return v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  }
}

export function normalizeRow(src: Record<string, unknown>, cfg: GridConfig): GridRow {
  const row: GridRow = { _id: typeof src._id === "string" ? src._id : newId() };
  if (typeof src._childId === "number") row._childId = src._childId;
  for (const c of cfg.columns) row[c.id] = src[c.id] === undefined ? defaultFor(c) : coerce(c, src[c.id]);
  return recompute(row, cfg);
}

export function newRow(cfg: GridConfig): GridRow {
  const row: GridRow = { _id: newId() };
  for (const c of cfg.columns) row[c.id] = defaultFor(c);
  return recompute(row, cfg);
}

/** Options for a dropdown cell, honouring `dependsOn`. */
export function optionsFor(col: ColumnDef, row: GridRow): string[] {
  if (col.dependsOn) {
    const parent = String(row[col.dependsOn.column] ?? "");
    const mapped = col.dependsOn.map[parent];
    if (mapped) return mapped;
    // parent empty/unmapped -> every possible value, so nothing is hidden
    return Array.from(new Set(Object.values(col.dependsOn.map).flat()));
  }
  return col.options ?? [];
}

/** Recalculate formula columns and clear dependent values that are no longer valid. Mutates & returns row. */
export function recompute(row: GridRow, cfg: GridConfig): GridRow {
  const changed = new Set<string>(); // columns reset or auto-filled during this pass; their dependants must be re-derived
  for (const c of cfg.columns) {
    if (c.dependsOn && c.type === "dropdown") {
      const opts = optionsFor(c, row);
      let v = String(row[c.id] ?? "");
      if (v && (!opts.includes(v) || changed.has(c.dependsOn.column))) { row[c.id] = ""; v = ""; changed.add(c.id); }
      // exactly one valid option for this parent value -> pick it (e.g. Activity -> its default treatment)
      const parent = String(row[c.dependsOn.column] ?? "");
      if (!v && parent && c.dependsOn.map[parent]?.length === 1) { row[c.id] = c.dependsOn.map[parent][0]; changed.add(c.id); }
    }
  }
  // formulas may reference other formulas: iterate a few passes
  const formulas = cfg.columns.filter(c => c.formula);
  for (let pass = 0; pass < Math.min(formulas.length, 5) || pass < 1; pass++) {
    for (const c of formulas) {
      try {
        const val = evaluate(c.formula!, name => {
          const ref = cfg.columns.find(x => x.id === name || x.name === name);
          const raw = ref ? row[ref.id] : "";
          return ref?.type === "number" ? (raw === null ? 0 : (raw as number)) : (raw as string | number | boolean) ?? "";
        });
        row[c.id] = coerce(c, typeof val === "number" ? Math.round(val * 1e8) / 1e8 : val);
      } catch { row[c.id] = null; }
    }
  }
  return row;
}

export function aggregate(values: unknown[], agg: Aggregate): number {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (agg === "count") return values.filter(v => v !== "" && v !== null && v !== undefined && v !== false).length;
  if (!nums.length) return 0;
  switch (agg) {
    case "sum": return round(nums.reduce((a, b) => a + b, 0));
    case "avg": return round(nums.reduce((a, b) => a + b, 0) / nums.length);
    case "min": return Math.min(...nums);
    case "max": return Math.max(...nums);
  }
}
const round = (n: number) => Math.round(n * 1e6) / 1e6;

export function columnTotals(rows: GridRow[], cfg: GridConfig): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of cfg.columns) if (c.total) out[c.id] = aggregate(rows.map(r => r[c.id]), c.total);
  return out;
}

/** field ref name -> value to push to the work item */
export function mappedTotals(rows: GridRow[], cfg: GridConfig): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of cfg.totals ?? []) {
    if (m.field && cfg.columns.some(c => c.id === m.column)) out[m.field] = aggregate(rows.map(r => r[m.column]), m.aggregate);
  }
  return out;
}

export interface CellError { rowId: string; column: string; message: string }

export function validateRows(rows: GridRow[], cfg: GridConfig): CellError[] {
  const errs: CellError[] = [];
  for (const r of rows) for (const c of cfg.columns) {
    const v = r[c.id];
    const empty = v === "" || v === null || v === undefined;
    if (c.required && !c.formula && (empty || (c.type === "boolean" && false))) errs.push({ rowId: r._id, column: c.id, message: `${c.name} is required` });
    if (c.type === "number" && typeof v === "number") {
      if (c.min !== undefined && v < c.min) errs.push({ rowId: r._id, column: c.id, message: `${c.name} must be ≥ ${c.min}` });
      if (c.max !== undefined && v > c.max) errs.push({ rowId: r._id, column: c.id, message: `${c.name} must be ≤ ${c.max}` });
    }
    if (c.type === "dropdown" && !empty && !optionsFor(c, r).includes(String(v)))
      errs.push({ rowId: r._id, column: c.id, message: `${c.name}: '${v}' is not allowed` });
  }
  return errs;
}

export function validateConfig(cfg: GridConfig): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  for (const c of cfg.columns) {
    if (!c.id) errs.push("A column has no id");
    else if (!/^[A-Za-z0-9_]+$/.test(c.id)) errs.push(`Column id '${c.id}' may only contain letters, digits and _`);
    if (ids.has(c.id)) errs.push(`Duplicate column id '${c.id}'`);
    ids.add(c.id);
    if (c.type === "dropdown" && !c.dependsOn && !(c.options && c.options.length)) errs.push(`Dropdown '${c.id}' has no options`);
    if (c.dependsOn && !cfg.columns.some(x => x.id === c.dependsOn!.column)) errs.push(`'${c.id}' depends on unknown column '${c.dependsOn.column}'`);
  }
  for (const t of cfg.totals ?? []) {
    if (!ids.has(t.column)) errs.push(`Total mapping uses unknown column '${t.column}'`);
    if (!t.field) errs.push(`Total mapping for '${t.column}' has no work item field`);
  }
  if (cfg.child?.enabled && !ids.has(cfg.child.titleColumn)) errs.push(`Child title column '${cfg.child.titleColumn}' does not exist`);
  return errs;
}
