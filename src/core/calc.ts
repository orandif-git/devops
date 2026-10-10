import { evaluate, EvalAbort, extractRefs } from "./expr";
import { aggregate, parseStored } from "./gridModel";
import { CalcInput, Calculation, GridConfig, GridRow, RowFilter } from "./types";

/** Value of an input: a number, text, or null when empty. */
export type InputValue = number | string | null;
export type CalcResult = { value: number | string | null; reason?: string };

const isEmptyRaw = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/** Numbers stay numbers, numeric strings become numbers, identity objects become their name. */
export function toInputValue(v: unknown): InputValue {
  if (isEmptyRaw(v)) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "object") return String((v as { displayName?: string }).displayName ?? "") || null;
  const s = String(v).trim();
  return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(s.replace(/,/g, "")) ? parseFloat(s.replace(/,/g, "")) : s;
}

export const rowMatchesAll = (row: GridRow, filters?: RowFilter[]) =>
  !filters?.length || filters.every(f => !f.column || !f.values.length || f.values.some(v => String(row[f.column] ?? "").trim().toLowerCase() === v.trim().toLowerCase()));

/** Figure from grid rows. Empty sets: sum/count are 0, avg/min/max have no value. */
export function gridFigure(rows: GridRow[], src: Extract<CalcInput["source"], { kind: "grid" }>): InputValue {
  const hit = rows.filter(r => rowMatchesAll(r, src.where));
  if (!hit.length && !["sum", "count"].includes(src.aggregate)) return null;
  return aggregate(hit.map(r => r[src.column]), src.aggregate);
}

type TopSource = Extract<CalcInput["source"], { kind: "top" }>;

/** "2026-03-14" -> "2026-03" / "2026-Q1" / "2026" depending on the bucket; other values unchanged. */
export function bucketValue(v: unknown, bucket: TopSource["bucket"]): string {
  const s = String(v ?? "").trim();
  const m = /^(\d{4})-(\d{2})/.exec(s);
  if (!m || !bucket || bucket === "day") return s;
  if (bucket === "year") return m[1];
  if (bucket === "month") return `${m[1]}-${m[2]}`;
  return `${m[1]}-Q${Math.ceil(parseInt(m[2], 10) / 3)}`;
}

/**
 * Group with the highest (or lowest) aggregate. Ties go to the alphabetically first group so the result
 * does not depend on row order. Nothing to rank (no rows, or a "max" of 0) gives no value.
 */
export function topGroup(rows: GridRow[], src: TopSource): InputValue {
  const hit = rows.filter(r => rowMatchesAll(r, src.where) && String(r[src.groupBy] ?? "").trim() !== "");
  if (!hit.length) return null;
  const groups = new Map<string, unknown[]>();
  for (const r of hit) {
    const key = bucketValue(r[src.groupBy], src.bucket);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r[src.column]);
  }
  const scored = Array.from(groups, ([group, vals]) => ({ group, value: aggregate(vals, src.aggregate) }));
  if (!scored.length) return null;
  const min = src.pick === "min";
  scored.sort((a, b) => (min ? a.value - b.value : b.value - a.value) || a.group.localeCompare(b.group));
  const best = scored[0];
  if (!min && best.value <= 0) return null;
  return src.return === "value" ? best.value : best.group;
}

export interface Sources {
  getField(refName: string): unknown;
  getRows(gridName: string): GridRow[];
}

export function resolveInputs(calc: Calculation, src: Sources): Record<string, InputValue> {
  const out: Record<string, InputValue> = {};
  for (const i of calc.inputs) {
    out[i.name] = i.source.kind === "field" ? toInputValue(src.getField(i.source.field))
      : i.source.kind === "top" ? topGroup(src.getRows(i.source.grid), i.source)
      : gridFigure(src.getRows(i.source.grid), i.source);
  }
  return out;
}

/** Evaluate a calculation from already-resolved input values (also used by the hub's Test panel). */
export function compute(calc: Calculation, values: Record<string, InputValue>): CalcResult {
  const byName = new Map(calc.inputs.map(i => [i.name.toLowerCase(), i]));
  try {
    const raw = evaluate(calc.formula, name => {
      const input = byName.get(name.toLowerCase());
      if (!input) throw new EvalAbort(`unknown variable '${name}'`);
      const v = values[input.name];
      if (v === null || v === undefined) {
        const h = input.onEmpty && input.onEmpty !== "inherit" ? input.onEmpty : calc.onEmpty;
        if (h === "zero") return 0;
        throw new EvalAbort(`'${input.name}' has no value`);
      }
      return v;
    }, { strictDiv: calc.onDivZero === "blank" });
    if (typeof raw === "number") {
      if (!Number.isFinite(raw)) return { value: null, reason: "result is not a number" };
      const f = Math.pow(10, calc.decimals ?? 2);
      return { value: Math.round(raw * f) / f };
    }
    return { value: typeof raw === "boolean" ? (raw ? 1 : 0) : raw };
  } catch (e) {
    if (e instanceof EvalAbort) return { value: null, reason: e.message };
    return { value: null, reason: (e as Error).message };
  }
}

export const calcApplies = (c: Calculation, workItemType: string) => c.enabled && (!c.workItemTypes.length || c.workItemTypes.includes(workItemType));

