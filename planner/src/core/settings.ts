import { defaultStages, IGNORE } from "./stages";
import { isDateFormat } from "../../../src/core/dateFormat";
import { cleanTiles } from "./epicStats";
import { validateQueries } from "./execQuery";
import { defaultExec, defaultSettings, ExecFormula, ExecQuery, ExecSettings, GridSource, PlannerSettings, ProgressSource, QueryCondition, QueryOp, TeamRef } from "./types";

const FIELD = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const team = (t: unknown): TeamRef | undefined => (t && typeof t === "object" && typeof (t as TeamRef).id === "string" ? { id: (t as TeamRef).id, name: str((t as TeamRef).name) } : undefined);
const list = (v: unknown, fb: string[] = []) => (Array.isArray(v) ? Array.from(new Set(v.map(str).filter(Boolean))) : fb);

const OPS: QueryOp[] = ["=", "<>", ">", ">=", "<", "<=", "contains", "in", "empty", "notEmpty"];
export function normalizeQueries(raw: unknown): ExecQuery[] {
  return (Array.isArray(raw) ? raw : []).filter(q => q && typeof q === "object").map((q, i) => {
    const x = q as Record<string, unknown>;
    const conditions: QueryCondition[] = (Array.isArray(x.conditions) ? x.conditions : []).filter(c => c && typeof c === "object").map(c => {
      const y = c as Record<string, unknown>;
      return { field: str(y.field), op: (OPS.includes(str(y.op) as QueryOp) ? str(y.op) : "=") as QueryOp, value: typeof y.value === "string" ? y.value.trim() : y.value === undefined || y.value === null ? "" : String(y.value), join: (y.join === "or" ? "or" : "and") as "and" | "or" };
    });
    return { id: str(x.id) || `q${i + 1}`, name: str(x.name), show: (["epics", "people", "teams"].includes(str(x.show)) ? str(x.show) : "epics") as ExecQuery["show"], conditions, month: /^(current|next|\d{4}-\d{2})$/.test(str(x.month)) ? str(x.month) : "current", columns: list(x.columns) };
  });
}

export function normalizeFormulas(raw: unknown): ExecFormula[] {
  return (Array.isArray(raw) ? raw : []).filter(f => f && typeof f === "object").map((f, i) => {
    const x = f as Record<string, unknown>;
    return { id: str(x.id) || `f${i + 1}`, name: str(x.name), show: (["epics", "people", "teams"].includes(str(x.show)) ? str(x.show) : "epics") as ExecFormula["show"], formula: typeof x.formula === "string" ? x.formula.trim() : "",
      format: (["number", "percent", "text"].includes(str(x.format)) ? str(x.format) : "number") as ExecFormula["format"], decimals: typeof x.decimals === "number" && x.decimals >= 0 && x.decimals <= 6 ? Math.floor(x.decimals) : 1 };
  });
}

const normHistory = (raw: unknown): PlannerSettings["history"] => {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>, d = defaultSettings().history;
  const n = (v: unknown, fb: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fb);
  return { enabled: r.enabled !== false, windowDays: n(r.windowDays, d.windowDays, 7, 730), movesAmber: n(r.movesAmber, d.movesAmber, 1, 20), affectStatus: r.affectStatus !== false, trendBackfill: r.trendBackfill !== false };
};

