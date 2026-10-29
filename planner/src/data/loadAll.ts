import { loadStateGroups } from "./stateGroups";
import { HistoryMap, loadRevisionData } from "./history";
import { backfillSnapshots, Timelines, trackedFields } from "../core/asof";
import { stageSince, stagesOn } from "../core/stages";
import { doneDatesFromField, doneDatesFromTimelines } from "../core/delivery";
import { buildExec } from "../core/executive";
import { metricsOf, Snapshot } from "../core/snapshots";
import { recordSnapshot } from "./snapshots";
import { StateGroups } from "../core/timeline";
import { aggregate } from "../core/aggregate";
import { parseSource, sumStats } from "../core/parseGrid";
import { GridDone, gridDoneOf } from "../core/progress";
import { monthsOfPeriod } from "../core/period";
import { Booking, EpicRecord, ParseStats, PlannerSettings, Task } from "../core/types";
import { Availability, loadAvailability } from "./capacity";
import { loadEpics, LoadProgress, LoadResult } from "./epics";

export interface Loaded {
  load: LoadResult;
  epics: EpicRecord[];
  bookings: Booking[];
  tasks: Task[];
  /** per Epic and grid: how much of the work is ticked done (only for grids with a done column) */
  gridDone: Record<number, Record<string, GridDone | undefined>>;
  stats: ParseStats;
  perSource: { name: string; epics: number; rows: number }[];
  avail: Availability;
  /** state group of each Epic state in the process (empty when it could not be read) */
  stateGroups?: StateGroups;
  /** history of the go-live and target date fields (when switched on in the settings) */
  history?: HistoryMap;
  /** why the history could not be read */
  historyError?: string;
  /** the weekly snapshots of the portfolio (this week last), for the trends and the change since last week */
  snapshots?: Snapshot[];
  /** when each Epic last reached Done (ms), for the delivery performance card; undefined when the source is not available */
  deliveredAt?: Record<number, number>;
  /** when each Epic entered the stage it is in (ms), for time in stage */
  stageSince?: Record<number, number>;
  ms: number;
  at: string;
}

/** Read the Epics, parse every source grid into bookings and read the available hours: everything the planner's views are drawn from. */
export async function loadAll(project: { id: string; name: string }, s: PlannerSettings, opts: { queryId?: string; force?: boolean; progress?: (p: LoadProgress) => void } = {}): Promise<Loaded> {
  const t0 = Date.now();
  const load = await loadEpics(project, s, opts);
  const perStats: ParseStats[] = [];
  const bookings: Booking[] = [];
  const tasks: Task[] = [];
  const gridDone: Loaded["gridDone"] = {};
  const perSource = s.sources.map(g => ({ name: g.name || g.id, epics: 0, rows: 0 }));
  for (const e of load.epics) s.sources.forEach((g, i) => {
    const raw = e.grids[g.id];
    if (!raw) return;
    const r = parseSource(raw, g, e.id, s.estimateUnscheduled);
    if (g.columns.done) { const d = gridDoneOf(raw, g); if (d) (gridDone[e.id] ??= {})[g.id] = d; }
    perStats.push(r.stats); bookings.push(...r.bookings); tasks.push(...r.tasks); perSource[i].epics++; perSource[i].rows += r.stats.rows;
  });
  const [avail, stateGroups] = await Promise.all([loadAvailability(s.capacityTeams, opts.force), loadStateGroups(project.name, s.workItemType)]);
  let history: HistoryMap | undefined, historyError: string | undefined, timelines: Timelines | undefined;
  const hf = Array.from(new Set([s.epicTargetField, s.executive.goLiveField].filter(Boolean)));
  const dv = s.executive.delivery, needTl = s.executive.enabled && (s.history.trendBackfill || (dv.enabled && dv.source === "history") || (stagesOn(s.executive.stages) && s.executive.stages.stuckRule));
  const track = needTl ? trackedFields(s) : [];       // the same read of the revisions also keeps what the earlier weeks of the trend need
  if (s.history.enabled && hf.length) { try { const r = await loadRevisionData(project, s.workItemType, hf, track, { force: opts.force, progress: opts.progress }); history = r.map; timelines = track.length ? r.timelines : undefined; } catch (e) { historyError = (e as Error).message; } }
  const stageSinceMap = timelines && stagesOn(s.executive.stages) ? stageSince(timelines, s.executive.stages) : undefined;        // when each Epic entered its stage
  const exec = buildExec({ stageSince: stageSinceMap, epics: load.epics, gridDone, bookings, avail, settings: s, history: history?.[s.executive.goLiveField || s.epicTargetField] });
  const deliveredAt = s.executive.enabled && dv.enabled ? (dv.source === "field" ? doneDatesFromField(load.epics, dv.dateField) : timelines ? doneDatesFromTimelines(timelines, s.executive.doneStates) : undefined) : undefined;     // when each Epic reached Done
  const snapshots = opts.queryId ? undefined : await recordSnapshot(project.id, metricsOf(exec.rows, new Date()), timelines && s.history.trendBackfill ? async weeks => backfillSnapshots({ epics: load.epics, timelines: timelines!, settings: s, weeks }) : undefined);       // only the whole portfolio is a fair comparison
  return { load, epics: load.epics, bookings, tasks, gridDone, stats: sumStats(perStats), perSource, avail, stateGroups, history, historyError, snapshots, deliveredAt, stageSince: stageSinceMap, ms: Date.now() - t0, at: new Date().toISOString() };
}

export const monthsFor = (s: PlannerSettings) => monthsOfPeriod(s.period);
export { aggregate };
