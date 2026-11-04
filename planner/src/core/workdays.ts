/**
 * "Count days as": calendar days (the default) or working days.
 * A work calendar is the working week (0 = Sunday … 6 = Saturday) plus days off (team days off / holidays).
 * Counting rule: from the start day up to, but not including, the end day. Days after the last known day off count as working.
 */
export type DayCount = "calendar" | "working";
export interface WorkCalendar { working: number[]; off: { start: string; end?: string }[] }
const DAY = 86400000;
const iso = (s: string) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return Date.UTC(y, m - 1, d); };

export const normDayCount = (v: unknown): DayCount => (v === "working" ? "working" : "calendar");

/** A prepared counter: `(from, to) => number of days`, both UTC-midnight timestamps; negative when `to` is before `from`. */
export type DayDiff = (from: number, to: number) => number;
export const calendarDiff: DayDiff = (from, to) => Math.round((to - from) / DAY);

export function workingDiff(cal: WorkCalendar): DayDiff {
  const week = new Set(cal.working.length ? cal.working : [1, 2, 3, 4, 5]);
  const off = cal.off.filter(o => o.start).map(o => [iso(o.start), iso(o.end || o.start)] as [number, number]);
  const isOff = (t: number) => off.some(([a, b]) => t >= a && t <= b);
  const count = (a: number, b: number) => { let n = 0; for (let t = a; t < b; t += DAY) if (week.has(new Date(t).getUTCDay()) && !isOff(t)) n++; return n; };
  return (from, to) => {
    const a = Math.floor(from / DAY) * DAY, b = Math.floor(to / DAY) * DAY;
    return b >= a ? count(a, b) : -count(b, a);
  };
}

/** The counter and the unit words for a setting; calendar days when working days were asked for but no calendar is known. */
export function dayCounter(mode: DayCount | undefined, cal?: WorkCalendar): { diff: DayDiff; working: boolean; unit: (n: number) => string; short: string; text: (n: number) => string } {
  const working = mode === "working" && !!cal;
  const diff = working ? workingDiff(cal!) : calendarDiff;
  const unit = (n: number) => (working ? (n === 1 ? "working day" : "working days") : n === 1 ? "day" : "days");
  return { diff, working, unit, short: working ? "wd" : "d", text: n => `${n} ${unit(n)}` };
}

/** Azure DevOps team capacity → a work calendar: the first team's working week, and the days off of all the teams' sprints. */
export function calendarFromTeams(teams: { workingDays: number[]; iterations: { teamDaysOff: { start: string; end: string }[] }[] }[]): WorkCalendar | undefined {
  const t = teams.find(x => x.workingDays.length);
  if (!t) return undefined;
  return { working: t.workingDays, off: teams.flatMap(x => x.iterations.flatMap(i => i.teamDaysOff)) };
}
