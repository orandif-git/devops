import { shortHash } from "../../../src/shared/ids";
import { buildWiql, EpicFilters } from "../core/wiql";
import { chunk, idsToFetch, mergeEpics } from "../core/sync";
import { EpicRecord, PlannerSettings } from "../core/types";
import { restPost } from "../rest";
import { cacheGet, cacheSet } from "./idb";
import { runSavedQuery } from "./queries";

export interface LoadProgress { phase: "query" | "check" | "read"; done: number; total: number }
export interface LoadResult { epics: EpicRecord[]; ids: number; fetched: number; fromCache: number; failed: number; ms: number; syncedAt: string; usedCache: boolean }
interface CacheEntry { syncedAt: string; epics: EpicRecord[] }
interface BatchItem { id: number; fields: Record<string, unknown> }

const BATCH = 200;
const CONCURRENCY = 3;
const text = (v: unknown): string => (v && typeof v === "object" ? String((v as { displayName?: string }).displayName ?? "") : v === null || v === undefined ? "" : String(v));

export function fieldList(s: PlannerSettings): string[] {
  const f = ["System.Id", "System.Title", "System.State", "System.WorkItemType", "System.AreaPath", "System.IterationPath", "System.ChangedDate", s.epicStartField, s.epicTargetField, ...s.sources.map(g => g.dataField), ...s.extraFilterFields];
  return Array.from(new Set(f.filter(Boolean)));
}

const toEpic = (w: BatchItem, s: PlannerSettings): EpicRecord => {
  const g = (k: string) => w.fields[k];
  const grids: Record<string, string> = {};
  for (const src of s.sources) { const v = g(src.dataField); if (typeof v === "string" && v.trim()) grids[src.id] = v; }
  const extra: Record<string, string> = {};
  for (const f of s.extraFilterFields) extra[f] = text(g(f));
  const d = (k: string) => (k && g(k) ? String(g(k)).slice(0, 10) : undefined);
  return { id: w.id, title: text(g("System.Title")), state: text(g("System.State")), type: text(g("System.WorkItemType")), areaPath: text(g("System.AreaPath")), iterationPath: text(g("System.IterationPath")),
    changed: text(g("System.ChangedDate")), start: d(s.epicStartField), target: d(s.epicTargetField), grids, extra };
};

async function batch(ids: number[], fields: string[]): Promise<BatchItem[]> {
  const r = await restPost<{ value: (BatchItem | null)[] }>("wit/workitemsbatch", { ids, fields, errorPolicy: 2 });
  return (r.value ?? []).filter((x): x is BatchItem => !!x);
}

async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]); } }));
  return out;
}

/**
 * Read the Epics for the chosen query or filter. The first time everything is read; afterwards only Epics that are new or changed
 * (found with a light id + changed-date read) are fetched in full and merged into the cached copy.
 */
export async function loadEpics(project: { id: string; name: string }, s: PlannerSettings, opts: { queryId?: string; filters?: Omit<EpicFilters, "workItemType">; force?: boolean; progress?: (p: LoadProgress) => void } = {}): Promise<LoadResult> {
  const t0 = Date.now();
  const fields = fieldList(s);
  const key = `epics|${project.id}|${shortHash(JSON.stringify([fields, opts.queryId ?? "", opts.filters ?? {}, s.workItemType]))}`;
  opts.progress?.({ phase: "query", done: 0, total: 1 });
  const ids = opts.queryId
    ? await runSavedQuery(project.name, opts.queryId)
    : ((await restPost<{ workItems?: { id: number }[] }>("wit/wiql", { query: buildWiql({ workItemType: s.workItemType, ...(opts.filters ?? {}) }) }, { project: project.name })).workItems ?? []).map(w => w.id);
  const cache = opts.force ? undefined : await cacheGet<CacheEntry>(key);
  const cached = cache?.epics ?? [];
  // which cached Epics changed? a light read of id + changed date only (no long text)
  let changedIds: number[] = [];
  if (cached.length) {
    const known = new Map(cached.map(e => [e.id, e.changed]));
    const check = chunk(ids.filter(id => known.has(id)), BATCH);
    let done = 0;
    const res = await pool(check, CONCURRENCY, async c => { const r = await batch(c, ["System.Id", "System.ChangedDate"]); opts.progress?.({ phase: "check", done: ++done, total: check.length }); return r; });
    changedIds = res.flat().filter(w => text(w.fields["System.ChangedDate"]) !== known.get(w.id)).map(w => w.id);
  }
  const want = idsToFetch(ids, cached, changedIds);
  const parts = chunk(want, BATCH);
  let done = 0;
  const got = await pool(parts, CONCURRENCY, async c => { const r = await batch(c, fields); opts.progress?.({ phase: "read", done: ++done, total: parts.length }); return r; });
  const fetched = got.flat().map(w => toEpic(w, s));
  const epics = mergeEpics(cached, fetched, ids);
  const syncedAt = new Date().toISOString();
  await cacheSet(key, { syncedAt, epics } satisfies CacheEntry);
  return { epics, ids: ids.length, fetched: fetched.length, fromCache: epics.length - fetched.length, failed: want.length - fetched.length, ms: Date.now() - t0, syncedAt, usedCache: cached.length > 0 };
}

/** One Epic's raw field text (used by the "detect columns" helper). */
export async function readField(id: number, field: string): Promise<{ title: string; text: string } | undefined> {
  const w = (await batch([id], ["System.Title", field]))[0];
  return w ? { title: text(w.fields["System.Title"]), text: typeof w.fields[field] === "string" ? (w.fields[field] as string) : "" } : undefined;
}
