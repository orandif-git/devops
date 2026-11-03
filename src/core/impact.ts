import { extractRefs } from "./expr";
import { Calculation, ColumnDef, GridConfig } from "./types";

/** What the impact functions need of the project: its grids and calculations. */
export interface ProjectLike { grids: Record<string, GridConfig>; calculations?: Calculation[] }

/** What deleting something takes with it, for the question asked before it is deleted. */
export interface Impact { /** “5 columns”, “2 presets” */ counts: string[]; /** things that use it and would stop working */ usedBy: string[] }

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Derived grids built from this grid, and calculations that read it. */
export function gridImpact(c: ProjectLike, name: string): Impact {
  const g = c.grids[name], usedBy: string[] = [];
  for (const [n, other] of Object.entries(c.grids)) if (n !== name && other.derived && same(other.derived.source, name)) usedBy.push(`derived grid “${n}”`);
  for (const calc of c.calculations ?? []) if (calc.inputs.some(i => (i.source.kind === "grid" || i.source.kind === "top") && same(i.source.grid, name))) usedBy.push(`calculation “${calc.name || calc.id}”`);
  const counts = g ? [plural(g.columns.length, "column"), ...((g.presets ?? []).length ? [plural(g.presets!.length, "preset")] : [])] : [];
  return { counts, usedBy };
}

/** The rows of a preset, and whether it is the preset the grid starts with. */
export function presetImpact(g: GridConfig, presetId: string): { rows: number; isStart: boolean } {
  return { rows: (g.presets ?? []).find(p => p.id === presetId)?.rows.length ?? 0, isStart: !!presetId && g.access?.startPreset === presetId };
}

/** The places a column is used: totals, breakdowns, formulas, calculations, derived grids, approval, schedule, child items. */
export function columnImpact(c: ProjectLike, gridName: string, col: ColumnDef): string[] {
  const g = c.grids[gridName], out: string[] = [];
  if (!g) return out;
  const is = (ref: unknown) => typeof ref === "string" && (ref === col.id || same(ref, col.name));
  (g.totals ?? []).forEach(t => { if (is(t.column)) out.push(`the total “${t.label || `${t.aggregate} of ${col.name}`}”`); });
  (g.breakdowns ?? []).forEach(b => { if (is(b.column) || is(b.by)) out.push(`the breakdown “${b.label || `${b.aggregate} of ${col.name}`}”`); });
  g.columns.forEach(o => {
    if (o.id === col.id) return;
    if (o.formula && extractRefs(o.formula).some(r => is(r))) out.push(`the formula in “${o.name}”`);
    if (o.dependsOn && is(o.dependsOn.column)) out.push(`the dependent list in “${o.name}”`);
    if (o.colorBy && is((o.colorBy as { column?: string }).column)) out.push(`the colours in “${o.name}”`);
  });
  const r = g.review; if (r && [r.statusColumn, r.byColumn, r.atColumn, r.reasonColumn].some(is)) out.push("the approval settings");
  const s = g.schedule; if (s && [s.resource, s.start, s.effort, s.allocation, s.end].some(is)) out.push("the date and effort schedule");
  if (g.child && (is(g.child.titleColumn) || Object.keys(g.child.fieldMap ?? {}).some(is))) out.push("the child work items");
  if (is(g.rowColorBy)) out.push("the row colours");
  if (g.allocation && [g.allocation.resource, g.allocation.period, g.allocation.hours].some(is)) out.push("publishing hours to the Capacity register");
  for (const [n, d] of Object.entries(c.grids)) if (n !== gridName && d.derived && same(d.derived.source, gridName)) d.columns.forEach(dc => { if (dc.derive && is(dc.derive.source)) out.push(`the column “${dc.name}” of derived grid “${n}”`); });
  for (const calc of c.calculations ?? []) if (calc.inputs.some(i => (i.source.kind === "grid" || i.source.kind === "top") && same(i.source.grid, gridName) && is(i.source.column))) out.push(`the calculation “${calc.name || calc.id}”`);
  return Array.from(new Set(out));
}
