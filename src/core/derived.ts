import { bucketValue } from "./calc";
import { capacityFor, CapacityRegister, monthKey } from "./capacity";
import { allocKey } from "./allocations";
import { keyNorm } from "./keys";
import { stateOf } from "./review";
import { expandMonths } from "./schedule";
import { aggregate, defaultFor, newId, recomputeAll } from "./gridModel";
import { ColumnDef, GridConfig, GridRow, StatusBand } from "./types";

export { keyNorm };

const isAuto = (c: ColumnDef) => !!c.derive || !!c.lookup || !!c.teamFrom || !!c.formula || !!c.capacity || !!c.teamOf || !!c.others || !!c.statusBands || c.type === "calculated";
const hasManualData = (row: GridRow, cfg: GridConfig) =>
  cfg.columns.some(c => !isAuto(c) && String(row[c.id] ?? "") !== String(defaultFor(c) ?? "") && row[c.id] !== null && row[c.id] !== "");

/** Row property that holds a manual adjustment of a derived (aggregated) column. */
export const adjKey = (colId: string) => `_adj_${colId}`;

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
export function syncDerived(sourceRowsIn: GridRow[], derivedCfg: GridConfig, existing: GridRow[], register?: CapacityRegister, others?: Record<string, number>, sourceCfg?: GridConfig): GridRow[] {
  // a scheduled source grid has one row per task: expand it to one row per person and month (_month, _hours)
  // rejected (or not yet approved) work can be left out of the hours and utilization
  const mode = derivedCfg.derived?.rows ?? "all";
  const counted = mode !== "all" && sourceCfg?.review ? sourceRowsIn.filter(r => { const st = stateOf(r, sourceCfg.review!); return mode === "approved" ? st === "approved" : st !== "rejected"; }) : sourceRowsIn;
  const sourceRows = sourceCfg?.schedule ? expandMonths(counted) : counted;
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
      else {
        row[c.id] = aggregate(members.map(m => m[d.source]), d.aggregate ?? "sum");
        const adj = row[adjKey(c.id)];
        if (d.adjustable && typeof adj === "number") row[c.id] = adj;                    // manual adjustment wins
      }
    }
    fillCapacity(row);
    fillOthers(row);
    fillTeam(row);
  };
  // the person's team from the capacity source (when it could be loaded)
  const fillTeam = (row: GridRow) => {
    if (!register) return;
    for (const c of derivedCfg.columns) if (c.teamOf) row[c.id] = register.resources[keyNorm(row[c.teamOf.resource])]?.team ?? "";
  };
  // hours the same person has on all other Epics that month (from the central allocation store, when it could be loaded)
  const fillOthers = (row: GridRow) => {
    if (!others) return;
    for (const c of derivedCfg.columns) if (c.others) row[c.id] = others[allocKey(row[c.others.resource], row[c.others.period])] ?? 0;
  };
  // Available Capacity comes from the central register (when it could be loaded; otherwise keep what is stored)
  const fillCapacity = (row: GridRow) => {
    if (!register) return;
    for (const c of derivedCfg.columns) if (c.capacity) row[c.id] = capacityFor(register, row[c.capacity.resource], monthKey(row[c.capacity.period]));
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
    fillCapacity(row);
    fillOthers(row);
    fillTeam(row);
    out.push(row);
  }
  const display = (r: GridRow) => keys.map(k => String(r[k.id] ?? "")).join("\u0001");
  out.sort((a, b) => display(a).localeCompare(display(b)));
  return recomputeAll(out, derivedCfg);
}

/** Cheap structural comparison to avoid rewriting an unchanged derived grid. */
export const sameRows = (a: GridRow[], b: GridRow[]) => JSON.stringify(a) === JSON.stringify(b);

