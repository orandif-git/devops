import { toCsv } from "../../../src/core/csv";
import { Band, bandOf, utilization } from "./aggregate";
import { Booking, EpicRecord, Thresholds } from "./types";

/** Available hours and teams, as the capacity reader provides them. */
export interface AvailabilityLike {
  records: { key: string; name: string }[];
  hours(person: string, month: string): number | null;
  team(person: string): string;
}

export interface Filters {
  /** only people of this capacity team ("" = all) */
  team: string;
  /** only Epics in these states (empty = all) */
  states: string[];
  /** only Epics whose extra field has one of these values: { "Custom.BU": ["NFR"] } */
  extra: Record<string, string[]>;
  /** part of a name */
  search: string;
  /** keep people who have capacity but no hours in the period */
  showIdle: boolean;
}
export const noFilters = (): Filters => ({ team: "", states: [], extra: {}, search: "", showIdle: true });

export interface PersonRow {
  key: string;
  name: string;
  team: string;
  hours: Record<string, number>;
  available: Record<string, number | null>;
  epics: Record<string, { epicId: number; hours: number }[]>;
}

export const NO_TEAM = "No team capacity entered";
const round = (n: number) => Math.round(n * 100) / 100;
export const shortName = (n: string) => n.replace(/\s*<[^>]*>\s*$/, "").trim() || n;

/** The Epics that pass the state and extra-field filters. */
export function epicsInView(epics: EpicRecord[], f: Filters): Set<number> {
  const ok = new Set<number>();
  for (const e of epics) {
    if (f.states.length && !f.states.includes(e.state)) continue;
    let pass = true;
    for (const [field, vals] of Object.entries(f.extra)) if (vals.length && !vals.includes(e.extra[field] ?? "")) { pass = false; break; }
    if (pass) ok.add(e.id);
  }
  return ok;
}

/** One row per person: booked hours, available hours and the Epics behind each month, for the months and filters given. */
export function buildPeople(bookings: Booking[], epics: EpicRecord[], avail: AvailabilityLike, months: string[], f: Filters): PersonRow[] {
  const keep = new Set(months);
  const inView = epicsInView(epics, f);
  const rows = new Map<string, PersonRow>();
  const row = (key: string, name: string): PersonRow => {
    let r = rows.get(key);
    if (!r) { r = { key, name, team: avail.team(key) || NO_TEAM, hours: {}, available: {}, epics: {} }; for (const m of months) r.available[m] = avail.hours(key, m); rows.set(key, r); }
    else if (/<[^>]+>/.test(name) && !/<[^>]+>/.test(r.name)) r.name = name;
    return r;
  };
  for (const rec of avail.records) row(rec.key, rec.name);
  for (const b of bookings) {
    if (!keep.has(b.month) || !inView.has(b.epicId)) continue;
    const r = row(b.person, b.personName);
    r.hours[b.month] = round((r.hours[b.month] ?? 0) + b.hours);
    const list = r.epics[b.month] ?? (r.epics[b.month] = []);
    const hit = list.find(x => x.epicId === b.epicId);
    if (hit) hit.hours = round(hit.hours + b.hours); else list.push({ epicId: b.epicId, hours: round(b.hours) });
  }
  const q = f.search.trim().toLowerCase();
  return Array.from(rows.values())
    .filter(r => (!f.team || r.team === f.team) && (!q || r.name.toLowerCase().includes(q)) && (f.showIdle || Object.keys(r.hours).length > 0))
    .sort((a, b) => (a.team === NO_TEAM ? 1 : 0) - (b.team === NO_TEAM ? 1 : 0) || a.team.localeCompare(b.team) || shortName(a.name).localeCompare(shortName(b.name)));
}

export const groupByTeam = (people: PersonRow[]): { team: string; people: PersonRow[] }[] => {
  const out: { team: string; people: PersonRow[] }[] = [];
  for (const p of people) { const g = out[out.length - 1]; if (g && g.team === p.team) g.people.push(p); else out.push({ team: p.team, people: [p] }); }
  return out;
};

/** What a cell shows: the ratio (null = nothing booked and no capacity), the band, or "no capacity" when hours exist but no capacity was entered. */
export function cellOf(p: PersonRow, month: string, t: Thresholds): { hours: number; available: number | null; ratio: number | null; band: Band; noCapacity: boolean } {
  const hours = p.hours[month] ?? 0;
  const available = p.available[month] ?? null;
  const noCapacity = available === null && hours > 0;
  const ratio = noCapacity ? null : available === null ? null : utilization(hours, available);
  return { hours, available, ratio, band: noCapacity ? "none" : bandOf(ratio, t), noCapacity };
}

export interface MonthSummary { hours: number; available: number; utilization: number | null; counts: Record<Band, number>; free: number; over: number; epics: number }
export function monthSummary(people: PersonRow[], month: string, t: Thresholds): MonthSummary {
  const counts: Record<Band, number> = { spare: 0, healthy: 0, full: 0, over: 0, none: 0 };
  let hours = 0, available = 0, free = 0;
  const epics = new Set<number>();
  for (const p of people) {
    const c = cellOf(p, month, t);
    if (c.available === null && c.hours === 0) continue;                       // no capacity and no hours: not part of the picture
    counts[c.band]++;
    hours += c.hours; if (c.available !== null) { available += c.available; free += Math.max(0, c.available - c.hours); }
    for (const e of p.epics[month] ?? []) epics.add(e.epicId);
  }
  return { hours: round(hours), available: round(available), utilization: available > 0 ? hours / available : null, counts, free: round(free), over: counts.over, epics: epics.size };
}

/** The visible matrix as CSV: one row per person and month with hours, available hours and percent. */
export function heatmapCsv(people: PersonRow[], months: string[], t: Thresholds): string {
  const label = { spare: "Spare capacity", healthy: "Healthy", full: "Nearly full", over: "Over capacity", none: "No capacity entered" } as const;
  const rows: unknown[][] = [["Person", "Team", "Month", "Booked hours", "Available hours", "Utilization %", "Band"]];
  for (const p of people) for (const m of months) {
    const c = cellOf(p, m, t);
    if (c.hours === 0 && c.available === null) continue;
    rows.push([shortName(p.name), p.team, m, c.hours, c.available ?? "", c.ratio === null || !isFinite(c.ratio) ? "" : Math.round(c.ratio * 100), label[c.band]]);
  }
  return toCsv(rows);
}
