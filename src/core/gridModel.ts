import { COLUMN_FUNCS, evaluate, EvalAbort } from "./expr";
import { applySchedule } from "./schedule";
import { parseNumber } from "./number";
import { ensureStatus } from "./review";
import { Aggregate, ColumnDef, GridConfig, GridRow, RowFilter, StatusBand } from "./types";

let seq = 0;
export const newId = () => `r${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const NAMED: Record<string, string> = { quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", amp: "&" };
/** Decode HTML entities (named + numeric) in a single pass, so `&amp;lt;` becomes `&lt;` and not `<`. */
const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return NAMED[e.toLowerCase()] ?? m;
  });

/** Try to turn whatever the field returned into JSON text (plain, or mangled by a rich-text field). */
export function extractJson(raw: string): unknown {
  // plain JSON is by far the most common case: try it before any clean-up
  try { return JSON.parse(raw.trim()); } catch { /* maybe wrapped by a rich-text field */ }
  const variants = [
    // rich-text field: <div>…</div>, <br>, &quot; … ; remove tags first, then entities (tag pattern cannot backtrack: linear time)
    () => decodeEntities(raw.replace(/<br\s*\/?>/gi, " ").replace(/<\/(div|p)>\s*<(div|p)[^<>]*>/gi, " ").replace(/<[^<>]*>/g, "")).replace(/\u00a0/g, " "),
    () => decodeEntities(raw).replace(/\u00a0/g, " "),                    // value that was only entity-encoded
  ];
  for (const make of [() => raw, ...variants]) {
    const text = make().trim();
    try { return JSON.parse(text); } catch { /* try the outermost {...} / [...] */ }
    for (const [o, c] of [["{", "}"], ["[", "]"]] as const) {
      const i = text.indexOf(o), j = text.lastIndexOf(c);
      if (i >= 0 && j > i) { try { return JSON.parse(text.slice(i, j + 1)); } catch { /* next */ } }
    }
  }
  throw new Error("unreadable");
}

/**
 * Parse the stored field value. Accepts: plain JSON, `{version,rows}`, a bare array
 * (format of the older "Data Table" extension) and HTML-wrapped / entity-encoded JSON (rich-text fields).
 */
export function parseStored(raw: unknown, cfg: GridConfig): GridRow[] {
  if (raw === null || raw === undefined) return [];
  const text = String(raw).trim();
  if (!text) return [];
  let data: unknown;
  try { data = extractJson(text); } catch { return []; }
  const arr = Array.isArray(data) ? data : Array.isArray((data as { rows?: unknown })?.rows) ? (data as { rows: unknown[] }).rows : [];
  return recomputeAll(arr.filter(r => r && typeof r === "object").map(r => normalizeRow(r as Record<string, unknown>, cfg)), cfg);
}

/** JSON with `<`, `>` and `&` escaped, so an HTML field cannot treat parts of it as tags or entities. */
export function serialize(rows: GridRow[]): string {
  return serializeJson({ version: 1, rows });
}

/** Any JSON value as text that survives HTML-ish fields (`<`, `>`, `&` escaped). */
export function serializeJson(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
}

/** An empty "up to" (null, missing or not a number) means: no upper limit. */
export const isNoLimit = (v: unknown) => v === null || v === undefined || v === "" || (typeof v === "number" && Number.isNaN(v));

/** Band for a number: first range with value <= upTo (null upTo = no limit). Empty / non-numeric values have no band. */
export function bandFor(value: unknown, ranges: StatusBand[]): StatusBand | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  if (!Number.isFinite(n)) return undefined;
  return ranges.find(r => isNoLimit(r.upTo) || n <= (r.upTo as number));
}

/** Band currently applying to a cell that is coloured by a status column (colorBy). */
export function cellBand(col: ColumnDef, row: GridRow, cfg: GridConfig): StatusBand | undefined {
  const ownRanges = col.statusBands?.ranges;
  if (ownRanges) return ownRanges.find(r => r.label === row[col.id]);
  const by = col.colorBy ? cfg.columns.find(c => c.id === col.colorBy) : undefined;
  return by?.statusBands ? by.statusBands.ranges.find(r => r.label === row[by.id]) : undefined;
}

export function defaultFor(col: ColumnDef): unknown {
  if (col.statusBands) return "";
  if (col.type === "calculated") return null;
  if (col.defaultValue !== undefined) return coerce(col, col.defaultValue);
  switch (col.type) {
    case "number": return null;
    case "boolean": return false;
    default: return "";
  }
}

export function coerce(col: ColumnDef, v: unknown): unknown {
  switch (col.type) {
    case "calculated": return typeof v === "number" || typeof v === "string" ? v : null;
    case "number": {
      if (v === "" || v === null || v === undefined) return null;
      const n = typeof v === "number" ? v : parseNumber(String(v));
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
  for (const k of Object.keys(src)) if (k.startsWith("_adj_") && typeof src[k] === "number") row[k] = src[k];   // manual adjustments of derived columns
  if (cfg.schedule) {                                                      // calculated by the calendar; kept until it is recalculated
    if (src._months && typeof src._months === "object") row._months = src._months as Record<string, number>;
    if (typeof src._schedErr === "string") row._schedErr = src._schedErr;
    if (typeof src._schedNote === "string") row._schedNote = src._schedNote;
    if (typeof src._schedFor === "string") row._schedFor = src._schedFor;
  }
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

const isTicked = (v: unknown) => v === true || v === 1 || (typeof v === "string" && v.toLowerCase() === "true");

/** Recalculate formula columns and clear dependent values that are no longer valid. Mutates & returns row. */
export function recompute(row: GridRow, cfg: GridConfig, rows?: GridRow[]): GridRow {
  const changed = new Set<string>(); // columns reset or auto-filled during this pass; their dependants must be re-derived
  for (const c of cfg.columns) {
    if (c.lookup) {
      const src = String(row[c.lookup.column] ?? "");
      const key = Object.keys(c.lookup.map).find(k => k.toLowerCase() === src.toLowerCase());
      const hit = c.overrides?.find(o => isTicked(row[o.when]));
      row[c.id] = coerce(c, hit ? hit.value : key !== undefined ? c.lookup.map[key] : c.lookup.fallback ?? "");
      continue;
    }
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
  const scope = rows ?? [row];
  for (let pass = 0; pass < Math.min(formulas.length, 5) || pass < 1; pass++) {
    for (const c of formulas) {
      const strict = c.type === "calculated";                     // calculated columns: blank on missing input / division by zero (configurable)
      try {
        const val = evaluate(c.formula!, name => {
          if (name[0] === "@") {                                   // TOTAL([col]) & co.
            const [fn, colName] = name.slice(1).split(":");
            const col = cfg.columns.find(x => x.id === colName || x.name === colName);
            if (!col) throw new EvalAbort(`unknown column '${colName}'`);
            return columnAggregate(fn, scope.map(r => r[col.id]));
          }
          const ref = cfg.columns.find(x => x.id === name || x.name === name);
          if (!ref && strict) throw new EvalAbort(`unknown column '${name}'`);
          const raw = ref ? row[ref.id] : "";
          if (ref?.type === "number" || ref?.type === "calculated") {
            if (raw === null || raw === undefined || raw === "") { if (strict && (c.onEmpty ?? "blank") === "blank") throw new EvalAbort(`'${ref.name}' is empty`); return 0; }
            return raw as number | string;
          }
          return (raw as string | number | boolean) ?? "";
        }, { strictDiv: strict && (c.onDivZero ?? "blank") === "blank" });
        if (strict) {
          const f = Math.pow(10, c.decimals ?? 2);
          row[c.id] = typeof val === "number" ? (Number.isFinite(val) ? Math.round(val * f) / f : null) : typeof val === "boolean" ? (val ? 1 : 0) : String(val);
        } else row[c.id] = coerce(c, typeof val === "number" ? Math.round(val * 1e8) / 1e8 : val);
      } catch { row[c.id] = null; }
    }
  }
  if (cfg.schedule) applySchedule(row, cfg.schedule);
  if (cfg.review) ensureStatus(row, cfg.review);
  // status columns (e.g. Capacity Status) depend on the final numbers, so they are set last
  for (const c of cfg.columns) {
    if (!c.statusBands) continue;
    const src = cfg.columns.find(x => x.id === c.statusBands!.source);
    row[c.id] = src ? bandFor(row[src.id], c.statusBands.ranges)?.label ?? "" : "";
  }
  return row;
}

function columnAggregate(fn: string, values: unknown[]): number {
  const map: Record<string, Aggregate> = { TOTAL: "sum", COLAVG: "avg", COLMAX: "max", COLMIN: "min", COLCOUNT: "count" };
  return COLUMN_FUNCS.includes(fn) ? aggregate(values, map[fn]) : 0;
}

/** Recompute every row (formulas can use whole-column functions, so rows depend on each other). Returns new row objects. */
export function recomputeAll(rows: GridRow[], cfg: GridConfig): GridRow[] {
  if (!cfg.columns.some(c => c.formula || c.lookup || c.dependsOn || c.statusBands) && !cfg.schedule && !cfg.review) return rows;
  let out = rows.map(r => ({ ...r }));
  const usesColumnFuncs = cfg.columns.some(c => c.formula && COLUMN_FUNCS.some(f => new RegExp(`\\b${f}\\s*\\(`, "i").test(c.formula!)));
  for (let pass = 0; pass < (usesColumnFuncs ? 2 : 1); pass++) { out = out.map(r => recompute({ ...r }, cfg, out)); }
  return out;
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

export const rowMatches = (row: GridRow, w?: RowFilter) =>
  !w || !w.column || w.values.some(v => String(row[w.column] ?? "").toLowerCase() === v.toLowerCase());

/** field ref name -> value to push to the work item */
export function mappedTotals(rows: GridRow[], cfg: GridConfig): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of cfg.totals ?? []) {
    if (m.field && cfg.columns.some(c => c.id === m.column))
      out[m.field] = aggregate(rows.filter(r => rowMatches(r, m.where)).map(r => r[m.column]), m.aggregate);
  }
  // breakdown groups mapped to fields: one field per group value; absent groups are written as 0
  for (const b of cfg.breakdowns ?? []) {
    if (!cfg.columns.some(c => c.id === b.column) || !cfg.columns.some(c => c.id === b.by)) continue;
    for (const [group, field] of Object.entries(b.fields ?? {})) {
      if (!field) continue;
      out[field] = aggregate(rows.filter(r => String(r[b.by] ?? "").trim().toLowerCase() === group.toLowerCase()).map(r => r[b.column]), b.aggregate);
    }
  }
  return out;
}

export interface SummaryLine { label: string; value: number; field?: string }
export interface SummaryGroup { title: string; lines: SummaryLine[] }

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Figures shown under the grid: mapped totals (with their group filter) and per-value breakdowns. */
export function summaries(rows: GridRow[], cfg: GridConfig): { mapped: SummaryLine[]; groups: SummaryGroup[] } {
  const name = (id: string) => cfg.columns.find(c => c.id === id)?.name ?? id;
  const mapped = (cfg.totals ?? []).filter(m => cfg.columns.some(c => c.id === m.column)).map(m => ({
    label: m.label || `${cap(m.aggregate)} of ${name(m.column)}${m.where?.values.length ? ` (${m.where.values.join(" / ")})` : ""}`,
    value: aggregate(rows.filter(r => rowMatches(r, m.where)).map(r => r[m.column]), m.aggregate),
    field: m.field,
  }));
  const groups = (cfg.breakdowns ?? []).filter(b => cfg.columns.some(c => c.id === b.by) && cfg.columns.some(c => c.id === b.column)).map(b => {
    const keys = Array.from(new Set(rows.map(r => String(r[b.by] ?? "").trim()).filter(Boolean)));
    return {
      title: b.label || `${cap(b.aggregate)} of ${name(b.column)} by ${name(b.by)}`,
      lines: keys.map(k => ({ label: k, value: aggregate(rows.filter(r => String(r[b.by] ?? "").trim() === k).map(r => r[b.column]), b.aggregate), field: Object.entries(b.fields ?? {}).find(([g]) => g.toLowerCase() === k.toLowerCase())?.[1] })),
    };
  });
  return { mapped, groups };
}

export interface CellError { rowId: string; column: string; message: string }

export function validateRows(rows: GridRow[], cfg: GridConfig): CellError[] {
  const errs: CellError[] = [];
  for (const r of rows) for (const c of cfg.columns) {
    const v = r[c.id];
    const empty = v === "" || v === null || v === undefined;
    if (c.required && !c.formula && !c.lookup && !c.statusBands && (empty || (c.type === "boolean" && false))) errs.push({ rowId: r._id, column: c.id, message: `${c.name} is required` });
    if (c.type === "number" && typeof v === "number") {
      if (c.min !== undefined && v < c.min) errs.push({ rowId: r._id, column: c.id, message: `${c.name} must be ≥ ${c.min}` });
      if (c.max !== undefined && v > c.max) errs.push({ rowId: r._id, column: c.id, message: `${c.name} must be ≤ ${c.max}` });
    }
    if (c.type === "dropdown" && !c.lookup && !c.statusBands && !empty && !optionsFor(c, r).includes(String(v)))
      errs.push({ rowId: r._id, column: c.id, message: `${c.name}: '${v}' is not allowed` });
  }
  const sc = cfg.schedule;
  if (sc) {
    const name = (id: string) => cfg.columns.find(c => c.id === id)?.name ?? id;
    for (const r of rows) {
      const filled = [sc.resource, sc.start, sc.effort].filter(id => { const v = r[id]; return v !== "" && v !== null && v !== undefined; });
      if (filled.length && filled.length < 3) {
        for (const id of [sc.resource, sc.start, sc.effort]) {
          const v = r[id];
          if ((v === "" || v === null || v === undefined) && !errs.some(e => e.rowId === r._id && e.column === id)) errs.push({ rowId: r._id, column: id, message: `${name(id)} is needed to schedule this row` });
        }
      }
      if (sc.allocation && typeof r[sc.allocation] === "number" && (r[sc.allocation] as number) <= 0) errs.push({ rowId: r._id, column: sc.allocation, message: `${name(sc.allocation)} must be above 0` });
      if (typeof r[sc.effort] === "number" && (r[sc.effort] as number) <= 0) errs.push({ rowId: r._id, column: sc.effort, message: `${name(sc.effort)} must be above 0` });
      if (typeof r._schedErr === "string" && r._schedErr) errs.push({ rowId: r._id, column: sc.end, message: r._schedErr });
    }
  }
  return errs;
}

export function validateConfig(cfg: GridConfig): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  if (cfg.rowColorBy && !cfg.columns.some(x => x.id === cfg.rowColorBy && x.statusBands)) errs.push(`Row colour: '${cfg.rowColorBy}' is not a status column`);
  for (const c of cfg.columns) {
    if (!c.id) errs.push("A column has no id");
    else if (!/^[A-Za-z0-9_]+$/.test(c.id)) errs.push(`Column id '${c.id}' may only contain letters, digits and _`);
    else if (/^(__proto__|constructor|prototype)$/.test(c.id) || c.id.startsWith("_")) errs.push(`Column id '${c.id}' is reserved; ids must not start with an underscore`);
    if (ids.has(c.id)) errs.push(`Duplicate column id '${c.id}'`);
    ids.add(c.id);
    if (c.type === "calculated" && !c.formula?.trim()) errs.push(`Calculated column '${c.id}' has no formula`);
    if (c.type === "dropdown" && !c.lookup && !c.dependsOn && !(c.options && c.options.length)) errs.push(`Dropdown '${c.id}' has no options`);
    if (c.statusBands) {
      const sb = c.statusBands;
      if (!cfg.columns.some(x => x.id === sb.source)) errs.push(`'${c.id}': status source column '${sb.source}' does not exist`);
      if (!sb.ranges.length) errs.push(`'${c.id}' has no status ranges`);
      sb.ranges.forEach((r, i) => { if (!r.label.trim()) errs.push(`'${c.id}': range ${i + 1} has no label`); });
      for (let i = 1; i < sb.ranges.length; i++) { const a = sb.ranges[i - 1].upTo, b = sb.ranges[i].upTo; if (isNoLimit(a) || (!isNoLimit(b) && (b as number) <= (a as number))) errs.push(`'${c.id}': ranges must go up (range ${i + 1} should be higher than range ${i}, and only the last one may have no limit)`); }
    }
    if (c.colorBy && !cfg.columns.some(x => x.id === c.colorBy && x.statusBands)) errs.push(`'${c.id}' is coloured by '${c.colorBy}', which is not a status column`);
    if (c.lookup) {
      if (!cfg.columns.some(x => x.id === c.lookup!.column)) errs.push(`'${c.id}' looks up unknown column '${c.lookup.column}'`);
      else if (c.lookup.column === c.id) errs.push(`'${c.id}' cannot look up itself`);
      if (!Object.keys(c.lookup.map).length) errs.push(`'${c.id}' has an empty lookup table`);
      for (const o of c.overrides ?? []) {
        const w = cfg.columns.find(x => x.id === o.when);
        if (!w) errs.push(`'${c.id}' override uses unknown column '${o.when}'`);
        else if (w.type !== "boolean") errs.push(`'${c.id}' override column '${o.when}' must be a checkbox column`);
        if (!String(o.value ?? "").trim()) errs.push(`'${c.id}' override for '${o.when}' has no value`);
      }
    }
    if (c.dependsOn && !cfg.columns.some(x => x.id === c.dependsOn!.column)) errs.push(`'${c.id}' depends on unknown column '${c.dependsOn.column}'`);
  }
  for (const t of cfg.totals ?? []) {
    if (!ids.has(t.column)) errs.push(`Total mapping uses unknown column '${t.column}'`);
    if (!t.field) errs.push(`Total mapping for '${t.column}' has no work item field`);
    if (t.where && (!ids.has(t.where.column) || !t.where.values.length)) errs.push(`Total mapping for '${t.column}': the group filter needs an existing column and at least one value`);
  }
  for (const b of cfg.breakdowns ?? []) if (!ids.has(b.by) || !ids.has(b.column)) errs.push(`Breakdown '${b.label ?? b.by}' uses an unknown column`);
  const used = new Map<string, string>();
  const claim = (field: string, who: string) => { if (!field) return; const prev = used.get(field); if (prev) errs.push(`Field '${field}' is written by both ${prev} and ${who}`); else used.set(field, who); };
  for (const t of cfg.totals ?? []) claim(t.field, `total of '${t.column}'`);
  for (const b of cfg.breakdowns ?? []) for (const [g, f] of Object.entries(b.fields ?? {})) claim(f, `breakdown '${g}'`);
  if (cfg.schedule) {
    const sc = cfg.schedule;
    const col = (id: string) => cfg.columns.find(c => c.id === id);
    if (col(sc.resource)?.type !== "identity" && col(sc.resource)?.type !== "string") errs.push(`Schedule: the resource column '${sc.resource}' must be a people picker (or text) column`);
    if (col(sc.start)?.type !== "date") errs.push(`Schedule: the start column '${sc.start}' must be a date column`);
    if (col(sc.effort)?.type !== "number") errs.push(`Schedule: the effort column '${sc.effort}' must be a number column`);
    if (sc.allocation && col(sc.allocation)?.type !== "number") errs.push(`Schedule: the allocation column '${sc.allocation}' must be a number column`);
    if (col(sc.end)?.type !== "date") errs.push(`Schedule: the end column '${sc.end}' must be a date column`);
    const picked = [sc.resource, sc.start, sc.effort, sc.allocation, sc.end].filter(Boolean);
    if (new Set(picked).size !== picked.length) errs.push("Schedule: each role needs a different column");
  }
  if (cfg.review) {
    const r = cfg.review;
    const col = (id?: string) => cfg.columns.find(c => c.id === id);
    if (!col(r.statusColumn)) errs.push(`Review: the status column '${r.statusColumn}' does not exist`);
    for (const [label, id] of [["reviewed-by", r.byColumn], ["reviewed-at", r.atColumn], ["comment", r.reasonColumn]] as const) if (id && !col(id)) errs.push(`Review: the ${label} column '${id}' does not exist`);
    const picked = [r.statusColumn, r.byColumn, r.atColumn, r.reasonColumn].filter(Boolean);
    if (new Set(picked).size !== picked.length) errs.push("Review: each review column must be a different column");
    const st: Record<string, string | undefined> = { ...(r.statuses ?? {}) };
    for (const [k, d] of Object.entries({ pending: "Pending review", approved: "Approved", rejected: "Rejected" })) st[k] ||= d;
    const labels = [st.pending, st.approved, st.rejected].map(v => String(v ?? "").trim().toLowerCase());
    if (labels.some(v => !v) || new Set(labels).size !== labels.length) errs.push("Review: the three status names must be filled in and different");
    if (r.secure) {
      if (!r.secure.dataField?.trim()) errs.push("Review: secure approvals need an approvals field");
      else if (r.secure.dataField === cfg.dataField) errs.push("Review: the approvals field must be a different field than the grid's data field");
    }
    for (const a of r.approvers ?? []) if (a.when?.column && !col(a.when.column)) errs.push(`Review: approver rule '${a.name}' uses unknown column '${a.when.column}'`);
  }
  if (cfg.child?.enabled && !ids.has(cfg.child.titleColumn)) errs.push(`Child title column '${cfg.child.titleColumn}' does not exist`);
  return errs;
}
