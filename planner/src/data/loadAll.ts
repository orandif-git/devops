import { loadStateGroups } from "./stateGroups";
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
  return { load, epics: load.epics, bookings, tasks, gridDone, stats: sumStats(perStats), perSource, avail, stateGroups, ms: Date.now() - t0, at: new Date().toISOString() };
}

export const monthsFor = (s: PlannerSettings) => monthsOfPeriod(s.period);
export { aggregate };
