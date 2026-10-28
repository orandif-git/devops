import { cleanTiles } from "./epicStats";
import { Period, PlanGroup, PlanRows, PlanUnits, PlanView } from "./types";

/** Everything that makes up what a person sees in the Planner: saved in a personal view, or carried in a shared link. */
export interface ViewState {
  view: PlanView; group: PlanGroup; units: PlanUnits;
  /** how much of the plan is open: collapsed, teams open, all open */
  rows: PlanRows;
  period?: Period; team: string; query: string; people: string; epics: string;
  states: string[]; extra: Record<string, string[]>; showIdle: boolean;
  /** Epic Gantt: grouping, selected key / statistic filters and the statistics shown */
  ganttGroup: string; legend: string[]; tiles: string[];
}
export interface SavedView { id: string; name: string; state: ViewState }
export interface ViewDoc { views: SavedView[]; defaultId?: string }

const str = (v: unknown, fb = "") => (typeof v === "string" ? v : fb);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const pick = <T extends string>(v: unknown, ok: readonly T[], fb: T): T => (ok.includes(v as T) ? (v as T) : fb);

/** Make any stored or decoded value a complete, safe view (unknown parts take the given defaults). */
export function normalizeView(raw: unknown, d: ViewState): ViewState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pr = (r.period && typeof r.period === "object" ? r.period : undefined) as Record<string, unknown> | undefined;
  const period: Period | undefined = pr && ["year", "quarter", "last12", "next12", "custom"].includes(str(pr.kind)) ? { kind: pr.kind as Period["kind"], from: str(pr.from) || undefined, to: str(pr.to) || undefined } : d.period;
  const x = (r.extra && typeof r.extra === "object" ? r.extra : {}) as Record<string, unknown>;
  return {
    view: pick(r.view, ["heat", "time", "gantt"], d.view), group: pick(r.group, ["team", "epic", "person"], d.group), units: pick(r.units, ["h", "p", "f"], d.units), rows: pick(r.rows, ["collapsed", "teams", "all"], d.rows),
    period, team: str(r.team), query: str(r.query), people: str(r.people), epics: str(r.epics), states: strs(r.states),
    extra: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, strs(v)]).filter(([, v]) => (v as string[]).length)), showIdle: r.showIdle !== false,
    ganttGroup: typeof r.ganttGroup === "string" && /^f:[A-Za-z][A-Za-z0-9_.]*$/.test(r.ganttGroup) ? r.ganttGroup : pick(r.ganttGroup, ["area", "state", "team", "none"], "area"), legend: strs(r.legend), tiles: cleanTiles(r.tiles, d.tiles),
  };
}

export function normalizeDoc(raw: unknown, d: ViewState): ViewDoc {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const views = (Array.isArray(r.views) ? r.views : []).filter(v => v && typeof v === "object").map((v, i) => {
    const x = v as Record<string, unknown>;
    return { id: str(x.id) || `v${i + 1}`, name: str(x.name).trim() || `View ${i + 1}`, state: normalizeView(x.state, d) };
  });
  const defaultId = str(r.defaultId);
  return { views, defaultId: views.some(v => v.id === defaultId) ? defaultId : undefined };
}

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64 = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));

/** A compact text for a link: only what differs from the defaults is written. */
export function encodeView(s: ViewState, d: ViewState): string {
  const out: Record<string, unknown> = {};
  (Object.keys(s) as (keyof ViewState)[]).forEach(k => { if (JSON.stringify(s[k]) !== JSON.stringify(d[k])) out[k] = s[k]; });
  out.view = s.view;
  return b64(JSON.stringify(out));
}
export function decodeView(text: string, d: ViewState): ViewState | undefined {
  try { return normalizeView(JSON.parse(unb64(text)), d); } catch { return undefined; }
}
export const newViewId = () => "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
