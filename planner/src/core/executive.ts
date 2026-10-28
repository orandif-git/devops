import { AvailabilityLike, buildPeople, cellOf, noFilters } from "./model";
import { GridDone, progressOf } from "./progress";
import { Booking, EpicRecord, PlannerSettings } from "./types";
import { Hist, signed, summarize } from "./history";

export type ExecStatus = "green" | "amber" | "red" | "idle" | "unknown" | "done";
export const STATUS_NAME: Record<ExecStatus, string> = { green: "On track", amber: "Needs attention", red: "At risk", idle: "Not started", unknown: "Not assessed", done: "Done" };
export const STATUS_ORDER: Record<ExecStatus, number> = { red: 0, amber: 1, green: 2, unknown: 3, idle: 4, done: 5 };
export const NO_VALUE = "(none)";
/** The fields that classify Epics: the chosen category fields, or the area path when none are chosen. */
export const dimFields = (s: PlannerSettings) => (s.executive.categoryFields.length ? s.executive.categoryFields : ["System.AreaPath"]);
export const dimLabel = (f: string) => (f === "System.AreaPath" ? "Area" : (f.split(".").pop() ?? f).replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " "));
const areaOf = (e: EpicRecord) => e.areaPath.split("\\").slice(1).join(" › ") || e.areaPath;

export interface ExecEpic {
  epic: EpicRecord;
  /** value of each category field ("(none)" when empty) */
  dims: Record<string, string>;
  start?: number;
  goLive?: number;
  pct?: number;
  pctFrom?: string;
  /** share of the planned time used (can pass 1) */
  elapsed?: number;
  forecast?: number;
  /** forecast minus go-live, in days (0 when not forecast) */
  slip: number;
  /** people booked over capacity on this Epic this month */
  over: string[];
  late: boolean;
  hold: boolean;
  status: ExecStatus;
  reasons: string[];
  /** 0–100, null when not assessed */
  conf: number | null;
}

const DAY = 86400000;
const ts = (v?: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v ?? ""); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : undefined; };
const has = (list: string[], v: string) => list.some(x => x.toLowerCase() === v.trim().toLowerCase());
export const dayText = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export interface ExecResult { rows: ExecEpic[]; ignored: number; noGoLive: number; noProgress: number }

