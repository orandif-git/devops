import { CapacityRecord } from "./capacity";
import { keyNorm } from "./keys";

/** Azure DevOps team capacity (Boards → Sprints → Capacity), reduced to what we need. Dates are "YYYY-MM-DD" (inclusive). */
export interface DayRange { start: string; end: string }
export interface NativeMember {
  /** "Display Name <sign-in address>" */
  name: string;
  /** sum of the person's activity capacities, hours per working day */
  capacityPerDay: number;
  daysOff: DayRange[];
}
export interface NativeIteration { name?: string; start: string; finish: string; teamDaysOff: DayRange[]; members: NativeMember[] }
export interface NativeTeam {
  teamName?: string;
  /** 0 = Sunday … 6 = Saturday (the team's working days from its settings) */
  workingDays: number[];
  iterations: NativeIteration[];
}

const DAY = 86400000;
const parse = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return Date.UTC(y, m - 1, d); };
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const inRanges = (t: number, ranges: DayRange[]) => ranges.some(r => t >= parse(r.start) && t <= parse(r.end));

export const WEEKDAYS: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
/** The API returns day names ("monday") or numbers depending on the version. */
export const normalizeWorkingDays = (days: unknown[]): number[] =>
  days.map(d => (typeof d === "number" ? d : WEEKDAYS[String(d).toLowerCase()])).filter((d): d is number => d !== undefined && d >= 0 && d <= 6);

/** Convert any date-ish value to "YYYY-MM-DD" (UTC). */
export const toIsoDate = (d: unknown): string => { const t = new Date(d as string); return isNaN(t.getTime()) ? "" : t.toISOString().slice(0, 10); };

/**
 * Hours available per person and month:
 *   every working day of the iteration that is not a team day off or the person's own day off  →  + capacity per day
 * Months only partly covered by an iteration get partial hours (the iteration is expected to span whole months, e.g. a year).
 * A person in several teams / iterations gets the SUM. Months a person is fully off are 0 (a real value), months outside any
 * iteration have no value at all.
 */
export function recordsFromNative(teams: NativeTeam[]): CapacityRecord[] {
  const people = new Map<string, CapacityRecord>();
  for (const team of teams) {
    const work = new Set(team.workingDays);
    for (const it of team.iterations) {
      if (!it.start || !it.finish) continue;
      const first = parse(it.start), last = parse(it.finish);
      for (const m of it.members) {
        const key = keyNorm(m.name);
        if (!key) continue;
        const rec = people.get(key) ?? { key, name: m.name, defaultHours: null, overrides: {} };
        people.set(key, rec);
        for (let t = first; t <= last; t += DAY) {
          const month = iso(t).slice(0, 7);
          if (rec.overrides[month] === undefined) rec.overrides[month] = 0;          // covered month: at least 0, never "unknown"
          if (!work.has(new Date(t).getUTCDay())) continue;
          if (inRanges(t, it.teamDaysOff) || inRanges(t, m.daysOff)) continue;
          rec.overrides[month] = Math.round((rec.overrides[month] + m.capacityPerDay) * 100) / 100;
        }
      }
    }
  }
  return Array.from(people.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export interface NativeReport { team: string; iterations: number; members: number; messages: string[] }

/** Human readable checks, shown in the hub so a manager can see why a person has no capacity. */
export function reportNative(teams: NativeTeam[]): NativeReport[] {
  return teams.map(t => {
    const messages: string[] = [];
    const people = new Set(t.iterations.flatMap(i => i.members.map(m => keyNorm(m.name))));
    if (!t.iterations.length) messages.push("This team has no iterations. Add the yearly iteration to the team (Project settings → Team configuration → Iterations).");
    if (!t.workingDays.length) messages.push("The team has no working days set (Team settings → Working days).");
    t.iterations.forEach(i => {
      if (!i.start || !i.finish) messages.push(`Iteration “${i.name ?? "?"}” has no start/finish dates.`);
      else if (!i.members.length) messages.push(`Iteration “${i.name ?? "?"}” has no capacity entered (Boards → Sprints → Capacity).`);
      else {
        const zero = i.members.filter(m => !m.capacityPerDay).map(m => m.name.split(" <")[0]);
        if (zero.length) messages.push(`Iteration “${i.name ?? "?"}”: no hours per day for ${zero.join(", ")}.`);
      }
    });
    return { team: t.teamName ?? "", iterations: t.iterations.length, members: people.size, messages };
  });
}
