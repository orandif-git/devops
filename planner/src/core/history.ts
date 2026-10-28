/** The history of one date field of an Epic (for example the go-live date): the first value ever set and every later change. */
export interface Change { at: string; by: string; from: string; to: string }
export interface Hist { baseline: string; current: string; changes: Change[]; /** last revision read */ rev: number }
export interface Rev { id: number; rev: number; at: string; by: string; value: string }

const DAY = 86400000;
const norm = (v: unknown): string => { const s = typeof v === "string" ? v : v instanceof Date ? v.toISOString() : ""; const m = /^(\d{4}-\d{2}-\d{2})/.exec(s.trim()); return m ? m[1] : ""; };
const ts = (d: string) => Date.parse(d + "T00:00:00Z");
export const daysBetween = (a: string, b: string) => Math.round((ts(b) - ts(a)) / DAY);

/** Fold revisions into the history of each Epic. Revisions already seen (rev at or below the stored one) are skipped, so a re-read of the same period is safe. */
export function applyRevisions(prev: Record<number, Hist>, revs: Rev[]): Record<number, Hist> {
  const out: Record<number, Hist> = {};
  for (const [id, h] of Object.entries(prev)) out[+id] = { ...h, changes: [...h.changes] };
  for (const r of [...revs].sort((a, b) => a.id - b.id || a.rev - b.rev)) {
    const h = out[r.id], v = norm(r.value);
    if (h && r.rev <= h.rev) continue;
    if (!v) { if (h) h.rev = r.rev; continue; }                     // a cleared date is not a move; the next value is compared with the last real one
    if (!h) { out[r.id] = { baseline: v, current: v, changes: [], rev: r.rev }; continue; }
    if (v !== h.current) { h.changes.push({ at: r.at, by: r.by, from: h.current, to: v }); h.current = v; }
    h.rev = r.rev;
  }
  return out;
}

/** The history of one Epic from its work item updates (`{ rev, revisedDate, revisedBy, fields: { field: { oldValue, newValue } } }`). */
export function historyFromUpdates(updates: { rev?: number; revisedDate?: string; revisedBy?: { displayName?: string } | string; fields?: Record<string, { oldValue?: unknown; newValue?: unknown } | undefined> }[], field: string): Hist | undefined {
  let h: Hist | undefined;
  for (const u of [...updates].sort((a, b) => (a.rev ?? 0) - (b.rev ?? 0))) {
    const c = u.fields?.[field]; if (!c) continue;
    const from = norm(c.oldValue), to = norm(c.newValue), by = typeof u.revisedBy === "string" ? u.revisedBy : u.revisedBy?.displayName ?? "", at = u.revisedDate ?? "";
    if (!to) continue;
    if (!h) { h = from && from !== to ? { baseline: from, current: to, changes: [{ at, by, from, to }], rev: u.rev ?? 0 } : { baseline: to, current: to, changes: [], rev: u.rev ?? 0 }; continue; }
    if (to !== h.current) { h.changes.push({ at, by, from: h.current, to }); h.current = to; }
    h.rev = u.rev ?? h.rev;
  }
  return h;
}

export interface Summary { moves: number; later: number; earlier: number; /** days between the first and the current date (positive = later) */ net: number; recent: number; lastAt?: string; lastBy?: string }
/** What the history says: how often it moved, which way, and how much of that was recent. */
export function summarize(h: Hist | undefined, today: number, windowDays: number): Summary {
  if (!h) return { moves: 0, later: 0, earlier: 0, net: 0, recent: 0 };
  const since = today - windowDays * DAY, last = h.changes[h.changes.length - 1];
  return { moves: h.changes.length, later: h.changes.filter(c => c.to > c.from).length, earlier: h.changes.filter(c => c.to < c.from).length, net: daysBetween(h.baseline, h.current),
    recent: h.changes.filter(c => Date.parse(c.at) >= since).length, lastAt: last?.at, lastBy: last?.by };
}

export const MOVED = { later: "Moved later", earlier: "Moved earlier", often: "Moved 2+ times", recent: "Moved recently", same: "Moved, back to the original", none: "Not moved" } as const;
/** The words an Epic can be filtered by. */
export function movedTags(s: Summary): string[] {
  if (!s.moves) return [MOVED.none];
  const t: string[] = [];
  if (s.net > 0) t.push(MOVED.later); else if (s.net < 0) t.push(MOVED.earlier);
  if (s.moves >= 2) t.push(MOVED.often);
  if (s.recent > 0) t.push(MOVED.recent);
  return t.length ? t : [MOVED.same];
}
export const signed = (n: number) => (n > 0 ? "+" : "") + n;