function normStages(raw: unknown): ExecSettings["stages"] {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>, d = defaultStages();
  const n = (v: unknown, fb: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fb);
  const seen = new Set<string>();
  const stages = (Array.isArray(r.stages) ? r.stages : []).filter(x => x && typeof x === "object").map(x => { const o = x as Record<string, unknown>; return { name: str(o.name), pct: n(o.pct, 0, 0, 100), from: n(o.from, 0, 0, 100), to: n(o.to, 100, 0, 100) }; })
    .filter(x => x.name && !seen.has(x.name.toLowerCase()) && !!seen.add(x.name.toLowerCase()));
  const names = new Set(stages.map(x => x.name.toLowerCase()));
  const map: Record<string, string> = {}; if (r.map && typeof r.map === "object") for (const [k, v] of Object.entries(r.map as Record<string, unknown>)) { const t = typeof v === "string" ? v : ""; if (k.trim() && (t === IGNORE || names.has(t.toLowerCase()))) map[k] = stages.find(x => x.name.toLowerCase() === t.toLowerCase())?.name ?? IGNORE; }
  return { source: (["field", "state", "both"].includes(str(r.source)) ? str(r.source) : "both") as ExecSettings["stages"]["source"], field: str(r.field), stages, map, smooth: r.smooth === true, lagRule: r.lagRule !== false, lagAmber: n(r.lagAmber, d.lagAmber, 1, 10), lagRed: n(r.lagRed, d.lagRed, 1, 10), stuckRule: r.stuckRule !== false, stuckDays: n(r.stuckDays, d.stuckDays, 1, 730) };
}
const DELIVERY_PARTS = ["rate", "late", "delivered", "predict", "chart", "delays"];
function normDelivery(raw: unknown): ExecSettings["delivery"] {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>, d = defaultExec().delivery;
  const n = (v: unknown, fb: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fb);
  const show = Array.isArray(r.show) ? r.show.filter((x): x is string => typeof x === "string" && DELIVERY_PARTS.includes(x)) : d.show;
  return { enabled: r.enabled !== false, source: r.source === "field" ? "field" : "history", dateField: str(r.dateField), graceDays: n(r.graceDays, d.graceDays, 0, 365), severeDays: n(r.severeDays, d.severeDays, 1, 730), predictDays: n(r.predictDays, d.predictDays, 0, 365), quarters: n(r.quarters, d.quarters, 2, 12), recent: n(r.recent, d.recent, 1, 8), show };
}
export function normalizeExec(raw: unknown): ExecSettings {
  const d = defaultExec();
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const n = (v: unknown, fb: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fb);
  const kinds = ["percentField", "ratioFields", "gridDone"];
  const progress: ProgressSource[] = (Array.isArray(r.progress) ? r.progress : []).filter(x => x && typeof x === "object").map((x, i) => {
    const p = x as Record<string, unknown>;
    return { id: str(p.id) || `pg${i + 1}`, kind: (kinds.includes(str(p.kind)) ? str(p.kind) : "percentField") as ProgressSource["kind"], field: str(p.field) || undefined, doneField: str(p.doneField) || undefined, totalField: str(p.totalField) || undefined, sourceId: str(p.sourceId) || undefined };
  });
  return {
    enabled: r.enabled === true, layout: (["report", "map", "roadmap"].includes(str(r.layout)) ? str(r.layout) : "report") as ExecSettings["layout"], categoryFields: list(r.categoryFields), goLiveField: str(r.goLiveField), progress,
    doneStates: list(r.doneStates, d.doneStates), holdStates: list(r.holdStates, d.holdStates), notStartedStates: list(r.notStartedStates, d.notStartedStates), ignoreStates: list(r.ignoreStates, d.ignoreStates),
    advanced: r.advanced === true, slipAmberDays: n(r.slipAmberDays, d.slipAmberDays, 0, 365), slipRedDays: n(r.slipRedDays, d.slipRedDays, 0, 730), gapAmberPts: n(r.gapAmberPts, d.gapAmberPts, 0, 100), gapRedPts: n(r.gapRedPts, d.gapRedPts, 0, 100),
    minElapsedPct: n(r.minElapsedPct, d.minElapsedPct, 0, 90), likelyPct: n(r.likelyPct, d.likelyPct, 1, 100), queries: normalizeQueries(r.queries), formulas: normalizeFormulas(r.formulas),
    tolSlipAmberField: str(r.tolSlipAmberField), tolSlipRedField: str(r.tolSlipRedField), tolGapAmberField: str(r.tolGapAmberField), tolGapRedField: str(r.tolGapRedField),
    rules: (Array.isArray(r.rules) ? r.rules : []).filter(q => q && typeof q === "object").map((q, i) => { const o = q as Record<string, unknown>, k = (v: unknown, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(0, v)) : undefined);
      return { id: str(o.id) || `r${i + 1}`, field: str(o.field), value: str(o.value), slipAmberDays: k(o.slipAmberDays, 730), slipRedDays: k(o.slipRedDays, 730), gapAmberPts: k(o.gapAmberPts, 100), gapRedPts: k(o.gapRedPts, 100) }; }).filter(q => q.field),
    declaredField: str(r.declaredField), statusSource: (["data", "rag", "rag-check"].includes(str(r.statusSource)) ? str(r.statusSource) : "rag-check") as ExecSettings["statusSource"], ragGreen: list(r.ragGreen), ragAmber: list(r.ragAmber), ragRed: list(r.ragRed), ragNone: list(r.ragNone), sizeField: str(r.sizeField), staleDays: n(r.staleDays, 0, 0, 3650), blockerField: str(r.blockerField), blockerValues: list(r.blockerValues), accessTeams: teams(r.accessTeams), periodBasis: (["active", "golive", "created", "field"].includes(str(r.periodBasis)) ? str(r.periodBasis) : "active") as ExecSettings["periodBasis"], periodField: str(r.periodField), delivery: normDelivery(r.delivery), stages: normStages(r.stages), periodDefault: (["thisQuarter", "nextQuarter", "thisYear", "last12", "next6"].includes(str(r.periodDefault)) ? str(r.periodDefault) : "") as ExecSettings["periodDefault"], resources: r.resources === true,
  };
}

