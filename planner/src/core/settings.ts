import { defaultSettings, GridSource, PlannerSettings, TeamRef } from "./types";

const FIELD = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const team = (t: unknown): TeamRef | undefined => (t && typeof t === "object" && typeof (t as TeamRef).id === "string" ? { id: (t as TeamRef).id, name: str((t as TeamRef).name) } : undefined);
const teams = (v: unknown) => (Array.isArray(v) ? v.map(team).filter((x): x is TeamRef => !!x) : []);

/** Fill in everything a stored, older or hand-edited value may leave out. */
export function normalizeSettings(raw: unknown): PlannerSettings {
  const d = defaultSettings();
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, fb: number) => (typeof v === "number" && Number.isFinite(v) ? v : fb);
  const th = (r.thresholds && typeof r.thresholds === "object" ? r.thresholds : {}) as Record<string, unknown>;
  const per = (r.period && typeof r.period === "object" ? r.period : {}) as Record<string, unknown>;
  const kinds = ["year", "quarter", "last12", "next12", "custom"];
  const sources: GridSource[] = (Array.isArray(r.sources) ? r.sources : []).filter(s => s && typeof s === "object").map((s, i) => {
    const x = s as Record<string, unknown>; const c = (x.columns && typeof x.columns === "object" ? x.columns : {}) as Record<string, unknown>;
    const opt = (k: string) => (str(c[k]) || undefined);
    return { id: str(x.id) || `src${i + 1}`, name: str(x.name), dataField: str(x.dataField),
      columns: { resource: str(c.resource), start: opt("start"), end: opt("end"), effort: opt("effort"), allocation: opt("allocation"), status: opt("status"), task: opt("task") },
      excludedStatuses: (Array.isArray(x.excludedStatuses) ? x.excludedStatuses : []).map(str).filter(Boolean) };
  });
  return {
    version: 1,
    workItemType: str(r.workItemType) || d.workItemType, epicStartField: str(r.epicStartField), epicTargetField: str(r.epicTargetField),
    sources, estimateUnscheduled: r.estimateUnscheduled === undefined ? d.estimateUnscheduled : !!r.estimateUnscheduled,
    capacityTeams: teams(r.capacityTeams),
    period: { kind: (kinds.includes(str(per.kind)) ? str(per.kind) : d.period.kind) as PlannerSettings["period"]["kind"], from: str(per.from) || undefined, to: str(per.to) || undefined },
    thresholds: { spare: num(th.spare, d.thresholds.spare), healthy: num(th.healthy, d.thresholds.healthy), full: num(th.full, d.thresholds.full) },
    colourMode: r.colourMode === "shades" ? "shades" : "rag", accessTeams: teams(r.accessTeams),
    extraFilterFields: (Array.isArray(r.extraFilterFields) ? r.extraFilterFields : []).map(str).filter(Boolean),
  };
}

/** Problems that stop the planner from working; an empty list means the settings can be used. */
export function validateSettings(s: PlannerSettings): string[] {
  const e: string[] = [];
  for (const [label, v] of [["Epic start-date field", s.epicStartField], ["Epic target-date field", s.epicTargetField]] as const) if (v && !FIELD.test(v)) e.push(`${label}: '${v}' is not a field reference name (for example Custom.StartDate).`);
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