/** Which fields and grids a set of calculations reads / writes (for fetching form values). */
export function calcRefs(calcs: Calculation[], grids: Record<string, GridConfig>) {
  const fields = new Set<string>();
  for (const c of calcs) {
    fields.add(c.resultField);
    for (const i of c.inputs) {
      if (i.source.kind === "field") fields.add(i.source.field);
      else { const dataField = grids[i.source.grid]?.dataField; if (dataField) fields.add(dataField); }
    }
  }
  return Array.from(fields).filter(Boolean);
}

/** Order so a calculation runs after the ones whose result it reads. Returns cyclic ones separately. */
export function orderCalculations(calcs: Calculation[]): { ordered: Calculation[]; cyclic: Calculation[] } {
  const byResult = new Map(calcs.map(c => [c.resultField, c]));
  const deps = (c: Calculation) => c.inputs.flatMap(i => (i.source.kind === "field" && byResult.has(i.source.field) && i.source.field !== c.resultField ? [byResult.get(i.source.field)!] : []));
  const ordered: Calculation[] = [], state = new Map<Calculation, 1 | 2>(), cyclic = new Set<Calculation>();
  const visit = (c: Calculation) => {
    if (state.get(c) === 2) return;
    if (state.get(c) === 1) { cyclic.add(c); return; }
    state.set(c, 1);
    deps(c).forEach(visit);
    state.set(c, 2);
    ordered.push(c);
  };
  calcs.forEach(visit);
  // a calculation that reads its own result is cyclic too
  calcs.forEach(c => { if (c.inputs.some(i => i.source.kind === "field" && i.source.field === c.resultField)) cyclic.add(c); });
  return { ordered: ordered.filter(c => !cyclic.has(c)), cyclic: Array.from(cyclic) };
}

/**
 * Run all applicable calculations against the current form state.
 * Returns only the fields whose value must change (null = clear the field).
 */
export function evaluateCalculations(
  calcs: Calculation[], workItemType: string,
  getField: (ref: string) => unknown, grids: Record<string, GridConfig>,
): { changes: Record<string, number | string | null>; notes: string[] } {
  const live = calcs.filter(c => calcApplies(c, workItemType) && c.resultField && c.formula.trim());
  const { ordered } = orderCalculations(live);
  const overlay: Record<string, unknown> = {};
  const changes: Record<string, number | string | null> = {};
  const notes: string[] = [];
  const get = (ref: string) => (ref in overlay ? overlay[ref] : getField(ref));
  const rowsCache = new Map<string, GridRow[]>();
  const getRows = (name: string) => {
    if (!rowsCache.has(name)) { const g = grids[name]; rowsCache.set(name, g?.dataField ? parseStored(get(g.dataField), g) : []); }
    return rowsCache.get(name)!;
  };
  for (const c of ordered) {
    const current = get(c.resultField);
    if (c.mode === "whenEmpty" && !isEmptyRaw(current)) continue;
    const res = compute(c, resolveInputs(c, { getField: get, getRows }));
    if (res.reason) notes.push(`${c.name}: ${res.reason}`);
    const next = res.value;
    const same = next === null ? isEmptyRaw(current) : typeof next === "number" ? Number(current) === next && !isEmptyRaw(current) : String(current ?? "") === next;
    overlay[c.resultField] = next;
    if (!same) changes[c.resultField] = next;
  }
  return { changes, notes };
}

/** What a calculation would do on a work item, step by step (used by the hub's "Try on a real work item"). */
export interface Explanation {
  inputs: { name: string; source: string; value: InputValue }[];
  grids: { name: string; dataField?: string; rows: number; raw: "empty" | "unreadable" | "ok" }[];
  result: CalcResult;
  current: unknown;
}

export function explainCalculation(calc: Calculation, getField: (ref: string) => unknown, grids: Record<string, GridConfig>): Explanation {
  const rowsCache = new Map<string, GridRow[]>();
  const getRows = (name: string) => {
    if (!rowsCache.has(name)) { const g = grids[name]; rowsCache.set(name, g?.dataField ? parseStored(getField(g.dataField), g) : []); }
    return rowsCache.get(name)!;
  };
  const values = resolveInputs(calc, { getField, getRows });
  const used = Array.from(new Set(calc.inputs.flatMap(i => (i.source.kind === "field" ? [] : [i.source.grid]))));
  return {
    inputs: calc.inputs.map(i => ({
      name: i.name, value: values[i.name],
      source: i.source.kind === "field" ? `field ${i.source.field}`
        : i.source.kind === "top" ? `${i.source.pick === "min" ? "lowest" : "highest"} ${i.source.groupBy} by ${i.source.aggregate} of ${i.source.column} in ${i.source.grid}`
        : `${i.source.aggregate} of ${i.source.column} in ${i.source.grid}${i.source.where?.length ? " where " + i.source.where.map(w => `${w.column} in [${w.values.join(", ")}]`).join(" and ") : ""}`,
    })),
    grids: used.map(name => {
      const g = grids[name]; const raw = g?.dataField ? getField(g.dataField) : undefined;
      const rows = getRows(name).length;
      const text = raw === null || raw === undefined ? "" : String(raw).trim();
      return { name, dataField: g?.dataField, rows, raw: !text ? "empty" as const : rows ? "ok" as const : "unreadable" as const };
    }),
    result: compute(calc, values),
    current: getField(calc.resultField),
  };
}

/** Variable names a formula uses that are not defined as inputs. */
export const undefinedVariables = (c: Calculation) => {
  const names = new Set(c.inputs.map(i => i.name.toLowerCase()));
  try { return extractRefs(c.formula).filter(r => !names.has(r.toLowerCase())); } catch { return []; }
};
