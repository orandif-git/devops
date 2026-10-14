import { dimFields, dimLabel, ExecEpic, NO_VALUE, STATUS_NAME } from "./executive";
import { AvailabilityLike, buildPeople, cellOf, groupByTeam, noFilters } from "./model";
import { GridDone } from "./progress";
import { resolveMonth } from "./widgets";
import { checkFormula, EvalAbort, evaluate, extractRefs } from "../../../src/core/expr";
import { Booking, EpicRecord, ExecFormula, ExecQuery, PlannerSettings, QueryCondition, QueryOp, QueryShow } from "./types";

export type FieldType = "text" | "number" | "date" | "choice";
export interface FieldDef { key: string; label: string; type: FieldType; group: "Epic" | "Calculated" | "Grid" | "Capacity" | "Person" | "Team" | "Calculated fields"; choices?: string[]; /** shown after the number */ unit?: "%" }
export type Cell = string | number | undefined;

export const OPS_BY_TYPE: Record<FieldType, QueryOp[]> = {
  text: ["=", "<>", "contains", "in", "empty", "notEmpty"],
  choice: ["=", "<>", "in", "empty", "notEmpty"],
  number: ["=", "<>", ">", ">=", "<", "<=", "empty", "notEmpty"],
  date: ["=", "<>", ">", ">=", "<", "<=", "empty", "notEmpty"],
};
export const OP_LABEL: Record<QueryOp, string> = { "=": "=", "<>": "<>", ">": ">", ">=": ">=", "<": "<", "<=": "<=", contains: "contains", in: "in", empty: "is empty", notEmpty: "is not empty" };
export const SHOW_LABEL: Record<QueryShow, string> = { epics: "Epics", people: "People", teams: "Teams" };
const YES_NO = ["Yes", "No"];
const BANDS = ["Spare capacity", "Healthy", "Nearly full", "Over capacity", "No capacity"];
const BAND_NAME: Record<string, string> = { spare: "Spare capacity", healthy: "Healthy", full: "Nearly full", over: "Over capacity", none: "No capacity" };

const capacity = (group: FieldDef["group"]): FieldDef[] => [
  { key: "booked", label: "Booked hours", type: "number", group }, { key: "available", label: "Available hours", type: "number", group },
  { key: "utilization", label: "Utilization", type: "number", group, unit: "%" }, { key: "free", label: "Free hours", type: "number", group },
];

/** The fields a query can use for each thing it can return, before any calculated field. */
export function builtinFields(show: QueryShow, s: PlannerSettings): FieldDef[] {
  if (show === "people") return [
    { key: "name", label: "Person", type: "text", group: "Person" }, { key: "team", label: "Team", type: "text", group: "Person" },
    ...capacity("Capacity"), { key: "band", label: "Utilization band", type: "choice", group: "Capacity", choices: BANDS }, { key: "epicsCount", label: "Epics booked", type: "number", group: "Capacity" },
  ];
  if (show === "teams") return [
    { key: "team", label: "Team", type: "text", group: "Team" }, { key: "peopleCount", label: "People", type: "number", group: "Team" },
    ...capacity("Capacity"), { key: "overCount", label: "People over capacity", type: "number", group: "Capacity" }, { key: "epicsCount", label: "Epics booked", type: "number", group: "Capacity" },
  ];
  const own = new Set(["id", "title", "state", "area", "start", "goLive"]);
  const cats = dimFields(s).map(f => ({ key: f, label: dimLabel(f), type: "text" as const, group: "Epic" as const }));
  const extra = s.extraFilterFields.filter(f => !dimFields(s).includes(f) && !own.has(f)).map(f => ({ key: f, label: dimLabel(f), type: "text" as const, group: "Epic" as const }));
  return [
    { key: "id", label: "Epic id", type: "number", group: "Epic" }, { key: "title", label: "Title", type: "text", group: "Epic" }, { key: "state", label: "State", type: "text", group: "Epic" },
    { key: "area", label: "Area", type: "text", group: "Epic" }, { key: "start", label: "Start date", type: "date", group: "Epic" }, { key: "goLive", label: "Go-live date", type: "date", group: "Epic" },
    ...cats, ...extra,
    { key: "status", label: "Status", type: "choice", group: "Calculated", choices: Object.values(STATUS_NAME) }, { key: "progress", label: "Progress", type: "number", group: "Calculated", unit: "%" },
    { key: "forecastLate", label: "Forecast days late", type: "number", group: "Calculated" }, { key: "daysToGoLive", label: "Days to go-live", type: "number", group: "Calculated" },
    { key: "confidence", label: "Confidence", type: "number", group: "Calculated", unit: "%" }, { key: "late", label: "Past go-live and not done", type: "choice", group: "Calculated", choices: YES_NO },
    { key: "onHold", label: "On hold", type: "choice", group: "Calculated", choices: YES_NO }, { key: "overCount", label: "People over capacity", type: "number", group: "Calculated" },
    { key: "hoursTotal", label: "Hours booked (all months)", type: "number", group: "Grid" }, { key: "hoursMonth", label: "Hours booked in the month", type: "number", group: "Grid" },
    { key: "peopleBooked", label: "People booked", type: "number", group: "Grid" }, { key: "tasksDone", label: "Tasks ticked done", type: "number", group: "Grid", unit: "%" },
  ];
}

