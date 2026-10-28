import { EpicRecord, Task } from "./types";

/** The calendar window the months cover: first day of the first month to last day of the last month ("YYYY-MM-DD"). */
export function windowOf(months: string[]): { start: string; end: string; days: number } {
  const a = months[0] ?? new Date().toISOString().slice(0, 7), z = months[months.length - 1] ?? a;
  const start = `${a}-01`;
  const end = new Date(Date.UTC(+z.slice(0, 4), +z.slice(5, 7), 0)).toISOString().slice(0, 10);
  return { start, end, days: Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1 };
}

/** Position of a date in the window as a percentage (0–100), clipped. */
export const pct = (date: string, w: { start: string; days: number }): number => Math.max(0, Math.min(100, ((Date.parse(date) - Date.parse(w.start)) / 86400000) / w.days * 100));

/** A date range as left / width percentages of the window (the end day is included). null when it does not touch the window. */
export function barOf(start: string, end: string, w: { start: string; end: string; days: number }): { left: number; width: number; clippedStart: boolean; clippedEnd: boolean } | null {
  if (end < w.start || start > w.end) return null;
  const left = pct(start, w), right = pct(end, w) + 100 / w.days;
  return { left, width: Math.max(.4, Math.min(100, right) - left), clippedStart: start < w.start, clippedEnd: end > w.end };
}

export interface Placed { task: Task; lane: number; left: number; width: number }

/** Stack overlapping tasks of one person into lanes (the first lane that is free when the task starts). */
export function layoutTasks(tasks: Task[], w: { start: string; end: string; days: number }): { placed: Placed[]; lanes: number } {
  const sorted = tasks.filter(t => t.end >= w.start && t.start <= w.end).sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  const laneEnd: string[] = [];
  const placed: Placed[] = [];
  for (const task of sorted) {
    let lane = laneEnd.findIndex(e => e < task.start);
    if (lane < 0) { lane = laneEnd.length; laneEnd.push(task.end); } else laneEnd[lane] = task.end;
    const b = barOf(task.start, task.end, w)!;
    placed.push({ task, lane, left: b.left, width: b.width });
  }
  return { placed, lanes: Math.max(1, laneEnd.length) };
}

export type Category = "new" | "active" | "hold" | "done" | "removed" | "other";
/** The state's group in the process (lower-case state name -> "proposed" | "inprogress" | "resolved" | "complete" | "removed"). */
export type StateGroups = Record<string, string>;
/**
 * The state of an Epic as one of a few groups. The process's own state group decides when it is known (so "Delivery Committed",
 * which sits under In Progress, is active); otherwise the state name is matched by words (names differ between processes).
 */
export function categoryOf(state: string, groups: StateGroups = {}): Category {
  const s = state.toLowerCase().trim();
  const hold = /\b(hold|blocked?|paused?|deferred?)\b/.test(s);
  switch (groups[s]) {
    case "removed": return "removed";
    case "complete": case "completed": case "resolved": return "done";
    case "proposed": return "new";
    case "inprogress": return hold ? "hold" : "active";
  }
  if (hold) return "hold";
  if (/\b(cancel+ed|removed|rejected|obsolete|abandoned)\b/.test(s)) return "removed";
  if (/\b(done|closed|completed?|resolved|finished|delivered)\b/.test(s)) return "done";
  if (/\b(new|proposed|to do|todo|backlog|not started|draft)\b/.test(s)) return "new";
  if (/activ|progress|commit|doing|develop|approv|running|open|plan/.test(s)) return "active";
  return "other";
}

/** "f:<field reference name>" groups by the value of an Epic field */
export type GroupBy = "area" | "state" | "team" | "none" | `f:${string}`;
export interface GanttRow { epic: EpicRecord; start: string; end: string; derived: boolean; category: Category; late: boolean; people: number; hours: number; group: string }
export interface GanttInput {
  epics: EpicRecord[];
  bookings: { epicId: number; person: string; month: string; hours: number }[];
  months: string[];
  inView: Set<number>;
  group: GroupBy;
  teamOf(person: string): string;
  /** the process's state groups, when they could be read */
  stateGroups?: StateGroups;
  today: string;
}

