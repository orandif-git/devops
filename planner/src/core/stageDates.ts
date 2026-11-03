import { parseDay } from "./execPeriod";
import { StageSettings, stageDatesOn } from "./stages";

const DAY = 86400000;
export type StageIssueKind = "missing" | "order" | "skipped" | "rework";
export interface StageIssue { kind: StageIssueKind; stage: string; text: string }
/** One stage of one Epic: when it started and ended (from the date fields, the next stage’s start, or the history), how long it took and what looks wrong. */
export interface StageDateRow {
  name: string; idx: number;
  start?: number; end?: number; dur?: number;
  /** the stage the Epic is in now and not finished: it has no end and its duration runs to today */ open?: boolean;
  skipped?: boolean; missing?: boolean; order?: boolean; rework?: boolean;
  /** the start (or end) was not in a date field but read from the work item history */ fromHistory?: boolean; endFromHistory?: boolean;
  /** the stage whose start date is this stage’s end (no “completed” field needed) */ endsWith?: string;
  startField?: string; endField?: string;
  /** the start and end as the date fields (or the next stage) say, before the rework adjustment below clears them */ declaredStart?: number; declaredEnd?: number;
}
export interface StageDatesResult { rows: StageDateRow[]; cur: number; /** the last stage that has a start date */ maxIdx: number; /** days in the current stage, when it is known */ timeInStage?: number; issues: StageIssue[] }

/**
 * The stage dates of an Epic. The stage field says which stage it is in (`curIdx`); the date fields say when each stage started and ended.
 * A stage can end when the next one starts and start when the previous one ends. Missing, out-of-order and skipped dates, and rework (the field is behind the dates) are found, not guessed.
 * `since` is when the Epic entered its current stage according to the history, used when the date is missing and for rework.
 */
export function computeStageDates(p: { st: StageSettings; extra: Record<string, string>; curIdx: number; done: boolean; since?: number; today: number }): StageDatesResult | undefined {
  const { st } = p; if (!stageDatesOn(st)) return undefined;
  const n = st.stages.length, defs = st.stages.map(d => st.dates.stages[d.name]), cur = Math.max(0, Math.min(n - 1, p.curIdx));
  const get = (f?: string) => (f ? parseDay(p.extra[f]) : undefined);
  const rows: StageDateRow[] = st.stages.map((d, i) => ({ name: d.name, idx: i }));
  rows.forEach((r, i) => { const d = defs[i]; if (d?.startMode === "field" && d.start) { r.start = get(d.start); r.startField = d.start; } });
  rows.forEach((r, i) => {
    const d = defs[i]; if (!d) return;
    if (d.endMode === "field" && d.end) { r.end = get(d.end); r.endField = d.end; }
    else if (d.endMode === "next") for (let k = i + 1; k < n; k++) { if (defs[k]?.startMode === "field" && rows[k].start !== undefined) { r.end = rows[k].start; r.endsWith = rows[k].name; break; } }
  });
  rows.forEach((r, i) => { if (defs[i]?.startMode === "prev" && i > 0) r.start = rows[i - 1].end; });
  const maxIdx = rows.reduce((m, r, i) => (r.start !== undefined && r.start <= p.today ? i : m), -1),   // a start date still ahead is a plan, not a stage that has begun
     fallback = st.dates.fallback && p.since !== undefined;

  rows.forEach(r => { r.declaredStart = r.start; r.declaredEnd = r.end; });
  // rework: the field is behind the dates (a later stage already has a start that has passed): time in this stage counts from when the field changed
  const rework = !p.done && cur < maxIdx;
  if (rework) { const r = rows[cur]; r.rework = true; r.end = undefined; if (fallback) { r.start = p.since; r.fromHistory = true; } else r.start = undefined; }
  rows.forEach((r, i) => {
    if (r.start !== undefined || r.rework) return;
    if (i === cur && !p.done) { r.missing = true; if (fallback) { r.start = p.since; r.fromHistory = true; if (i > 0 && rows[i - 1].end === undefined && defs[i - 1]?.endMode === "next") { rows[i - 1].end = p.since; rows[i - 1].endFromHistory = true; } } }
    else if (i < maxIdx) { if (i === 0) r.missing = true; else r.skipped = true; }
  });
  let last: number | undefined;
  rows.forEach(r => { if (r.start === undefined || r.fromHistory || r.rework) return; if (last !== undefined && r.start < last) r.order = true; last = Math.max(last ?? r.start, r.start); });
  rows.forEach(r => {
    if (r.skipped) { r.dur = 0; return; }
    if (r.start === undefined) return;
    let end = r.end; if (r.idx === cur && !p.done) { end = p.today; r.open = true; }
    if (end === undefined || r.order || end < r.start) return;
    r.dur = Math.round((end - r.start) / DAY);
  });
  const issues: StageIssue[] = [];
  for (const r of rows) {
    if (r.missing) issues.push({ kind: "missing", stage: r.name, text: `${r.name} start date is missing.` });
    if (r.order) issues.push({ kind: "order", stage: r.name, text: `${r.name} starts before the stage above it, so no duration is shown.` });
    if (r.skipped) issues.push({ kind: "skipped", stage: r.name, text: `${r.name} has no start date but a later stage has one: it looks skipped.` });
    if (r.rework) issues.push({ kind: "rework", stage: r.name, text: `The stage field says ${r.name}, but ${rows[maxIdx].name} already has a start date: back in ${r.name} (rework).` });
  }
  return { rows, cur, maxIdx, issues, timeInStage: p.done ? undefined : rows[cur].dur };
}

/** How long each stage normally takes: the median of the finished stages of all Epics (a stage needs at least `min` finished examples). */
export function typicalStageDays(all: (StageDatesResult | undefined)[], names: string[], min = 3): Record<string, number> {
  const out: Record<string, number> = {};
  names.forEach((name, i) => {
    const v = all.map(a => a?.rows[i]).filter((r): r is StageDateRow => !!r && !r.open && !r.skipped && !r.order && r.dur !== undefined && r.end !== undefined).map(r => r.dur!).sort((a, b) => a - b);
    if (v.length >= min) out[name] = v.length % 2 ? v[(v.length - 1) / 2] : Math.round((v[v.length / 2 - 1] + v[v.length / 2]) / 2);
  });
  return out;
}

/** “Recorded late”: how many days after the date itself it was entered (0 or negative when entered in time or ahead). */
export const recordedLate = (valueDay: string, enteredAt: string): number | undefined => { const a = parseDay(valueDay), b = parseDay(enteredAt); return a === undefined || b === undefined ? undefined : Math.round((b - a) / DAY); };