export const calcKey = (f: ExecFormula) => "calc:" + f.id;
const calcDef = (f: ExecFormula): FieldDef => ({ key: calcKey(f), label: f.name || "(unnamed)", type: f.format === "text" ? "text" : "number", group: "Calculated fields", ...(f.format === "percent" ? { unit: "%" as const } : {}) });

/** Everything a query can use: the built-in fields and the calculated fields defined for what it returns. */
export function catalog(show: QueryShow, s: PlannerSettings): FieldDef[] {
  return [...builtinFields(show, s), ...s.executive.formulas.filter(f => f.show === show).map(calcDef)];
}

/** The columns a result shows when the query chooses none. */
export const defaultColumns = (show: QueryShow): string[] => (show === "people" ? ["name", "team", "booked", "available", "utilization", "free", "band", "epicsCount"] : show === "teams" ? ["team", "peopleCount", "booked", "available", "utilization", "free", "overCount", "epicsCount"] : ["title", "status", "progress", "goLive", "confidence"]);

/** A value as the table shows it. */
export function formatCell(f: FieldDef | undefined, v: Cell): string {
  if (v === undefined || v === "") return "–";
  return typeof v === "number" ? v.toLocaleString(undefined, { maximumFractionDigits: 6 }) + (f?.unit ?? "") : String(v);
}

/**
 * Work out the calculated fields of one row (in the order they are listed; a formula may use the ones above it). A missing input or a division by zero leaves the value blank.
 * Date fields are numbers of days in a formula, so [Go-live date] - [Start date] is a number of days; Today is today's day number.
 */
export function addCalculated(v: Record<string, Cell>, show: QueryShow, s: PlannerSettings, today: number): void {
  const built = builtinFields(show, s);
  const calcs = s.executive.formulas.filter(f => f.show === show);
  const known: FieldDef[] = [...built];
  for (const f of calcs) {
    const def = calcDef(f);
    try {
      const out = evaluate(f.formula, name => {
        if (name.toLowerCase() === "today") return today / 86400000;
        const fd = known.find(x => x.label.toLowerCase() === name.toLowerCase() || x.key.toLowerCase() === name.toLowerCase());
        if (!fd) throw new EvalAbort(`unknown field '${name}'`);
        const x = v[fd.key];
        if (x === undefined || x === "") throw new EvalAbort(`'${name}' has no value`);
        if (fd.type === "date") { const t = Date.parse(String(x).slice(0, 10)); return Number.isFinite(t) ? t / 86400000 : (() => { throw new EvalAbort("bad date"); })(); }
        return typeof x === "number" ? x : fd.type === "number" ? Number(x) : String(x);
      }, { strictDiv: true });
      if (typeof out === "number") { if (!Number.isFinite(out)) { v[def.key] = undefined; } else { const m = Math.pow(10, f.decimals); v[def.key] = Math.round(out * m) / m; } }
      else v[def.key] = typeof out === "boolean" ? (out ? "Yes" : "No") : String(out);
    } catch (e) { v[def.key] = undefined; if (!(e instanceof EvalAbort)) { /* a broken formula shows blank; the settings page reports it */ } }
    known.push(def);
  }
}

