import { restGet } from "../rest";
import { shortHash } from "../../../src/shared/ids";
import { applyRevisions, Hist, historyFromUpdates, Rev } from "../core/history";
import { cacheGet, cacheSet } from "./idb";
import { LoadProgress } from "./epics";

export type HistoryMap = Record<string, Record<number, Hist>>;       // date field -> Epic id -> its history
interface Cached { syncedAt: string; map: HistoryMap }
interface Page { values?: { id: number; rev: number; fields: Record<string, unknown> }[]; continuationToken?: string; isLastBatch?: boolean; nextLink?: string }
const who = (v: unknown): string => (typeof v === "string" ? v.replace(/\s*<[^>]*>\s*$/, "") : v && typeof v === "object" ? String((v as { displayName?: string }).displayName ?? "") : "");

/**
 * The history of the given date fields for every Epic of the type, read from the revisions report (all revisions the first time, afterwards only
 * those since the last read). The result is cached in the browser; `force` reads everything again.
 */
export async function loadHistory(project: { id: string; name: string }, workItemType: string, fields: string[], opts: { force?: boolean; progress?: (p: LoadProgress) => void } = {}): Promise<HistoryMap> {
  const key = `history|${project.id}|${shortHash(JSON.stringify([fields, workItemType]))}`;
  const cached = opts.force ? undefined : await cacheGet<Cached>(key);
  const map: HistoryMap = {}; for (const f of fields) map[f] = cached?.map?.[f] ?? {};
  const seen: Record<string, Rev[]> = Object.fromEntries(fields.map(f => [f, []]));
  let token: string | undefined, pages = 0, newest = cached?.syncedAt ?? "";
  do {
    const q: Record<string, string | number> = { fields: ["System.Id", "System.Rev", "System.ChangedDate", "System.ChangedBy", ...fields].join(","), types: workItemType, includeLatestOnly: "false", "$maxPageSize": 1000 };
    if (cached?.syncedAt) q.startDateTime = cached.syncedAt;
    if (token) q.continuationToken = token;
    const page = await restGet<Page>("wit/reporting/workitemrevisions", q, project.name);
    opts.progress?.({ phase: "history", done: ++pages, total: 0 });
    for (const v of page.values ?? []) {
      const at = String(v.fields["System.ChangedDate"] ?? ""), by = who(v.fields["System.ChangedBy"]);
      if (at > newest) newest = at;
      for (const f of fields) seen[f].push({ id: v.id, rev: v.rev, at, by, value: String(v.fields[f] ?? "") });
    }
    token = page.isLastBatch === false || (page.isLastBatch === undefined && page.continuationToken) ? page.continuationToken : undefined;
  } while (token && pages < 400);
  for (const f of fields) map[f] = applyRevisions(map[f], seen[f]);
  await cacheSet(key, { syncedAt: newest || cached?.syncedAt || "", map } satisfies Cached);
  return map;
}

/** One Epic's history for one date field, read from its updates (used when the history of all Epics is not switched on). */
export async function fetchEpicHistory(id: number, field: string): Promise<Hist | undefined> {
  const r = await restGet<{ value?: Parameters<typeof historyFromUpdates>[0] }>(`wit/workItems/${id}/updates`);
  return historyFromUpdates(r.value ?? [], field);
}
