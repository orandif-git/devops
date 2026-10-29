import { fmtDate } from "../core/dates";
import { dimFields, dimLabel, ExecEpic, ExecStatus, NO_VALUE, STATUS_NAME } from "../core/executive";
import { PlannerSettings } from "../core/types";
import { Hist, movedTags, Summary, summarize } from "../core/history";
import { Loaded } from "../data/loadAll";
import { Dates, parseDay, Period, periodLabel, periodState } from "../core/execPeriod";

/** One Epic as the dashboard shows it: the assessed row plus what the slicers and the search need. */
export interface Item {
  r: ExecEpic; id: number; title: string; state: string; status: ExecStatus;
  team: string; quarter: string; hours: number;
  /** how the owner's declared status compares with the computed one */
  decl: string;
  /** owner RAG and data status together ("green|red") when both are judged; the variance grid filters by it */
  cell: string; gap: number;
  /** the dates the period filter can use */
  dt: Dates;
  /** the history of the go-live date (when it was read), what it says, and the words it can be filtered by */
  hist?: Hist; sum: Summary; moved: string[];
  /** lower-case text the search looks in: id, title, state, area, categories, reasons, people, dates, team */
  text: string;
}

export const DECL_NONE = "No RAG";
export const DECL_ORDER = ["Check this", "Looks fine", DECL_NONE];
const DECL: Record<string, string> = { optimistic: "Check this", cautious: "Looks fine", same: "Looks fine" };
const r1 = (n: number) => Math.round(n * 10) / 10;
export const NO_DATE = "No go-live date";
export const quarterOf = (t?: number) => (t === undefined ? NO_DATE : `Q${Math.floor(new Date(t).getUTCMonth() / 3) + 1} ${String(new Date(t).getUTCFullYear()).slice(2)}`);
const qKey = (q: string) => (q === NO_DATE ? "9999" : q.slice(3) + q[1]);
export const sortQuarters = (qs: string[]) => [...qs].sort((a, b) => qKey(a).localeCompare(qKey(b)));
const iso = (t?: number) => (t === undefined ? "" : new Date(t).toISOString().slice(0, 10));

/** Hours booked, the team with most hours, and the searchable text of each Epic. */
export function buildItems(rows: ExecEpic[], L: Loaded, s: PlannerSettings, today = Date.now()): Item[] {
  const hmap = L.history?.[s.executive.goLiveField || s.epicTargetField];
  const by = new Map<number, { hours: number; people: Set<string>; teams: Map<string, number> }>();
  for (const b of L.bookings) {
    const e = by.get(b.epicId) ?? { hours: 0, people: new Set<string>(), teams: new Map<string, number>() };
    e.hours += b.hours; e.people.add(b.personName.replace(/\s*<[^>]*>\s*$/, "")); const t = L.avail.team(b.person) || NO_VALUE; e.teams.set(t, (e.teams.get(t) ?? 0) + b.hours);
    by.set(b.epicId, e);
  }
  return rows.map(r => {
    const hist = hmap?.[r.epic.id], sum = summarize(hist, today, s.history.windowDays), moved = movedTags(sum);
    const e = s.executive.resources ? by.get(r.epic.id) : undefined, team = e ? Array.from(e.teams).sort((a, b) => b[1] - a[1])[0][0] : NO_VALUE;
    const text = [r.epic.id, r.epic.title, r.epic.state, r.epic.areaPath, ...Object.values(r.dims), ...r.reasons, STATUS_NAME[r.status], team, quarterOf(r.goLive), iso(r.goLive), fmtDate(s, iso(r.goLive)), iso(r.forecast), ...(e ? Array.from(e.people) : []), ...(hist ? moved : [])].join(" | ").toLowerCase();
    return { r, id: r.epic.id, title: r.epic.title, state: r.epic.state, status: r.status, team, quarter: quarterOf(r.goLive), hours: e ? r1(e.hours) : 0, dt: { start: r.start, goLive: r.goLive, created: parseDay(r.epic.created), field: s.executive.periodField ? parseDay(r.epic.extra[s.executive.periodField]) : undefined }, cell: r.declared && (r.dataStatus === "green" || r.dataStatus === "amber" || r.dataStatus === "red") ? r.declared + "|" + r.dataStatus : "", gap: r.declared && (r.dataStatus === "green" || r.dataStatus === "amber" || r.dataStatus === "red") ? ({ green: 0, amber: 1, red: 2 } as Record<string, number>)[r.dataStatus] - ({ green: 0, amber: 1, red: 2 } as Record<string, number>)[r.declared] : 0, decl: DECL[r.compare ?? ""] ?? (s.executive.declaredField ? DECL_NONE : ""), text, hist, sum, moved };
  });
}

