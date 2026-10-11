import { CapacityRecord } from "./capacity";
import { ColumnDef, ColumnType, GridConfig } from "./types";
import { keyNorm } from "./keys";
import { DayRange, inRanges, NativeTeam } from "./nativeCapacity";

/**
 * Start date + effort (+ allocation %) → end date and hours per month.
 * The effort fills the person's working days one after the other, up to (hours per day × allocation %) a day;
 * days off, holidays and leave are skipped. The monthly figures always add up to the effort.
 */
export interface ScheduleCols { resource: string; start: string; effort: string; allocation?: string; end: string }

/** Hours a person can work on one day ("YYYY-MM-DD"); 0 on a day off; null when the calendar has no data for that date. */
export interface PersonDays { day(iso: string): number | null }
export interface CalendarResult { days?: PersonDays; error?: string }
/** Looks up the calendar of a person (the value of the Resource cell). */
export type CalendarBook = (resource: unknown) => CalendarResult;

export interface ScheduleResult { end: string; months: Record<string, number>; workingDays: number; error?: string }

const DAY = 86400000;
const MAX_DAYS = 1100;
const parse = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; };
const toIso = (t: number) => new Date(t).toISOString().slice(0, 10);
const round = (n: number) => Math.round(n * 1e6) / 1e6;
const fail = (error: string): ScheduleResult => ({ end: "", months: {}, workingDays: 0, error });

export function scheduleEffort(start: string, effort: number, allocationPct: number, days: PersonDays): ScheduleResult {
  const t0 = parse(start);
  if (Number.isNaN(t0)) return fail("The start date is not a valid date.");
  if (!(effort > 0)) return fail("Effort must be above 0.");
  if (!(allocationPct > 0)) return fail("Allocation % must be above 0.");
  const months: Record<string, number> = {};
  let remaining = effort, end = "", worked = 0, last = "";
  for (let i = 0, t = t0; i < MAX_DAYS && remaining > 1e-9; i++, t += DAY) {
    const date = toIso(t);
    const cap = days.day(date);
    if (cap === null) return fail(`No calendar data for ${date}. The capacity source does not cover that date (for example the yearly iteration ends before it).`);
    const take = Math.min(remaining, (cap * allocationPct) / 100);
    if (take <= 1e-9) continue;
    const month = date.slice(0, 7);
    months[month] = round((months[month] ?? 0) + take);
    remaining = round(remaining - take);
    end = date; last = month; worked++;
  }
  if (remaining > 1e-6) return fail(`The effort does not fit: this person has no (or too few) working hours in the next ${MAX_DAYS} days of the calendar.`);
  // make the months add up to the effort exactly (rounding): the difference goes to the last month
  const sum = round(Object.values(months).reduce((a, b) => a + b, 0));
  if (last && sum !== round(effort)) months[last] = round(months[last] + (effort - sum));
  return { end, months, workingDays: worked };
}

// ---------------- calendars ----------------

const shortName = (v: unknown) => String(v ?? "").replace(/\s*<[^>]*>\s*$/, "").trim() || "This person";

/** Azure DevOps team capacity: team working days, team days off, the person's days off and capacity per day. */
export function nativeCalendarBook(teams: NativeTeam[]): CalendarBook {
  interface Seg { first: number; last: number; work: Set<number>; perDay: number; off: DayRange[] }
  const people = new Map<string, Seg[]>();
  for (const team of teams) {
    const work = new Set(team.workingDays);
    for (const it of team.iterations) {
      if (!it.start || !it.finish) continue;
      for (const m of it.members) {
        const key = keyNorm(m.name);
        if (!key) continue;
        const segs = people.get(key) ?? [];
        segs.push({ first: parse(it.start), last: parse(it.finish), work, perDay: m.capacityPerDay, off: [...it.teamDaysOff, ...m.daysOff] });
        people.set(key, segs);
      }
    }
  }
  return resource => {
    const key = keyNorm(resource);
    if (!key) return { error: "Choose a resource to calculate the end date." };
    const segs = people.get(key);
    if (!segs) return { error: `${shortName(resource)} has no capacity in the Azure DevOps team capacity. Add them under Boards → Sprints → Capacity of a team selected on the Capacity page.` };
    return {
      days: {
        day(iso) {
          const t = parse(iso);
          const dow = new Date(t).getUTCDay();
          let covered = false, hours = 0;
          for (const s of segs) {
            if (t < s.first || t > s.last) continue;
            covered = true;
            if (s.work.has(dow) && !inRanges(t, s.off)) hours += s.perDay;
          }
          return covered ? round(hours) : null;
        },
      },
    };
  };
}

