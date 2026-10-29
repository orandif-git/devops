import { ExecEpic, ExecStatus } from "./executive";

/** The portfolio at one moment of a week: counts by status and a few measures, kept to show how things change week by week. */
export interface Snapshot {
  week: string; at: string; total: number; progress: number; late: number; due30: number; hold: number;
  green: number; amber: number; red: number; idle: number; unknown: number; done: number;
  /** worked out afterwards from the work item history, not recorded at the time */
  rebuilt?: boolean;
}
export type Metric = Exclude<keyof Snapshot, "week" | "at" | "rebuilt">;
const DAY = 86400000;

/** The Monday (YYYY-MM-DD, UTC) of the week a day falls in. */
export function weekKey(d: Date): string {
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), dow = (new Date(t).getUTCDay() + 6) % 7;
  return new Date(t - dow * DAY).toISOString().slice(0, 10);
}

export function metricsOf(rows: ExecEpic[], now: Date): Snapshot {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()), c = { green: 0, amber: 0, red: 0, idle: 0, unknown: 0, done: 0 } as Record<ExecStatus, number>;
  let late = 0, hold = 0, due30 = 0, sum = 0, n = 0;
  for (const r of rows) {
    c[r.status]++;
    if (r.pct !== undefined) { sum += r.pct; n++; }
    if (r.status === "done") continue;
    if (r.late) late++;
    if (r.hold) hold++;
    if (r.goLive !== undefined && r.goLive >= today && r.goLive <= today + 30 * DAY) due30++;
  }
  return { week: weekKey(now), at: now.toISOString(), total: rows.length, progress: n ? Math.round(sum / n) : 0, late, due30, hold, ...c };
}

/** Put the current week's snapshot into the list (replacing that week's earlier one), oldest first, keeping the last `keep` weeks. */
export function mergeSnapshot(list: Snapshot[], cur: Snapshot, keep = 26): Snapshot[] {
  return [...list.filter(s => s.week !== cur.week), cur].sort((a, b) => a.week.localeCompare(b.week)).slice(-keep);
}

/** The last `n` weeks of one measure, oldest first. */
export const series = (list: Snapshot[], m: Metric, n = 8): number[] => list.slice(-n).map(s => s[m]);
/** This week against the week before it (undefined when there is no earlier week yet). */
export function deltaOf(list: Snapshot[], m: Metric): number | undefined {
  if (list.length < 2) return undefined;
  return list[list.length - 1][m] - list[list.length - 2][m];
}
/** Portfolio health: the share of Epics in delivery that are on track or done. */
export const health = (s: Pick<Snapshot, "green" | "amber" | "red" | "unknown" | "done">) => { const act = s.green + s.amber + s.red + s.unknown + s.done; return act ? Math.round(100 * (s.green + s.done) / act) : 0; };
