import { Timelines } from "./asof";
import { DeliverySettings } from "./types";

const DAY = 86400000;
const yy = (y: number) => String(y).slice(2);
export const quarterLabel = (t: number) => { const d = new Date(t); return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${yy(d.getUTCFullYear())}`; };
export interface QuarterSpan { label: string; from: number; to: number }
const spanOf = (y: number, q: number): QuarterSpan => ({ label: `Q${q + 1} ${yy(y)}`, from: Date.UTC(y, q * 3, 1), to: Date.UTC(y, q * 3 + 3, 1) - 1 });
/** The `n` quarters ending with the one `now` falls in, oldest first. */
export function lastQuarters(now: Date, n: number): QuarterSpan[] {
  const out: QuarterSpan[] = []; let y = now.getUTCFullYear(), q = Math.floor(now.getUTCMonth() / 3);
  for (let i = 0; i < n; i++) { out.unshift(spanOf(y, q)); if (--q < 0) { q = 3; y--; } }
  return out;
}
/** The quarters that a range of days (ms) touches, oldest first (at most 12). */
export function quartersIn(from: number, to: number): QuarterSpan[] {
  const out: QuarterSpan[] = []; let y = new Date(from).getUTCFullYear(), q = Math.floor(new Date(from).getUTCMonth() / 3);
  while (out.length < 12) { const s = spanOf(y, q); if (s.from > to) break; out.push(s); if (++q > 3) { q = 0; y++; } }
  return out;
}

/** When each Epic last reached a done state, from its state history. An Epic that is not done now has no date. */
export function doneDatesFromTimelines(tl: Timelines, doneStates: string[]): Record<number, number> {
  const done = (st?: string) => !!st && doneStates.some(d => d.toLowerCase() === st.trim().toLowerCase()), out: Record<number, number> = {};
  for (const [id, pts] of Object.entries(tl)) {
    let at: string | undefined, was = false;
    for (const p of pts) { const now = done(p.v["System.State"]); if (now && !was) at = p.at; if (!now) at = undefined; was = now; }
    const t = at ? Date.parse(at) : NaN; if (Number.isFinite(t)) out[+id] = t;
  }
  return out;
}
const dayOf = (t?: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t ?? ""); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : undefined; };
/** The same from a date field of each Epic (for example Closed date). */
export function doneDatesFromField(epics: { id: number; extra: Record<string, string> }[], field: string): Record<number, number> {
  const out: Record<number, number> = {}; if (!field) return out;
  for (const e of epics) { const t = dayOf(e.extra[field]); if (t !== undefined) out[e.id] = t; }
  return out;
}

export interface Delivered { id: number; title: string; goLive: number; doneAt: number; /** days after go-live (negative = early) */ late: number; moves: number }
export interface DeliveryInput { id: number; title: string; goLive?: number; moves: number; /** reached Done (the Epic's own state) */ done: boolean }
export interface Column { label: string; on: number; late1: number; late2: number; total: number; rate: number | undefined }
export interface DeliverySummary {
  /** the quarters of the chart, oldest first */ columns: Column[];
  rate?: number; ratePrev?: number; avgLate?: number; avgLatePrev?: number; predictable?: number; recentCount: number;
  /** the last finished quarter: delivered and due */ lastQuarter: string; delivered: number; due: number;
  worst: Delivered[]; known: number;
}
const startOfDay = (t: number) => Math.floor(t / DAY) * DAY;
const rateOf = (a: Delivered[], grace: number) => (a.length ? Math.round(100 * a.filter(e => e.late <= grace).length / a.length) : undefined);
const avgOf = (a: Delivered[], grace: number) => { const l = a.filter(e => e.late > grace); return l.length ? Math.round(l.reduce((x, e) => x + e.late, 0) / l.length) : 0; };

/** Everything the card shows. `window` is the chart's quarters (the last n, or the quarters of a chosen period). */
export function summarizeDelivery(p: { items: DeliveryInput[]; all: { goLive?: number }[]; doneAt: Record<number, number>; s: DeliverySettings; now: Date; window?: QuarterSpan[] }): DeliverySummary {
  const { s } = p, win = p.window?.length ? p.window : lastQuarters(p.now, s.quarters);
  const list: Delivered[] = [];
  for (const i of p.items) { const t = p.doneAt[i.id]; if (!i.done || t === undefined || i.goLive === undefined) continue; list.push({ id: i.id, title: i.title, goLive: i.goLive, doneAt: t, late: Math.round((startOfDay(t) - i.goLive) / DAY), moves: i.moves }); }
  const inQ = (e: Delivered, q: QuarterSpan) => e.doneAt >= q.from && e.doneAt <= q.to;
  const columns: Column[] = win.map(q => { const a = list.filter(e => inQ(e, q)); return { label: q.label, on: a.filter(e => e.late <= s.graceDays).length, late1: a.filter(e => e.late > s.graceDays && e.late <= s.severeDays).length, late2: a.filter(e => e.late > s.severeDays).length, total: a.length, rate: rateOf(a, s.graceDays) }; });
  const recentQs = win.slice(-s.recent), from = recentQs[0].from, to = recentQs[recentQs.length - 1].to, span = to - from + 1;
  const recent = list.filter(e => e.doneAt >= from && e.doneAt <= to), before = list.filter(e => e.doneAt >= from - span && e.doneAt < from);
  const lq = lastQuarters(p.now, 2)[0], deliveredLast = list.filter(e => inQ(e, lq)).length, due = p.all.filter(e => e.goLive !== undefined && e.goLive >= lq.from && e.goLive <= lq.to).length;
  return { columns, rate: rateOf(recent, s.graceDays), ratePrev: rateOf(before, s.graceDays), avgLate: recent.length ? avgOf(recent, s.graceDays) : undefined, avgLatePrev: before.length ? avgOf(before, s.graceDays) : undefined,
    predictable: recent.length ? Math.round(100 * recent.filter(e => Math.abs(e.late) <= s.predictDays).length / recent.length) : undefined, recentCount: recent.length,
    lastQuarter: lq.label, delivered: deliveredLast, due, worst: recent.filter(e => e.late > s.graceDays).sort((a, b) => b.late - a.late).slice(0, 5), known: list.length };
}