export interface Holiday { start: string; end?: string; name?: string }
/** The extension's own calendar: working week, default hours per day and holidays; people add their own hours per day and leave. */
export interface CalendarSettings { workingDays: number[]; hoursPerDay: number; holidays: Holiday[] }
export const defaultCalendar = (): CalendarSettings => ({ workingDays: [1, 2, 3, 4, 5], hoursPerDay: 8, holidays: [] });

export function registerCalendarBook(records: CapacityRecord[], cal: CalendarSettings): CalendarBook {
  const byKey = new Map(records.map(r => [r.key, r]));
  const work = new Set(cal.workingDays);
  const holidays: DayRange[] = cal.holidays.filter(h => h.start).map(h => ({ start: h.start, end: h.end || h.start }));
  return resource => {
    const key = keyNorm(resource);
    if (!key) return { error: "Choose a resource to calculate the end date." };
    const rec = byKey.get(key);
    if (!rec) return { error: `${shortName(resource)} is not in the Capacity register. Add them on the Capacity page.` };
    const hours = rec.hoursPerDay ?? cal.hoursPerDay;
    const leave = rec.leave ?? [];
    return {
      days: {
        day(iso) {
          const t = parse(iso);
          if (!work.has(new Date(t).getUTCDay()) || inRanges(t, holidays) || inRanges(t, leave)) return 0;
          return hours;
        },
      },
    };
  };
}

// ---------------- applying a schedule to a grid row ----------------

let currentBook: CalendarBook | undefined;
/** The calendar used when rows are recalculated (set once the control has loaded it; until then stored values are kept). */
export const setCalendarBook = (b: CalendarBook | undefined) => { currentBook = b; };
export const hasCalendarBook = () => !!currentBook;