const teams = (v: unknown) => (Array.isArray(v) ? v.map(team).filter((x): x is TeamRef => !!x) : []);

/** Fill in everything a stored, older or hand-edited value may leave out. */
export function normalizeSettings(raw: unknown): PlannerSettings {
  const d = defaultSettings();
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, fb: number) => (typeof v === "number" && Number.isFinite(v) ? v : fb);
  const th = (r.thresholds && typeof r.thresholds === "object" ? r.thresholds : {}) as Record<string, unknown>;
  const per = (r.period && typeof r.period === "object" ? r.period : {}) as Record<string, unknown>;
  const pl = (r.plan && typeof r.plan === "object" ? r.plan : {}) as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, ok: T[], fb: T): T => (ok.includes(v as T) ? (v as T) : fb);
  const kinds = ["year", "quarter", "last12", "next12", "custom"];
  const sources: GridSource[] = (Array.isArray(r.sources) ? r.sources : []).filter(s => s && typeof s === "object").map((s, i) => {
    const x = s as Record<string, unknown>; const c = (x.columns && typeof x.columns === "object" ? x.columns : {}) as Record<string, unknown>;
    const opt = (k: string) => (str(c[k]) || undefined);
    return { id: str(x.id) || `src${i + 1}`, name: str(x.name), dataField: str(x.dataField),
      columns: { resource: str(c.resource), start: opt("start"), end: opt("end"), effort: opt("effort"), allocation: opt("allocation"), status: opt("status"), task: opt("task"), done: opt("done") },
      excludedStatuses: (Array.isArray(x.excludedStatuses) ? x.excludedStatuses : []).map(str).filter(Boolean) };
  });
  return {
    version: 1,
    workItemType: str(r.workItemType) || d.workItemType, epicStartField: str(r.epicStartField), epicTargetField: str(r.epicTargetField), ganttLabelField: str(r.ganttLabelField), ganttGroupFields: list(r.ganttGroupFields), history: normHistory(r.history), dateFormat: isDateFormat(str(r.dateFormat)) ? str(r.dateFormat) : "", monthFormat: isDateFormat(str(r.monthFormat)) ? str(r.monthFormat) : "",
    sources, estimateUnscheduled: r.estimateUnscheduled === undefined ? d.estimateUnscheduled : !!r.estimateUnscheduled,
    capacityTeams: teams(r.capacityTeams),
    period: { kind: (kinds.includes(str(per.kind)) ? str(per.kind) : d.period.kind) as PlannerSettings["period"]["kind"], from: str(per.from) || undefined, to: str(per.to) || undefined },
    thresholds: { spare: num(th.spare, d.thresholds.spare), healthy: num(th.healthy, d.thresholds.healthy), full: num(th.full, d.thresholds.full) },
    colourMode: r.colourMode === "shades" ? "shades" : "rag",
    plan: { groupBy: pick(pl.groupBy, ["team", "epic", "person"], d.plan.groupBy), units: pick(pl.units, ["h", "p", "f"], d.plan.units), view: pick(pl.view, ["heat", "time", "gantt"], d.plan.view), rows: pick(pl.rows, ["collapsed", "teams", "all"], d.plan.rows), ganttTiles: cleanTiles(pl.ganttTiles, d.plan.ganttTiles) }, accessTeams: teams(r.accessTeams),
    extraFilterFields: (Array.isArray(r.extraFilterFields) ? r.extraFilterFields : []).map(str).filter(Boolean),
    executive: normalizeExec(r.executive),
  };
}

