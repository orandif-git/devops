import { bucketValue } from "./calc";
import { aggregate, defaultFor, newId, recomputeAll } from "./gridModel";
import { ColumnDef, GridConfig, GridRow } from "./types";

/** Comparable form of a key value: "Aman S <A.M@x.com>" -> "a.m@x.com"; other text -> trimmed lower case. */
export function keyNorm(v: unknown): string {
  const s = String(v ?? "").trim();
  const m = /<([^<>]+)>\s*$/.exec(s);
  return (m ? m[1] : s).trim().toLowerCase();
}

const isAuto = (c: ColumnDef) => !!c.derive || !!c.lookup || !!c.formula || c.type === "calculated";
const hasManualData = (row: GridRow, cfg: GridConfig) =>
  cfg.columns.some(c => !isAuto(c) && String(row[c.id] ?? "") !== String(defaultFor(c) ?? "") && row[c.id] !== null && row[c.id] !== "");

export const keyColumns = (cfg: GridConfig) => cfg.columns.filter(c => c.derive?.role === "key");

const keyOfSource = (row: GridRow, keys: ColumnDef[]) => keys.map(k => keyNorm(bucketValue(row[k.derive!.source], k.derive!.bucket))).join("\u0001");
const keyOfDerived = (row: GridRow, keys: ColumnDef[]) => keys.map(k => keyNorm(row[k.id])).join("\u0001");

/**
 * Build the rows of a derived grid from the rows of its source grid.
 *  - one row per distinct combination of the key columns (e.g. Resource + month)
 *  - key / carried / aggregated columns come from the source and are read-only
 *  - manual columns (e.g. Available Capacity) keep what the user entered, matched by key
 *  - a row whose key is no longer in the source disappears, unless it holds manual data (then it stays, with 0 hours)
 */
export function syncDerived(sourceRows: GridRow[], derivedCfg: GridConfig, existing: GridRow[]): GridRow[] {
  const keys = keyColumns(derivedCfg);
  if (!keys.length) return existing;
  const derivedCols = derivedCfg.columns.filter(c => c.derive);

  const groups = new Map<string, GridRow[]>();
  for (const r of sourceRows) {
    const key = keyOfSource(r, keys);
    if (key.split("\u0001").every(p => p === "")) continue;                       // rows without any key value are ignored
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const old = new Map(existing.map(r => [keyOfDerived(r, keys), r]));

  const fill = (row: GridRow, members: GridRow[]) => {
    for (const c of derivedCols) {
      const d = c.derive!;
      if (d.role === "key") { const first = members.map(m => bucketValue(m[d.source], d.bucket)).find(v => String(v ?? "").trim() !== ""); row[c.id] = first ?? ""; }
      else if (d.role === "first") row[c.id] = members.map(m => m[d.source]).find(v => v !== "" && v !== null && v !== undefined) ?? "";
      else row[c.id] = aggregate(members.map(m => m[d.source]), d.aggregate ?? "sum");
    }
  };

  const out: GridRow[] = [];
  for (const [key, members] of groups) {
    const prev = old.get(key);
    const row: GridRow = prev ? { ...prev } : { _id: newId() };
    if (!prev) for (const c of derivedCfg.columns) row[c.id] = defaultFor(c);
    fill(row, members);
    out.push(row);
  }
  for (const [key, prev] of old) {
    if (groups.has(key) || !hasManualData(prev, derivedCfg)) continue;
    const row = { ...prev };
    for (const c of derivedCols) if (c.derive!.role === "agg") row[c.id] = 0;      // no hours any more, but keep the manual entry
    out.push(row);
  }
  const display = (r: GridRow) => keys.map(k => String(r[k.id] ?? "")).join("\u0001");
  out.sort((a, b) => display(a).localeCompare(display(b)));
  return recomputeAll(out, derivedCfg);
}

/** Cheap structural comparison to avoid rewriting an unchanged derived grid. */
export const sameRows = (a: GridRow[], b: GridRow[]) => JSON.stringify(a) === JSON.stringify(b);

export interface CapacityPicks { resource: string; period: string; hours: string; team?: string }

/**
 * Starter columns for a "Resource capacity" derived grid:
 * Resource + Period(month) as keys, Team carried, Hours summed, Available Capacity, "This Epic %" and Over-capacity calculated.
 * (Step D adds Other-Epics hours, Total hours and the all-Epics Utilization %.)
 */
export function capacityTemplate(picks: CapacityPicks): ColumnDef[] {
  const cols: ColumnDef[] = [
    { id: "resource", name: "Resource", type: "string", derive: { role: "key", source: picks.resource }, width: 220 },
    { id: "period", name: "Period", type: "string", derive: { role: "key", source: picks.period, bucket: "month" } },
  ];
  if (picks.team) cols.push({ id: "team", name: "Team", type: "string", derive: { role: "first", source: picks.team } });
  cols.push(
    { id: "hours", name: "Hours", type: "number", derive: { role: "agg", source: picks.hours, aggregate: "sum" }, total: "sum" },
    { id: "capacity", name: "Available Capacity", type: "number", min: 0, defaultValue: 160, total: "sum" },
    { id: "epicshare", name: "This Epic % of capacity", type: "calculated", formula: "hours / capacity * 100", decimals: 1, onEmpty: "blank", onDivZero: "blank" },
    { id: "overcapacity", name: "Over capacity", type: "calculated", formula: 'IF(epicshare > 100, "Yes", "No")', onEmpty: "blank" },
  );
  return cols;
}
