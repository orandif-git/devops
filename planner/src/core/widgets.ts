import { Band, bandOf } from "./aggregate";
import { buildPeople, cellOf, groupByTeam, monthSummary, noFilters, PersonRow, shortName, AvailabilityLike } from "./model";
import { monthsOfPeriod } from "./period";
import { Booking, EpicRecord, Thresholds } from "./types";

/** What a dashboard widget remembers: which month, which team, which saved query. */
export interface WidgetConfig {
  /** "current", "next" or "YYYY-MM" */
  month: string;
  /** only people of this capacity team ("" = all) */
  team: string;
  /** saved query that limits the Epics ("" = all Epics of the planner's settings) */
  queryId: string;
  /** rows in the over-capacity list */
  top: number;
}
export const defaultWidgetConfig = (): WidgetConfig => ({ month: "current", team: "", queryId: "", top: 10 });

export function parseWidgetConfig(data: string | undefined | null): WidgetConfig {
  const d = defaultWidgetConfig();
  if (!data) return d;
  try {
    const o = JSON.parse(data) as Partial<WidgetConfig>;
    return {
      month: typeof o.month === "string" && /^(current|next|\d{4}-\d{2})$/.test(o.month) ? o.month : d.month,
      team: typeof o.team === "string" ? o.team : d.team,
      queryId: typeof o.queryId === "string" ? o.queryId : d.queryId,
      top: typeof o.top === "number" && o.top >= 1 && o.top <= 50 ? Math.floor(o.top) : d.top,
    };
  } catch { return d; }
}

/** The month a widget shows, as "YYYY-MM". `today` is injectable for tests. */
export function resolveMonth(month: string, today = new Date()): string {
  const months = monthsOfPeriod({ kind: "next12" }, today);
  return month === "current" ? months[0] : month === "next" ? months[1] : month;
}

/** Six months starting at `from`, the span of the team mini-heatmap. */
export function monthRun(from: string, count = 6): string[] {
  const [y, m] = from.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => { const t = y * 12 + m - 1 + i; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; });
}

export interface OverRow { key: string; name: string; team: string; hours: number; available: number | null; ratio: number | null; noCapacity: boolean }
export interface TeamRow { team: string; cells: { month: string; ratio: number | null; band: Band; hours: number; available: number }[] }
export interface WidgetData {
  month: string;
  months: string[];
  tile: { utilization: number | null; hours: number; available: number; free: number; over: number; counts: Record<Band, number>; people: number; band: Band };
  over: OverRow[];
  overTotal: number;
  teams: TeamRow[];
}

/** Everything the three widgets draw, from the planner's loaded data. */
export function widgetData(bookings: Booking[], epics: EpicRecord[], avail: AvailabilityLike, t: Thresholds, cfg: WidgetConfig, today = new Date()): WidgetData {
  const month = resolveMonth(cfg.month, today);
  const months = monthRun(month);
  const all = buildPeople(bookings, epics, avail, months, { ...noFilters(), team: cfg.team });
  const s = monthSummary(all, month, t);
  const overRows: OverRow[] = all.map(p => ({ p, c: cellOf(p, month, t) }))
    .filter(x => x.c.band === "over")
    .sort((a, b) => (b.c.ratio ?? 0) - (a.c.ratio ?? 0) || b.c.hours - a.c.hours)
    .map(x => ({ key: x.p.key, name: shortName(x.p.name), team: x.p.team, hours: x.c.hours, available: x.c.available, ratio: x.c.ratio, noCapacity: false }));
  const teams: TeamRow[] = groupByTeam(all).map(g => ({
    team: g.team,
    cells: months.map(m => { const ms = monthSummary(g.people as PersonRow[], m, t); return { month: m, ratio: ms.utilization, band: ms.utilization === null ? "none" as Band : bandOf(ms.utilization, t), hours: ms.hours, available: ms.available }; }),
  }));
  return {
    month, months,
    tile: { utilization: s.utilization, hours: s.hours, available: s.available, free: s.free, over: s.over, counts: s.counts, people: Object.values(s.counts).reduce((a, b) => a + b, 0), band: s.utilization === null ? "none" : bandOf(s.utilization, t) },
    over: overRows.slice(0, cfg.top), overTotal: overRows.length, teams,
  };
}