/** Problems that stop the planner from working; an empty list means the settings can be used. */
export function validateSettings(s: PlannerSettings): string[] {
  const e: string[] = [];
  for (const [label, v] of [["Epic start-date field", s.epicStartField], ["Epic target-date field", s.epicTargetField], ["Gantt label field", s.ganttLabelField]] as const) if (v && !FIELD.test(v)) e.push(`${label}: '${v}' is not a field reference name (for example Custom.StartDate).`);
  if (!s.sources.length) e.push("Add at least one grid that holds the hours (Hours sources).");
  const ids = new Set<string>();
  s.sources.forEach((g, i) => {
    const w = g.name || `Source ${i + 1}`;
    if (ids.has(g.id)) e.push(`${w}: duplicate id '${g.id}'.`); ids.add(g.id);
    if (!g.dataField) e.push(`${w}: choose the data field of the grid.`); else if (!FIELD.test(g.dataField)) e.push(`${w}: '${g.dataField}' is not a field reference name.`);
    if (!g.columns.resource) e.push(`${w}: choose the Resource column.`);
    if (g.excludedStatuses.length && !g.columns.status) e.push(`${w}: excluded statuses need the status column.`);
  });
  const t = s.thresholds;
  if (!(t.spare > 0 && t.spare < t.healthy && t.healthy <= t.full && t.full <= 300)) e.push("Thresholds must increase: spare below healthy, healthy up to full (for example 50 / 85 / 100).");
  if (s.period.kind === "custom" && !(/^\d{4}-\d{2}/.test(s.period.from ?? "") && /^\d{4}-\d{2}/.test(s.period.to ?? ""))) e.push("A custom period needs a first and last month (YYYY-MM).");
  for (const f of s.extraFilterFields) if (!FIELD.test(f)) e.push(`Extra filter '${f}' is not a field reference name.`);
  return e;
}

/** Problems with the Executive Dashboard settings. The planner itself works without them; the dashboard needs a go-live date, and progress sources must be complete. */
export function validateExec(s: PlannerSettings): string[] {
  const e: string[] = [];
  const x = s.executive;
  if (!(x.goLiveField || s.epicTargetField)) e.push("Choose the go-live date field (or set the Epic target-date field).");
  for (const f of [x.goLiveField, ...x.categoryFields]) if (f && !FIELD.test(f)) e.push(`'${f}' is not a field reference name.`);
  x.progress.forEach((p, i) => {
    const w = `Progress source ${i + 1}`;
    if (p.kind === "percentField" && !p.field) e.push(`${w}: choose the percent-complete field.`);
    if (p.kind === "ratioFields" && !(p.doneField && p.totalField)) e.push(`${w}: choose the completed and the total field.`);
    if (p.kind === "gridDone") {
      const src = s.sources.find(g => g.id === p.sourceId);
      if (!src) e.push(`${w}: choose a grid.`); else if (!src.columns.done) e.push(`${w}: choose the done (tick box) column of “${src.name || src.id}”.`);
    }
  });
  if (x.advanced && x.slipAmberDays >= x.slipRedDays) e.push("Days late: the attention limit must be below the at-risk limit.");
  if (x.advanced && x.gapAmberPts >= x.gapRedPts) e.push("Progress gap: the attention limit must be below the at-risk limit.");
  e.push(...validateQueries(s));
  return e;
}