const num = (v: unknown): number | null => {
  if (v === "" || v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

/**
 * Fill the End date and the monthly hours (`_months`) of a row. An incomplete row (no start date or effort) has neither.
 * Without a loaded calendar nothing is changed, so stored values survive. A problem is kept in `_schedErr`.
 */
export function applySchedule(row: Record<string, unknown>, s: ScheduleCols): void {
  const start = String(row[s.start] ?? "").trim();
  const effort = num(row[s.effort]);
  if (!start || effort === null) { row[s.end] = ""; delete row._months; delete row._schedErr; delete row._schedNote; return; }
  if (!currentBook) return;
  const alloc = s.allocation ? num(row[s.allocation]) ?? 100 : 100;
  const cal = currentBook(row[s.resource]);
  row._schedNote = alloc > 100 ? "Allocation above 100%: this person is double-booked." : undefined;
  if (row._schedNote === undefined) delete row._schedNote;
  if (!cal.days) { row[s.end] = ""; row._months = {}; row._schedErr = cal.error ?? "No calendar."; return; }
  const r = scheduleEffort(start, effort, alloc, cal.days);
  row[s.end] = r.end;
  row._months = r.months;
  if (r.error) row._schedErr = r.error; else delete row._schedErr;
}

/** Source rows of a scheduled grid as one pseudo row per person and month (`_month` = first day of the month, `_hours`). */
export function expandMonths<T extends Record<string, unknown>>(rows: T[]): T[] {
  const out: T[] = [];
  for (const r of rows) {
    const months = r._months as Record<string, number> | undefined;
    if (!months) continue;
    for (const [m, h] of Object.entries(months)) out.push({ ...r, _month: `${m}-01`, _hours: h });
  }
  return out;
}

/** Virtual source columns a derived grid can use when its source grid is scheduled. */
export const SCHEDULE_VIRTUAL = [
  { id: "_month", name: "Scheduled month", type: "date" as const },
  { id: "_hours", name: "Scheduled hours", type: "number" as const },
];

/** Make sure the columns a scheduled grid needs exist (re-using existing ones), and point the schedule at them. */
export function withSchedule(g: GridConfig): GridConfig {
  const cols: ColumnDef[] = [...g.columns];
  const sc = g.schedule;
  const ensure = (id: string, make: () => Omit<ColumnDef, "id">, types: ColumnType[], preferred?: string) => {
    const hit = (preferred && cols.find(c => c.id === preferred && types.includes(c.type))) || cols.find(c => c.id === id && types.includes(c.type));
    if (hit) return hit.id;
    let use = id;
    for (let n = 2; cols.some(c => c.id === use); n++) use = id + n;
    cols.push({ ...make(), id: use });
    return use;
  };
  const resource = ensure("resource", () => ({ name: "Resource", type: "identity", required: true }), ["identity", "string"], sc?.resource ?? cols.find(c => c.type === "identity")?.id);
  const start = ensure("startdate", () => ({ name: "Start date", type: "date", required: true }), ["date"], sc?.start);
  const allocation = ensure("allocation", () => ({ name: "Allocation %", type: "number", defaultValue: 100, min: 0 }), ["number"], sc?.allocation);
  const effort = ensure("effort", () => ({ name: "Effort (h)", type: "number", required: true, min: 0, total: "sum" }), ["number"], sc?.effort ?? cols.find(c => c.type === "number" && c.id !== allocation)?.id);
  const end = ensure("enddate", () => ({ name: "End date", type: "date" }), ["date"], sc?.end ?? cols.find(c => c.type === "date" && c.id !== start && /end/i.test(c.id + c.name))?.id);
  return { ...g, columns: cols, schedule: { resource, start, effort, allocation, end } };
}

/**
 * A derived grid built on a grid that is scheduled by dates reads the virtual source columns _month and _hours.
 * Re-point derived columns whose source column no longer exists (e.g. the old Period and Hours columns):
 * date-like KEY columns → _month (grouped by month), aggregated columns → _hours, person columns → the schedule's resource.
 */
export function remapToScheduled(g: GridConfig, source: GridConfig): GridConfig {
  const sc = source.schedule;
  if (!sc) return g;
  const exists = (id: string) => source.columns.some(c => c.id === id);
  const columns = g.columns.map(c => {
    const d = c.derive;
    if (!d || d.source === "_month" || d.source === "_hours") return c;
    const label = `${c.id} ${c.name}`;
    // an aggregate of the effort column would count the whole effort in every month the task touches
    if (d.role === "agg" && (d.source === sc.effort || !exists(d.source))) return { ...c, derive: { ...d, source: "_hours", adjustable: d.adjustable ?? true } };
    if (d.role === "key" && (d.source === sc.start || (!exists(d.source) && (d.bucket || /period|month|date/i.test(label))))) return { ...c, derive: { ...d, source: "_month", bucket: "month" as const } };
    if (!exists(d.source) && /resource|person|name/i.test(label)) return { ...c, derive: { ...d, source: sc.resource } };
    return c;
  });
  return { ...g, columns };
}

/** Does a derived grid still point at columns that a scheduled source replaced (missing columns, the effort or the start date)? */
export const needsScheduledRemap = (g: GridConfig, source: GridConfig | undefined): boolean => {
  const sc = source?.schedule;
  if (!source || !sc) return false;
  return g.columns.some(c => {
    const d = c.derive;
    if (!d || d.source === "_month" || d.source === "_hours") return false;
    return !source.columns.some(x => x.id === d.source) || (d.role === "agg" && d.source === sc.effort) || (d.role === "key" && d.source === sc.start && d.bucket === "month");
  });
};
