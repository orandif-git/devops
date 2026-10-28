import { EpicRecord } from "./types";
import { GanttRow } from "./timeline";

/** The statistics that can be shown above the Epic Gantt. The administrator chooses the default ones; each person can adjust them in a saved view. */
export const TILES: { id: string; label: string; hint: string }[] = [
  { id: "epics", label: "Epics in view", hint: "Epics drawn in this period" },
  { id: "progress", label: "Portfolio progress", hint: "Average % complete (progress sources of the Executive settings); without them, the share of Epics completed" },
  { id: "ok", label: "On track", hint: "In progress and not past the target date" },
  { id: "late", label: "Late", hint: "Target date passed and not completed" },
  { id: "new", label: "Not started", hint: "Not started and not yet late" },
  { id: "done", label: "Completed", hint: "Completed Epics" },
  { id: "due30", label: "Due in 30 days", hint: "Target date within the next 30 days, not completed" },
  { id: "hold", label: "On hold", hint: "On hold, blocked or deferred" },
  { id: "slip", label: "Average slip", hint: "Average days past the target date of the late Epics" },
  { id: "nodates", label: "Without dates", hint: "Epics in view with no start or target date" },
  { id: "duration", label: "Average duration", hint: "Average days from start to target date" },
  { id: "hours", label: "Total hours", hint: "Hours booked on these Epics in the period" },
];
export const DEFAULT_TILES = ["epics", "progress", "ok", "late", "due30", "hold"];
export const cleanTiles = (v: unknown, fb = DEFAULT_TILES): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && TILES.some(t => t.id === x)) : fb);

const DAY = 86400000;
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const open = (r: GanttRow) => r.category !== "done" && r.category !== "removed";

/** Filter keys: "s:<state>" (a state of the key) or "t:<tile>" (a statistic). An Epic passes when it matches any selected key. */
export function matchesKey(r: GanttRow, key: string, today: string): boolean {
  if (key.startsWith("s:")) return (r.epic.state || "(no state)") === key.slice(2);
  switch (key) {
    case "t:late": return r.late;
    case "t:ok": return r.category === "active" && !r.late;
    case "t:new": return r.category === "new" && !r.late;
    case "t:done": return r.category === "done";
    case "t:hold": return r.category === "hold";
    case "t:due30": return open(r) && r.end >= today && days(today, r.end) <= 30;
    default: return false;
  }
}
export const passes = (r: GanttRow, keys: string[], today: string) => !keys.length || keys.some(k => matchesKey(r, k, today));

export interface TileValue { value: string; detail: string; filter?: string }
export function epicTiles(rows: GanttRow[], inView: EpicRecord[], today: string, progress: (e: EpicRecord) => number | undefined): Record<string, TileValue> {
  const n = (f: (r: GanttRow) => boolean) => rows.filter(f).length;
  const prog = rows.map(r => progress(r.epic)).filter((x): x is number => typeof x === "number");
  const late = rows.filter(r => r.late), dated = rows.filter(r => !r.derived);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : undefined);
  const pct = prog.length ? avg(prog) : rows.length ? Math.round(n(r => r.category === "done") / rows.length * 100) : undefined;
  const slip = avg(late.map(r => Math.max(0, days(r.end, today)))), dur = avg(dated.map(r => days(r.start, r.end) + 1));
  return {
    epics: { value: String(rows.length), detail: "in this period" },
    progress: { value: pct === undefined ? "–" : pct + " %", detail: prog.length ? `average of ${prog.length} Epics with progress` : "share of Epics completed" },
    ok: { value: String(n(r => matchesKey(r, "t:ok", today))), detail: "in progress, not late", filter: "t:ok" },
    late: { value: String(late.length), detail: "past the target date", filter: "t:late" },
    new: { value: String(n(r => matchesKey(r, "t:new", today))), detail: "not started", filter: "t:new" },
    done: { value: String(n(r => r.category === "done")), detail: "completed", filter: "t:done" },
    due30: { value: String(n(r => matchesKey(r, "t:due30", today))), detail: "target within 30 days", filter: "t:due30" },
    hold: { value: String(n(r => r.category === "hold")), detail: "on hold or deferred", filter: "t:hold" },
    slip: { value: slip === undefined ? "–" : slip + " d", detail: "average days past target", filter: "t:late" },
    nodates: { value: String(inView.filter(e => !e.start && !e.target).length), detail: "no start or target date" },
    duration: { value: dur === undefined ? "–" : dur + " d", detail: "start to target date" },
    hours: { value: Math.round(rows.reduce((a, r) => a + r.hours, 0)).toLocaleString() + " h", detail: "booked in the period" },
  };
}
