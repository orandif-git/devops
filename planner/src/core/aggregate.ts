import { Booking } from "./types";

export interface PersonMonth { hours: number; epics: Record<number, number> }
export interface Person { key: string; name: string; months: Record<string, PersonMonth> }

/** Prefer a display name that carries the sign-in address ("Name <user>"). */
const better = (a: string, b: string) => (/<[^>]+>/.test(a) || !/<[^>]+>/.test(b) ? a : b);
const round = (n: number) => Math.round(n * 100) / 100;

/** Hours per person and month (and which Epics they come from). Only months in `months` are kept when given. */
export function aggregate(bookings: Booking[], months?: string[]): Map<string, Person> {
  const keep = months ? new Set(months) : undefined;
  const people = new Map<string, Person>();
  for (const b of bookings) {
    if (keep && !keep.has(b.month)) continue;
    let p = people.get(b.person);
    if (!p) { p = { key: b.person, name: b.personName, months: {} }; people.set(b.person, p); } else p.name = better(p.name, b.personName);
    const m = p.months[b.month] ?? (p.months[b.month] = { hours: 0, epics: {} });
    m.hours = round(m.hours + b.hours);
    m.epics[b.epicId] = round((m.epics[b.epicId] ?? 0) + b.hours);
  }
  return people;
}

export const utilization = (hours: number, available: number | null | undefined): number | null =>
  available && available > 0 ? hours / available : hours > 0 ? Infinity : null;

export type Band = "spare" | "healthy" | "full" | "over" | "none";
/** The band of a utilization ratio (1 = 100 %). Thresholds in percent. */
export function bandOf(ratio: number | null, t: { spare: number; healthy: number; full: number }): Band {
  if (ratio === null) return "none";
  const x = ratio * 100;
  return x < t.spare ? "spare" : x <= t.healthy ? "healthy" : x <= t.full ? "full" : "over";
}