/** Status, forecast and confidence of every Epic, from its dates, state, progress and the people booked over capacity. Pure: `today` is a parameter. */
export function buildExec(p: { epics: EpicRecord[]; gridDone: Record<number, Record<string, GridDone | undefined>>; bookings: Booking[]; avail: AvailabilityLike; settings: PlannerSettings; today?: Date; /** the go-live date history of each Epic, when it was read */ history?: Record<number, Hist> }): ExecResult {
  const s = p.settings, x = s.executive;
  const today = Date.UTC((p.today ?? new Date()).getUTCFullYear(), (p.today ?? new Date()).getUTCMonth(), (p.today ?? new Date()).getUTCDate());
  const month = new Date(today).toISOString().slice(0, 7);
  // who is over capacity this month, and on which Epics they have hours
  const overBy = new Map<number, string[]>();
  const people = buildPeople(p.bookings, p.epics, p.avail, [month], noFilters());
  for (const pp of people) if (cellOf(pp, month, s.thresholds).band === "over") for (const e of pp.epics[month] ?? []) overBy.set(e.epicId, [...(overBy.get(e.epicId) ?? []), pp.name]);
  let ignored = 0, noGoLive = 0, noProgress = 0;
  const rows: ExecEpic[] = [];
  for (const e of p.epics) {
    if (has(x.ignoreStates, e.state)) { ignored++; continue; }
    const dims: Record<string, string> = {};
    for (const f of dimFields(s)) dims[f] = (f === "System.AreaPath" ? areaOf(e) : (e.extra[f] ?? "").trim()) || NO_VALUE;
    const start = ts(e.start);
    const goLive = ts(x.goLiveField ? e.extra[x.goLiveField] : e.target);
    const pr = progressOf(e, x, p.gridDone[e.id], s.sources);
    const row: ExecEpic = { epic: e, dims, start, goLive, pct: pr?.pct, pctFrom: pr?.from, slip: 0, over: overBy.get(e.id) ?? [], late: false, hold: has(x.holdStates, e.state), status: "unknown", reasons: [], conf: null };
    const reasons = row.reasons;
    if (goLive === undefined) noGoLive++;
    if (pr === undefined) noProgress++;
    if (has(x.doneStates, e.state)) { row.status = "done"; row.conf = 100; row.pct = 100; reasons.push("Delivered"); rows.push(row); continue; }
    if (has(x.notStartedStates, e.state) || (start !== undefined && start > today)) { row.status = "idle"; reasons.push(start !== undefined && start > today ? `Starts ${dayText(start)}` : "Not started"); rows.push(row); continue; }
    if (goLive === undefined) { row.status = "unknown"; reasons.push("No go-live date, so the risk cannot be assessed"); rows.push(row); continue; }
    row.late = today > goLive;
    const dur = start !== undefined ? goLive - start : undefined;
    const used = start !== undefined && dur! > 0 ? today - start : undefined;
    if (used !== undefined) row.elapsed = used / dur!;
    const prog = pr ? pr.pct / 100 : undefined;
    const gap = row.elapsed !== undefined && prog !== undefined ? Math.round((row.elapsed - prog) * 100) : 0;
    if (prog !== undefined && prog > 0 && row.elapsed !== undefined && row.elapsed * 100 >= x.minElapsedPct && start !== undefined) { row.forecast = start + used! / prog; row.slip = Math.round((row.forecast - goLive) / DAY); }
    let score = 0;
    if (row.late) { score = 2; reasons.push(`Past its go-live date by ${Math.round((today - goLive) / DAY)} days and not done`); }
    if (row.hold) { score = Math.max(score, 1); reasons.push("On hold"); }
    if (!row.late && row.slip > x.slipRedDays) { score = 2; reasons.push(`Forecast finish ${dayText(row.forecast!)} is ${row.slip} days after go-live`); }
    else if (!row.late && row.slip > x.slipAmberDays) { score = Math.max(score, 1); reasons.push(`Forecast finish ${dayText(row.forecast!)} is ${row.slip} days after go-live`); }
    if (!row.late && gap > x.gapRedPts) { score = 2; reasons.push(`Progress ${pr!.pct}% against ${Math.round(row.elapsed! * 100)}% of the time used`); }
    else if (!row.late && gap > x.gapAmberPts) { score = Math.max(score, 1); reasons.push(`Progress ${pr!.pct}% against ${Math.round(row.elapsed! * 100)}% of the time used`); }
    const hs = p.history?.[e.id] ? summarize(p.history[e.id], today, s.history.windowDays) : undefined;
    if (hs && s.history.affectStatus && hs.recent >= s.history.movesAmber) { score = Math.max(score, 1); reasons.push(`Go-live date moved ${hs.recent} times in the last ${s.history.windowDays} days (${signed(hs.net)} days against the original date)`); }
    if (row.over.length) { score = Math.max(score, 1); reasons.push(`${row.over.length} ${row.over.length > 1 ? "people are" : "person is"} booked over capacity on this Epic this month`); }
    if (prog === undefined && !row.late && !row.hold) { row.status = "unknown"; reasons.unshift("No progress value, so only the dates can be checked"); if (!row.over.length) { rows.push(row); continue; } }
    row.status = score === 2 ? "red" : score === 1 ? "amber" : prog === undefined ? "unknown" : "green";
    row.conf = row.late ? 4 : Math.max(5, Math.min(99, Math.round(97 - Math.max(0, row.slip) * .45 - Math.max(0, gap) * .4 - row.over.length * 6 - (row.hold ? 20 : 0))));
    if (row.status === "green") reasons.push(pr ? `Progress ${pr.pct}% against ${row.elapsed !== undefined ? Math.round(row.elapsed * 100) + "% of the time used" : "no start date to compare with"}` : "On track");
    rows.push(row);
  }
  return { rows, ignored, noGoLive, noProgress };
}

export const likely = (r: ExecEpic, x: PlannerSettings["executive"]) => r.conf !== null && r.conf >= x.likelyPct;