export interface QueryInput { settings: PlannerSettings; exec: ExecEpic[]; bookings: Booking[]; avail: AvailabilityLike; gridDone?: Record<number, Record<string, GridDone | undefined>>; today?: Date }
export interface ResultRow { key: string; values: Record<string, Cell>; epicId?: number }
export interface QueryResult { query: ExecQuery; month: string; /** every field available */ columns: FieldDef[]; rows: ResultRow[]; /** the fields to show, in order */ shown: FieldDef[] }

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
/** A date value: YYYY-MM-DD, or "today", "today-30", "today+7". */
export function dateValue(v: string, today: number): string | undefined {
  const m = /^today\s*([+-]\s*\d+)?$/i.exec(v.trim());
  if (m) return iso(today + (m[1] ? Number(m[1].replace(/\s+/g, "")) : 0) * 86400000);
  return /^\d{4}-\d{2}-\d{2}/.test(v.trim()) ? v.trim().slice(0, 10) : undefined;
}
const empty = (v: Cell) => v === undefined || v === "" || (typeof v === "number" && !Number.isFinite(v));

/** Does one row's value satisfy one condition? */
export function test(v: Cell, c: QueryCondition, type: FieldType, today: number): boolean {
  if (c.op === "empty") return empty(v);
  if (c.op === "notEmpty") return !empty(v);
  if (empty(v)) return c.op === "<>";
  if (type === "number") {
    const a = Number(v), b = Number(c.value.replace(",", "."));
    if (!Number.isFinite(b)) return false;
    return c.op === "=" ? a === b : c.op === "<>" ? a !== b : c.op === ">" ? a > b : c.op === ">=" ? a >= b : c.op === "<" ? a < b : c.op === "<=" ? a <= b : false;
  }
  if (type === "date") {
    const a = String(v).slice(0, 10), b = dateValue(c.value, today);
    if (!b) return false;
    return c.op === "=" ? a === b : c.op === "<>" ? a !== b : c.op === ">" ? a > b : c.op === ">=" ? a >= b : c.op === "<" ? a < b : c.op === "<=" ? a <= b : false;
  }
  const a = String(v).trim().toLowerCase(), b = c.value.trim().toLowerCase();
  if (c.op === "=") return a === b;
  if (c.op === "<>") return a !== b;
  if (c.op === "contains") return a.includes(b);
  if (c.op === "in") return b.split(/[,;]/).map(x => x.trim()).filter(Boolean).includes(a);
  return false;
}

/** Rows joined with And / Or: And binds tighter than Or, as usual. No conditions = every row. */
export function matches(conds: QueryCondition[], get: (field: string) => Cell, typeOf: (field: string) => FieldType, today: number): boolean {
  if (!conds.length) return true;
  const groups: QueryCondition[][] = [];
  conds.forEach((c, i) => { if (i === 0 || c.join === "or") groups.push([c]); else groups[groups.length - 1].push(c); });
  return groups.some(g => g.every(c => test(get(c.field), c, typeOf(c.field), today)));
}

const r1 = (n: number) => Math.round(n * 10) / 10;
/** Share of ticked work across an Epic's grids (effort-weighted where the grid has effort). */
const tasksDone = (g?: Record<string, GridDone | undefined>): number | undefined => {
  const list = Object.values(g ?? {}).filter((x): x is GridDone => !!x && x.weight > 0);
  const w = list.reduce((a, x) => a + x.weight, 0);
  return w > 0 ? Math.round(list.reduce((a, x) => a + x.weightDone, 0) / w * 100) : undefined;
};

const finish = (q: ExecQuery, month: string, fields: FieldDef[], rows: ResultRow[]): QueryResult => {
  const keys = q.columns.length ? q.columns : defaultColumns(q.show);
  return { query: q, month, columns: fields, rows, shown: keys.map(k => fields.find(f => f.key === k)).filter((f): f is FieldDef => !!f) };
};

