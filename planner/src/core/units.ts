import { PersonRow } from "./model";
import { PlanUnits } from "./types";

/** How the plan shows a person's month: hours, share of the available hours, or FTE (hours ÷ available hours). */
export type Units = PlanUnits;
export const UNIT_LABEL: Record<Units, string> = { h: "Hours", p: "% of capacity", f: "FTE" };
const r1 = (n: number) => Math.round(n * 10) / 10;

/** The number in a cell. Empty when nothing is booked; without capacity only hours can be shown. */
export function cellText(u: Units, hours: number, available: number | null): string {
  if (!hours) return "";
  if (u === "h") return String(Math.round(hours));
  if (!available) return "?";
  return u === "p" ? `${Math.round(hours / available * 100)}%` : (hours / available).toFixed(2);
}

/** The Total column: all hours of the period, or their share of / ratio to all available hours of the period. */
export function totalText(u: Units, hours: number, available: number): string {
  if (u === "h") return `${Math.round(hours).toLocaleString()} h`;
  if (!(available > 0)) return "–";
  return u === "p" ? `${Math.round(hours / available * 100)}%` : `${(hours / available).toFixed(2)} FTE`;
}

export interface EpicLine { epicId: number; byMonth: Record<string, number>; total: number }

/** The Epics behind a person's hours in the months shown, the one with the most hours first. */
export function epicLines(pp: PersonRow, months: string[]): EpicLine[] {
  const by = new Map<number, EpicLine>();
  for (const m of months) for (const e of pp.epics[m] ?? []) {
    const l = by.get(e.epicId) ?? { epicId: e.epicId, byMonth: {}, total: 0 };
    l.byMonth[m] = r1((l.byMonth[m] ?? 0) + e.hours); l.total = r1(l.total + e.hours);
    by.set(e.epicId, l);
  }
  return Array.from(by.values()).sort((a, b) => b.total - a.total || a.epicId - b.epicId);
}

/** A person's hours and available hours over the months shown. */
export function periodSums(pp: PersonRow, months: string[]): { hours: number; available: number } {
  let hours = 0, available = 0;
  for (const m of months) { hours += pp.hours[m] ?? 0; available += pp.available[m] ?? 0; }
  return { hours: r1(hours), available: r1(available) };
}