/** the group of Epics whose chosen field is empty */
export const NO_VALUE = "(none)";
const monthEnd = (m: string) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).toISOString().slice(0, 10);

/** Epics as bars: from the start-date field to the target-date field (or, when those are empty, from the first to the last month with hours). */
export function buildGantt(i: GanttInput): { name: string; rows: GanttRow[] }[] {
  const w = windowOf(i.months);
  const keep = new Set(i.months);
  const by = new Map<number, { months: string[]; hours: number; people: Map<string, number> }>();
  const none = { months: [] as string[], hours: 0, people: new Map<string, number>() };
  for (const b of i.bookings) {
    const e = by.get(b.epicId) ?? { months: [] as string[], hours: 0, people: new Map<string, number>() };
    e.months.push(b.month);
    if (keep.has(b.month)) { e.hours += b.hours; e.people.set(b.person, (e.people.get(b.person) ?? 0) + b.hours); }
    by.set(b.epicId, e);
  }
  const rows: GanttRow[] = [];
  for (const epic of i.epics) {
    if (!i.inView.has(epic.id)) continue;
    const info = by.get(epic.id) ?? none;
    const ms = [...info.months].sort();
    let start = epic.start ?? "", end = epic.target ?? "", derived = false;
    if (!start && !end) { if (!ms.length) continue; start = `${ms[0]}-01`; end = monthEnd(ms[ms.length - 1]); derived = true; }
    else if (!start) start = end; else if (!end) end = ms.length ? monthEnd(ms[ms.length - 1]) > start ? monthEnd(ms[ms.length - 1]) : start : start;
    if (end < start) end = start;
    if (end < w.start || start > w.end) continue;
    const category = categoryOf(epic.state, i.stateGroups);
    let group = "";
    if (i.group === "area") group = epic.areaPath.split("\\").pop() || epic.areaPath || "(no area)";
    else if (i.group === "state") group = epic.state || "(no state)";
    else if (i.group.startsWith("f:")) group = (epic.extra[i.group.slice(2)] ?? "").trim() || NO_VALUE;
    else if (i.group === "team") { const lead = Array.from(info.people).sort((a, b) => b[1] - a[1])[0]; group = (lead ? i.teamOf(lead[0]) : "") || "No team capacity entered"; }
    rows.push({ epic, start, end, derived, category, late: category !== "done" && category !== "removed" && end < i.today, people: info.people.size, hours: Math.round(info.hours * 100) / 100, group });
  }
  const groups = new Map<string, GanttRow[]>();
  for (const r of rows) groups.set(r.group, [...(groups.get(r.group) ?? []), r]);
  return Array.from(groups, ([name, list]) => ({ name, rows: list.sort((a, b) => a.start.localeCompare(b.start) || a.epic.id - b.epic.id) })).sort((a, b) => (a.name === NO_VALUE ? 1 : 0) - (b.name === NO_VALUE ? 1 : 0) || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/** Prefix sums of row heights and the index range that overlaps [top, bottom]: what a long list needs to draw only what is visible. */
export function visibleRange(heights: number[], top: number, bottom: number, overscan = 6): { from: number; to: number; total: number; offsets: number[] } {
  const offsets: number[] = new Array(heights.length + 1); offsets[0] = 0;
  for (let k = 0; k < heights.length; k++) offsets[k + 1] = offsets[k] + heights[k];
  const total = offsets[heights.length];
  let lo = 0, hi = heights.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (offsets[mid + 1] <= top) lo = mid + 1; else hi = mid; }
  let to = lo; while (to < heights.length && offsets[to] < bottom) to++;
  return { from: Math.max(0, lo - overscan), to: Math.min(heights.length, to + overscan), total, offsets };
}