/** Run one query over the dashboard's data. */
export function runQuery(q: ExecQuery, p: QueryInput): QueryResult {
  const now = p.today ?? new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const month = resolveMonth(q.month, now);
  const fields = catalog(q.show, p.settings);
  const type = (f: string): FieldType => fields.find(x => x.key === f)?.type ?? "text";
  const th = p.settings.thresholds;
  const epics: EpicRecord[] = p.exec.map(r => r.epic);

  if (q.show === "epics") {
    const hoursBy = new Map<number, { total: number; month: number; people: Set<string> }>();
    for (const b of p.bookings) { const e = hoursBy.get(b.epicId) ?? { total: 0, month: 0, people: new Set<string>() }; e.total += b.hours; if (b.month === month) { e.month += b.hours; e.people.add(b.person); } hoursBy.set(b.epicId, e); }
    const rows: ResultRow[] = [];
    for (const r of p.exec) {
      const h = hoursBy.get(r.epic.id);
      const v: Record<string, Cell> = {
        id: r.epic.id, title: r.epic.title, state: r.epic.state, area: r.epic.areaPath, start: r.start !== undefined ? iso(r.start) : undefined, goLive: r.goLive !== undefined ? iso(r.goLive) : undefined,
        status: STATUS_NAME[r.status], progress: r.pct, forecastLate: r.forecast !== undefined ? r.slip : undefined, daysToGoLive: r.goLive !== undefined ? Math.round((r.goLive - today) / 86400000) : undefined,
        confidence: r.conf ?? undefined, late: r.late ? "Yes" : "No", onHold: r.hold ? "Yes" : "No", overCount: r.over.length,
        hoursTotal: h ? r1(h.total) : 0, hoursMonth: h ? r1(h.month) : 0, peopleBooked: h ? h.people.size : 0, tasksDone: tasksDone(p.gridDone?.[r.epic.id]),
      };
      for (const f of fields) if (!(f.key in v)) { const x = r.dims[f.key] ?? r.epic.extra[f.key]; v[f.key] = x === NO_VALUE ? "" : x; }
      addCalculated(v, "epics", p.settings, today);
      if (matches(q.conditions, f => v[f], type, today)) rows.push({ key: String(r.epic.id), values: v, epicId: r.epic.id });
    }
    return finish(q, month, fields, rows);
  }

  // people and teams: utilization in the month, from the bookings and the team capacity
  const people = buildPeople(p.bookings, epics, p.avail, [month], noFilters());
  const personRows = people.map(pp => {
    const c = cellOf(pp, month, th);
    const util = c.available !== null && c.available > 0 ? r1(c.hours / c.available * 100) : undefined;
    return { pp, c, util, v: { name: pp.name.replace(/\s*<[^>]*>\s*$/, "").trim() || pp.name, team: pp.team, booked: r1(c.hours), available: c.available ?? undefined, utilization: util, free: c.available !== null ? r1(Math.max(0, c.available - c.hours)) : undefined, band: BAND_NAME[c.band], epicsCount: (pp.epics[month] ?? []).length } as Record<string, Cell> };
  });
  if (q.show === "people") {
    for (const x of personRows) addCalculated(x.v, "people", p.settings, today);
    const rows = personRows.filter(x => matches(q.conditions, f => x.v[f], type, today)).map(x => ({ key: x.pp.key, values: x.v })).sort((a, b) => ((b.values.utilization as number) ?? -1) - ((a.values.utilization as number) ?? -1) || String(a.values.name).localeCompare(String(b.values.name)));
    return finish(q, month, fields, rows);
  }
  const teamRows = groupByTeam(people).map(g => {
    const list = personRows.filter(x => x.pp.team === g.team);
    const booked = list.reduce((a, x) => a + x.c.hours, 0), available = list.reduce((a, x) => a + (x.c.available ?? 0), 0);
    const epicSet = new Set(list.flatMap(x => (x.pp.epics[month] ?? []).map(e => e.epicId)));
    const v: Record<string, Cell> = { team: g.team, peopleCount: list.length, booked: r1(booked), available: r1(available), utilization: available > 0 ? r1(booked / available * 100) : undefined, free: r1(Math.max(0, available - booked)), overCount: list.filter(x => x.c.band === "over").length, epicsCount: epicSet.size };
    addCalculated(v, "teams", p.settings, today);
    return { key: g.team, values: v };
  });
  const rows = teamRows.filter(r => matches(q.conditions, f => r.values[f], type, today)).sort((a, b) => ((b.values.utilization as number) ?? -1) - ((a.values.utilization as number) ?? -1) || String(a.values.team).localeCompare(String(b.values.team)));
  return finish(q, month, fields, rows);
}

