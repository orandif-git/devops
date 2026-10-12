import { ColumnDef, GridConfig } from "./types";

/** A row colour or "coloured like" setting that points at a column that is no longer a status column is cleared. */
export function dropDanglingColorRefs(g: GridConfig): GridConfig {
  const status = new Set(g.columns.filter(c => c.statusBands).map(c => c.id));
  const badRow = !!g.rowColorBy && !status.has(g.rowColorBy);
  const badCols = g.columns.some(c => c.colorBy && !status.has(c.colorBy));
  if (!badRow && !badCols) return g;
  return { ...g, rowColorBy: badRow ? undefined : g.rowColorBy, columns: g.columns.map(c => (c.colorBy && !status.has(c.colorBy) ? { ...c, colorBy: undefined } : c)) };
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Rename a column id and every setting of the same grid that points at it (formulas, lookups, status, totals, schedule, review,
 * presets …). Rows already saved on work items keep the old id, and calculations in other places must be re-pointed by hand.
 */
export function renameColumn(g: GridConfig, from: string, to: string): GridConfig {
  if (!to || from === to || g.columns.some(c => c.id === to) || !g.columns.some(c => c.id === from)) return g;
  const m = (id: string | undefined) => (id === from ? to : id);
  const mm = (id: string) => (id === from ? to : id);
  const word = new RegExp(`(?<![A-Za-z0-9_])${esc(from)}(?![A-Za-z0-9_])`, "g");
  const columns: ColumnDef[] = g.columns.map(c => {
    const n: ColumnDef = { ...c, id: mm(c.id) };
    if (c.formula) n.formula = c.formula.replace(word, to);
    if (c.lookup) n.lookup = { ...c.lookup, column: mm(c.lookup.column) };
    if (c.dependsOn) n.dependsOn = { ...c.dependsOn, column: mm(c.dependsOn.column) };
    if (c.statusBands) n.statusBands = { ...c.statusBands, source: mm(c.statusBands.source) };
    if (c.colorBy) n.colorBy = mm(c.colorBy);
    if (c.overrides) n.overrides = c.overrides.map(o => ({ ...o, when: mm(o.when) }));
    if (c.capacity) n.capacity = { resource: mm(c.capacity.resource), period: mm(c.capacity.period) };
    if (c.others) n.others = { resource: mm(c.others.resource), period: mm(c.others.period) };
    if (c.teamOf) n.teamOf = { resource: mm(c.teamOf.resource) };
    return n;
  });
  const out: GridConfig = { ...g, columns };
  if (g.rowColorBy) out.rowColorBy = m(g.rowColorBy);
  if (g.totals) out.totals = g.totals.map(t => ({ ...t, column: mm(t.column), ...(t.where ? { where: { ...t.where, column: mm(t.where.column) } } : {}) }));
  if (g.breakdowns) out.breakdowns = g.breakdowns.map(b => ({ ...b, by: mm(b.by), column: mm(b.column) }));
  if (g.child) out.child = { ...g.child, titleColumn: mm(g.child.titleColumn), fieldMap: Object.fromEntries(Object.entries(g.child.fieldMap ?? {}).map(([k, v]) => [mm(k), v])) };
  if (g.schedule) out.schedule = { resource: mm(g.schedule.resource), start: mm(g.schedule.start), effort: mm(g.schedule.effort), allocation: m(g.schedule.allocation), end: mm(g.schedule.end) };
  if (g.allocation) out.allocation = { resource: mm(g.allocation.resource), period: mm(g.allocation.period), hours: mm(g.allocation.hours) };
  if (g.review) out.review = { ...g.review, statusColumn: mm(g.review.statusColumn), byColumn: m(g.review.byColumn), atColumn: m(g.review.atColumn), reasonColumn: m(g.review.reasonColumn), approvers: g.review.approvers.map(a => (a.when ? { ...a, when: { ...a.when, column: mm(a.when.column) } } : a)) };
  if (g.presets) out.presets = g.presets.map(p => ({ ...p, columns: p.columns.map(mm), rows: p.rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [mm(k), v]))) }));
  return out;
}

/** After renaming a column of grid `name`, derived grids built from it keep reading it. */
export function renameInDerivedGrids(grids: Record<string, GridConfig>, name: string, from: string, to: string): Record<string, GridConfig> {
  return Object.fromEntries(Object.entries(grids).map(([n, g]) => [n, g.derived?.source === name ? { ...g, columns: g.columns.map(c => (c.derive?.source === from ? { ...c, derive: { ...c.derive, source: to } } : c)) } : g]));
}
