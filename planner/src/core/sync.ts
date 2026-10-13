import { EpicRecord } from "./types";

/** Merge freshly read Epics into the cached ones and drop Epics that are no longer in the current id list. */
export function mergeEpics(cached: EpicRecord[], fetched: EpicRecord[], currentIds: number[]): EpicRecord[] {
  const keep = new Set(currentIds);
  const byId = new Map<number, EpicRecord>();
  for (const e of cached) if (keep.has(e.id)) byId.set(e.id, e);
  for (const e of fetched) if (keep.has(e.id)) byId.set(e.id, e);
  return Array.from(byId.values()).sort((a, b) => a.id - b.id);
}

/** Ids to read: those never read, plus those that changed since the last sync. */
export function idsToFetch(currentIds: number[], cached: EpicRecord[], changedIds: number[]): number[] {
  const have = new Set(cached.map(e => e.id));
  const changed = new Set(changedIds);
  return currentIds.filter(id => !have.has(id) || changed.has(id));
}

/** The day to use for "changed since": the day of the last sync minus one day (WIQL compares by day, so a day of overlap avoids missing a change). */
export function sinceDay(lastSyncIso: string): string {
  const t = new Date(lastSyncIso).getTime();
  return new Date((Number.isFinite(t) ? t : Date.now()) - 86400000).toISOString().slice(0, 10);
}

export const chunk = <T,>(a: T[], n: number): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