/** The sentence that answers a query, built only from its rows. */
export function describeResult(r: QueryResult): string {
  const n = r.rows.length, q = r.query;
  const noun = q.show === "epics" ? (n === 1 ? "Epic" : "Epics") : q.show === "people" ? (n === 1 ? "person" : "people") : n === 1 ? "team" : "teams";
  const head = `${q.name || "Query"}: ${n} ${noun}`;
  if (!n) return head + ".";
  const pct = (x: Cell) => (typeof x === "number" ? `${Math.round(x)}%` : "");
  const list = q.show === "epics" ? r.rows.slice(0, 5).map(x => String(x.values.title)) : q.show === "people" ? r.rows.slice(0, 5).map(x => `${x.values.name} ${pct(x.values.utilization)}`.trim()) : r.rows.slice(0, 5).map(x => `${x.values.team} ${pct(x.values.utilization)}`.trim());
  return `${head} (${q.show === "epics" ? "" : r.month + ": "}${list.join(", ")}${n > 5 ? ` … and ${n - 5} more` : ""}).`.replace("( ", "(").replace("(: ", "(");
}

/** Problems with the calculated fields in the settings. */
export function validateFormulas(s: PlannerSettings): string[] {
  const e: string[] = [];
  const seen = new Set<string>();
  s.executive.formulas.forEach((f, i) => {
    const w = f.name ? `Calculated field “${f.name}”` : `Calculated field ${i + 1}`;
    if (!f.name) e.push(`${w}: give it a name.`);
    else {
      const k = `${f.show}|${f.name.toLowerCase()}`;
      if (seen.has(k)) e.push(`${w}: another calculated field for ${SHOW_LABEL[f.show]} has the same name.`);
      seen.add(k);
      if (builtinFields(f.show, s).some(b => b.label.toLowerCase() === f.name.toLowerCase())) e.push(`${w}: the name is already a built-in field.`);
    }
    if (!f.formula) { e.push(`${w}: enter a formula.`); return; }
    const bad = checkFormula(f.formula);
    if (bad) { e.push(`${w}: ${bad}.`); return; }
    const before = [...builtinFields(f.show, s), ...s.executive.formulas.filter(x => x.show === f.show).slice(0, s.executive.formulas.filter(x => x.show === f.show).indexOf(f)).map(calcDef)];
    for (const r of extractRefs(f.formula)) if (r.toLowerCase() !== "today" && !before.some(b => b.label.toLowerCase() === r.toLowerCase() || b.key.toLowerCase() === r.toLowerCase())) e.push(`${w}: [${r}] is not a field it can use (built-in fields and the calculated fields above it).`);
  });
  return e;
}

/** Problems with the queries in the settings. */
export function validateQueries(s: PlannerSettings): string[] {
  const e: string[] = [...validateFormulas(s)];
  const seen = new Set<string>();
  s.executive.queries.forEach((q, i) => {
    const w = q.name ? `Query “${q.name}”` : `Query ${i + 1}`;
    if (!q.name) e.push(`${w}: give it a name.`);
    else if (seen.has(q.name.toLowerCase())) e.push(`${w}: another query has the same name.`);
    seen.add(q.name.toLowerCase());
    const fields = catalog(q.show, s);
    for (const k of q.columns) if (!fields.some(f => f.key === k)) e.push(`${w}: the column '${k}' is not available.`);
    q.conditions.forEach((c, j) => {
      const f = fields.find(x => x.key === c.field);
      const r = `${w}, row ${j + 1}`;
      if (!c.field) { e.push(`${r}: choose a field.`); return; }
      if (!f) { e.push(`${r}: '${c.field}' is not a field of ${SHOW_LABEL[q.show]}.`); return; }
      if (!OPS_BY_TYPE[f.type].includes(c.op)) e.push(`${r}: “${OP_LABEL[c.op]}” cannot be used with ${f.label}.`);
      else if (c.op !== "empty" && c.op !== "notEmpty") {
        if (!c.value) e.push(`${r}: enter a value.`);
        else if (f.type === "number" && !Number.isFinite(Number(c.value.replace(",", ".")))) e.push(`${r}: ${f.label} needs a number.`);
        else if (f.type === "date" && !dateValue(c.value, 0)) e.push(`${r}: ${f.label} needs a date (YYYY-MM-DD) or today, today-30, today+7.`);
      }
    });
  });
  return e;
}
