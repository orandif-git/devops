import { coerce, defaultFor, newRow, recomputeAll } from "./gridModel";
import { Actor, freshReview, isLocked, reviewColumns } from "./review";
import { ColumnDef, GridConfig, GridPreset, GridRow } from "./types";

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** Columns a preset keeps by default: typed-in values that are the same on every work item (not people, dates or calculated values). */
export function defaultPresetColumns(cfg: GridConfig): string[] {
  const sc = cfg.schedule;
  const skip = new Set([sc?.resource, sc?.start, sc?.end, sc?.allocation, ...(cfg.review ? reviewColumns(cfg.review) : [])].filter(Boolean) as string[]);
  const auto = (c: ColumnDef) => !!c.lookup || !!c.teamFrom || !!c.formula || !!c.statusBands || !!c.derive || !!c.capacity || !!c.others || !!c.teamOf || c.type === "calculated";
  return cfg.columns.filter(c => !auto(c) && c.type !== "identity" && c.type !== "date" && !skip.has(c.id)).map(c => c.id);
}

/** Does the preset apply to this work item? `getField` returns the work item's current value of a field. */
export const presetApplies = (p: GridPreset, getField: (field: string) => unknown): boolean =>
  (p.when ?? []).filter(w => w.field).every(w => w.values.some(v => norm(v) === norm(getField(w.field))));

/** Fresh grid rows from a preset: only the kept columns are filled, everything else gets its default and is recalculated. */
export function presetRows(p: GridPreset, cfg: GridConfig): GridRow[] {
  const ids = new Set(p.columns);
  const rows = (p.rows ?? []).map(src => {
    const row = newRow(cfg);
    for (const c of cfg.columns) if (ids.has(c.id) && src[c.id] !== undefined) row[c.id] = coerce(c, src[c.id]);
    return row;
  });
  // a preset can never hand out approved rows
  return recomputeAll(cfg.review ? rows.map(r => freshReview(r, cfg.review!)) : rows, cfg);
}

export interface MergeResult { rows: GridRow[]; added: number; skipped: number }

/**
 * Load a preset into the grid. "replace" starts from the preset alone; "add" appends, skipping preset rows that are already
 * there (same values in all the columns the preset keeps, so a row the user has since filled in further still counts).
 */
export function mergePreset(existing: GridRow[], p: GridPreset, cfg: GridConfig, mode: "add" | "replace", actor?: Actor): MergeResult {
  const fresh = presetRows(p, cfg);
  if (mode === "replace") {
    // locked (approved) rows cannot be removed by replacing; they stay for everyone but administrators
    const keep = existing.filter(r => isLocked(r, cfg, actor));
    return { rows: recomputeAll([...keep, ...fresh], cfg), added: fresh.length, skipped: 0 };
  }
  const key = (r: GridRow) => p.columns.map(id => norm(r[id])).join("\u0001");
  const have = new Map<string, number>();
  for (const r of existing) have.set(key(r), (have.get(key(r)) ?? 0) + 1);
  const add: GridRow[] = [];
  for (const r of fresh) {
    const k = key(r);
    const n = have.get(k) ?? 0;
    if (n > 0) have.set(k, n - 1);                    // each existing row can cover one preset row, so a preset may legitimately repeat a row
    else add.push(r);
  }
  return { rows: recomputeAll([...existing, ...add], cfg), added: add.length, skipped: fresh.length - add.length };
}

/** A preset made from the rows currently in a grid. */
export function presetFromRows(rows: GridRow[], cfg: GridConfig, name: string, wanted: string[] = defaultPresetColumns(cfg)): GridPreset {
  const columns = wanted.filter(id => cfg.columns.some(c => c.id === id));          // a column removed since the preset was saved is dropped
  return {
    id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name: name.trim(),
    columns,
    rows: rows.map(r => Object.fromEntries(columns.map(id => [id, r[id] === undefined ? defaultFor(cfg.columns.find(c => c.id === id)!) : r[id]]))),
  };
}

/** Replace a preset of the same name, or append. */
export const upsertPreset = (list: GridPreset[] | undefined, p: GridPreset): GridPreset[] => {
  const all = list ?? [];
  const i = all.findIndex(x => norm(x.name) === norm(p.name));
  return i < 0 ? [...all, p] : all.map((x, j) => (j === i ? { ...p, id: x.id, when: x.when } : x));
};