/** What the person has chosen. Within one slicer the choices add up (or); different slicers narrow each other (and). */
export interface XF { status: ExecStatus[]; state: string[]; team: string[]; quarter: string[]; moved: string[]; decl: string[]; cell: string[]; /** the period (all time when absent) */ period?: Period; dims: Record<string, string[]>; text: string; saved?: number[]; savedName?: string }
export const emptyXF = (): XF => ({ status: [], state: [], team: [], quarter: [], moved: [], decl: [], cell: [], dims: {}, text: "" });
export const isEmpty = (f: XF) => !f.status.length && !f.state.length && !f.team.length && !f.quarter.length && !f.moved.length && !f.decl.length && !f.cell.length && !f.period && !Object.values(f.dims).some(v => v.length) && !f.text && !f.saved;
export type Skip = "period" | "status" | "state" | "team" | "quarter" | "moved" | "decl" | "cell" | { dim: string };

export function pass(i: Item, f: XF, skip?: Skip): boolean {
  const k = typeof skip === "string" ? skip : undefined, d = typeof skip === "object" ? skip.dim : undefined;
  if (k !== "status" && f.status.length && !f.status.includes(i.status)) return false;
  if (k !== "state" && f.state.length && !f.state.includes(i.state)) return false;
  if (k !== "team" && f.team.length && !f.team.includes(i.team)) return false;
  if (k !== "quarter" && f.quarter.length && !f.quarter.includes(i.quarter)) return false;
  if (k !== "moved" && f.moved.length && !i.moved.some(t => f.moved.includes(t))) return false;
  if (k !== "period" && f.period) { const st = periodState(f.period, i.dt); if (st === "out" || (st === "undated" && !f.period.undated)) return false; }
  if (k !== "cell" && f.cell.length && !f.cell.includes(i.cell)) return false;
  if (k !== "decl" && f.decl.length && !f.decl.includes(i.decl)) return false;
  for (const [dim, vals] of Object.entries(f.dims)) if (dim !== d && vals.length && !vals.includes(i.r.dims[dim])) return false;
  if (f.saved && !f.saved.includes(i.id)) return false;
  if (f.text) for (const w of f.text.toLowerCase().split(/\s+/).filter(Boolean)) if (!i.text.includes(w)) return false;
  return true;
}

export const toggle = <T,>(a: T[], v: T) => (a.includes(v) ? a.filter(x => x !== v) : [...a, v]);
export const countBy = (items: Item[], key: (i: Item) => string) => { const m = new Map<string, number>(); for (const i of items) m.set(key(i), (m.get(key(i)) ?? 0) + 1); return m; };
export const byStatus = (items: Item[]): Record<ExecStatus, number> => { const o = { green: 0, amber: 0, red: 0, idle: 0, unknown: 0, done: 0 } as Record<ExecStatus, number>; for (const i of items) o[i.status]++; return o; };
export const SHOWN: ExecStatus[] = ["green", "amber", "red", "unknown", "idle", "done"];

/** The filter chips: what is applied, and how to remove it. */
export function chipsOf(f: XF, change: (n: XF) => void, fieldLabel?: string): { label: string; clear(): void }[] {
  const out: { label: string; clear(): void }[] = [];
  f.status.forEach(s => out.push({ label: STATUS_NAME[s], clear: () => change({ ...f, status: f.status.filter(x => x !== s) }) }));
  f.state.forEach(s => out.push({ label: "State: " + s, clear: () => change({ ...f, state: f.state.filter(x => x !== s) }) }));
  Object.entries(f.dims).forEach(([k, vs]) => vs.forEach(v => out.push({ label: `${dimLabel(k)}: ${v}`, clear: () => change({ ...f, dims: { ...f.dims, [k]: vs.filter(x => x !== v) } }) })));
  f.team.forEach(s => out.push({ label: "Team: " + s, clear: () => change({ ...f, team: f.team.filter(x => x !== s) }) }));
  f.quarter.forEach(s => out.push({ label: "Go-live: " + s, clear: () => change({ ...f, quarter: f.quarter.filter(x => x !== s) }) }));
  f.moved.forEach(s => out.push({ label: "Go-live: " + s.toLowerCase(), clear: () => change({ ...f, moved: f.moved.filter(x => x !== s) }) }));
  f.decl.forEach(s => out.push({ label: "RAG: " + s.toLowerCase(), clear: () => change({ ...f, decl: f.decl.filter(x => x !== s) }) }));
  if (f.period) out.push({ label: "Period: " + periodLabel(f.period, fieldLabel), clear: () => change({ ...f, period: undefined }) });
  f.cell.forEach(c => { const [o, d] = c.split("|"); out.push({ label: `Owner ${o[0].toUpperCase() + o.slice(1)} · Data ${STATUS_NAME[d as ExecStatus]}`, clear: () => change({ ...f, cell: f.cell.filter(x => x !== c) }) }); });
  if (f.saved) out.push({ label: "Saved filter: " + (f.savedName ?? ""), clear: () => change({ ...f, saved: undefined, savedName: undefined }) });
  if (f.text) out.push({ label: `Search: “${f.text}”`, clear: () => change({ ...f, text: "" }) });
  return out;
}
export { dimFields, dimLabel };