/** Standard capacity status: 0-70 Available, >70-90 Near Capacity, >90-100 Fully Allocated, >100 Overallocated. */
export const CAPACITY_BANDS: StatusBand[] = [
  { upTo: 70, label: "Available", color: "green" },
  { upTo: 90, label: "Near Capacity", color: "yellow" },
  { upTo: 100, label: "Fully Allocated", color: "orange" },
  { upTo: null, label: "Overallocated", color: "red" },
];

export const TEAM_FROM_CAPACITY = "@capacity";
export interface CapacityPicks { resource: string; period: string; hours: string; team?: string }

/**
 * Starter columns for a "Resource capacity" derived grid:
 * Resource + Period(month) as keys, Team carried, Hours summed, Available Capacity, "This Epic %" and Over-capacity calculated.
 * (Step D adds Other-Epics hours, Total hours and the all-Epics Utilization %.)
 */
export function capacityTemplate(picks: CapacityPicks, opts: { fromRegister?: boolean } = {}): ColumnDef[] {
  // picks.team === TEAM_FROM_CAPACITY: the person's team comes from the capacity source instead of a source column
  const cols: ColumnDef[] = [
    { id: "resource", name: "Resource", type: "string", derive: { role: "key", source: picks.resource }, width: 220 },
    { id: "period", name: "Period", type: "string", derive: { role: "key", source: picks.period, bucket: "month" } },
  ];
  if (picks.team === TEAM_FROM_CAPACITY) cols.push({ id: "team", name: "Team", type: "string", teamOf: { resource: "resource" } });
  else if (picks.team) cols.push({ id: "team", name: "Team", type: "string", derive: { role: "first", source: picks.team } });
  cols.push(
    { id: "hours", name: "Hours (this Epic)", type: "number", derive: { role: "agg", source: picks.hours, aggregate: "sum", ...(picks.hours === "_hours" ? { adjustable: true } : {}) }, total: "sum" },
    { id: "otherhours", name: "Hours (other Epics)", type: "number", defaultValue: 0, others: { resource: "resource", period: "period" } },
    { id: "totalhours", name: "Total hours", type: "calculated", formula: "hours + otherhours", decimals: 2, onEmpty: "zero" },
    opts.fromRegister
      ? { id: "capacity", name: "Available Capacity", type: "number", capacity: { resource: "resource", period: "period" }, total: "sum" }
      : { id: "capacity", name: "Available Capacity", type: "number", min: 0, defaultValue: 160, total: "sum" },
    { id: "utilization", name: "Utilization % (all Epics)", type: "calculated", formula: "totalhours / capacity * 100", decimals: 1, onEmpty: "blank", onDivZero: "blank", colorBy: "capacitystatus" },
    { id: "capacitystatus", name: "Capacity Status", type: "string", statusBands: { source: "utilization", ranges: CAPACITY_BANDS } },
    { id: "epicshare", name: "This Epic % of capacity", type: "calculated", formula: "hours / capacity * 100", decimals: 1, onEmpty: "blank", onDivZero: "blank" },
    { id: "overcapacity", name: "Over capacity", type: "calculated", formula: 'IF(capacity = 0, IF(totalhours > 0, "Yes", "No"), IF(utilization > 100, "Yes", "No"))', onEmpty: "blank" },
  );
  return cols;
}

/** Which columns of the capacity template publish hours to the central store. */
export const capacityAllocation = () => ({ resource: "resource", period: "period", hours: "hours" });

/** The status column of the capacity template that colours each resource's whole row. */
export const CAPACITY_ROW_COLOR = "capacitystatus";

/** The source rows (one per person and month for a scheduled source) that make up a derived row. */
export function sourceMembers(sourceRowsIn: GridRow[], derivedCfg: GridConfig, row: GridRow, sourceCfg?: GridConfig): GridRow[] {
  const sourceRows = sourceCfg?.schedule ? expandMonths(sourceRowsIn) : sourceRowsIn;
  const keys = keyColumns(derivedCfg);
  const target = keyOfDerived(row, keys);
  return sourceRows.filter(r => keyOfSource(r, keys) === target);
}
