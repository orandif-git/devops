import { buildExec } from "./executive";
import { metricsOf, Snapshot, weekKey } from "./snapshots";
import { EpicRecord, PlannerSettings } from "./types";

/**
 * Epics as they were on an earlier day, rebuilt from the work item history, so the trend lines and the change since last week exist from the first day.
 * A point is the value of every tracked field from that moment on.
 */
export interface Point { at: string; v: Record<string, string> }
export type Timelines = Record<number, Point[]>;
const DAY = 86400000;
const day = (v: unknown): string | undefined => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(typeof v === "string" ? v : ""); return m ? m[1] : undefined; };

/** The fields the status depends on: state, the dates, the progress fields, the declared status and the blocker flag. */
export function trackedFields(s: PlannerSettings): string[] {
  const x = s.executive, f = ["System.State", s.epicStartField, s.epicTargetField, x.goLiveField, x.declaredField, x.blockerField, ...x.progress.flatMap(p => (p.kind === "percentField" ? [p.field] : p.kind === "ratioFields" ? [p.doneField, p.totalField] : []))];
  return Array.from(new Set(f.filter((v): v is string => !!v)));
}

/** Add revisions (any order) to the timelines; a revision that changes none of the tracked fields adds no point. */
export function addRevisions(prev: Timelines, revs: { id: number; at: string; v: Record<string, string> }[]): Timelines {
  const out: Timelines = {};
  for (const [id, pts] of Object.entries(prev)) out[+id] = pts.map(p => ({ at: p.at, v: { ...p.v } }));
  for (const r of [...revs].sort((a, b) => a.id - b.id || a.at.localeCompare(b.at))) {
    const list = (out[r.id] ??= []), last = list[list.length - 1];
    if (last && r.at <= last.at) continue;                            // already read
    if (last && Object.keys(r.v).every(k => last.v[k] === r.v[k])) continue;
    list.push({ at: r.at, v: { ...(last?.v ?? {}), ...r.v } });
  }
  return out;
}

/** The Epic as it was at `moment`, or undefined when it did not exist yet. */
export function epicAsOf(base: EpicRecord, pts: Point[] | undefined, moment: string, s: PlannerSettings): EpicRecord | undefined {
  let p: Point | undefined;
  for (const q of pts ?? []) { if (q.at <= moment) p = q; else break; }
  if (!p) return undefined;
  const extra: Record<string, string> = { ...base.extra };
  for (const [k, v] of Object.entries(p.v)) if (k !== "System.State") extra[k] = v;
  return { ...base, state: p.v["System.State"] ?? base.state, start: day(p.v[s.epicStartField]), target: day(p.v[s.epicTargetField]), extra, changed: p.at };
}

/** The Mondays of the `n` weeks before the week of `now`, oldest first. */
export function previousWeeks(now: Date, n = 8): string[] {
  const cur = Date.parse(weekKey(now) + "T00:00:00Z");
  return Array.from({ length: n }, (_, k) => new Date(cur - (n - k) * 7 * DAY).toISOString().slice(0, 10));
}

/** One snapshot for each of the given weeks, as it would have been on that Sunday evening. Only the weeks with at least one Epic are returned. */
export function backfillSnapshots(p: { epics: EpicRecord[]; timelines: Timelines; settings: PlannerSettings; weeks: string[] }): Snapshot[] {
  const none = { records: [], hours: () => null, team: () => "" }, out: Snapshot[] = [];
  for (const w of p.weeks) {
    const sunday = new Date(Date.parse(w + "T00:00:00Z") + 6 * DAY), moment = new Date(Date.parse(w + "T00:00:00Z") + 7 * DAY - 1).toISOString();
    const epics = p.epics.map(e => epicAsOf(e, p.timelines[e.id], moment, p.settings)).filter((e): e is EpicRecord => !!e);
    if (!epics.length) continue;
    const rows = buildExec({ epics, gridDone: {}, bookings: [], avail: none, settings: p.settings, today: sunday }).rows;
    out.push({ ...metricsOf(rows, sunday), week: w, at: moment, rebuilt: true });
  }
  return out;
}
