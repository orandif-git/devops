import { extractJson, parseStored, serializeJson } from "./gridModel";
import { Actor, canDecide, DecideResult, ReviewState, statusLabels, typedColumns } from "./review";
import { sha256 } from "./sha256";
import { formatStamp } from "./time";
import { GridConfig, GridRow } from "./types";

/**
 * Secure approvals. The decisions live in their own field (protected by a process rule), one record per row:
 * who decided, when, why, and a fingerprint of the row's typed values at that moment. A row only counts as approved / rejected
 * while its current fingerprint still matches; any change to the row, from anywhere, makes it pending again.
 */
export interface DecisionRec { s: "approved" | "rejected"; by: string; at: string; reason?: string; fp: string }
export interface ReviewDoc { version: 1; decisions: Record<string, DecisionRec> }

export const emptyReviewDoc = (): ReviewDoc => ({ version: 1, decisions: {} });

/** Tolerant reader (plain JSON, or text a rich-text field has wrapped). Anything unreadable means: no decisions. */
export function parseReviewDoc(raw: unknown): ReviewDoc {
  const text = String(raw ?? "").trim();
  if (!text) return emptyReviewDoc();
  try {
    const d = extractJson(text) as { decisions?: Record<string, Partial<DecisionRec>> };
    const out = emptyReviewDoc();
    for (const [id, r] of Object.entries(d?.decisions ?? {})) {
      if (id === "__proto__" || id === "constructor" || id === "prototype") continue;
      if (r && (r.s === "approved" || r.s === "rejected") && typeof r.fp === "string")
        out.decisions[id] = { s: r.s, by: String(r.by ?? ""), at: String(r.at ?? ""), ...(r.reason ? { reason: String(r.reason) } : {}), fp: r.fp };
    }
    return out;
  } catch { return emptyReviewDoc(); }
}

export const serializeReviewDoc = (doc: ReviewDoc): string => serializeJson(doc);

/** Fingerprint of what an approval vouches for: the row id and every typed value (calculated and review columns are left out). */
export function rowFingerprint(row: GridRow, cfg: GridConfig): string {
  // id/value pairs, empty values left out: adding or reordering columns does not invalidate approvals, changing a value does
  const pairs = typedColumns(cfg).map(c => [c.id, row[c.id]] as const).filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== false);
  return sha256(JSON.stringify([row._id, pairs]));
}

/** Verified state of a row: the recorded decision counts only while the row still matches its fingerprint. */
export function verifiedState(row: GridRow, cfg: GridConfig, doc: ReviewDoc): { state: ReviewState; rec?: DecisionRec; stale?: boolean } {
  const rec = doc.decisions[row._id];
  if (!rec) return { state: "pending" };
  if (rec.fp !== rowFingerprint(row, cfg)) return { state: "pending", stale: true };
  return { state: rec.s, rec };
}

/** Rows with their review columns replaced by the verified decisions (what the user sees, and what totals and calculations use). */
export function applyDecisions(rows: GridRow[], cfg: GridConfig, doc: ReviewDoc): GridRow[] {
  const r = cfg.review!;
  const l = statusLabels(r);
  return rows.map(row => {
    const v = verifiedState(row, cfg, doc);
    const next: GridRow = { ...row, [r.statusColumn]: l[v.state] };
    if (r.byColumn) next[r.byColumn] = v.rec?.by ?? "";
    if (r.atColumn) next[r.atColumn] = v.rec?.at ?? "";
    if (r.reasonColumn && v.rec) next[r.reasonColumn] = v.rec.reason ?? "";
    return next;
  });
}

/** How many rows were approved or rejected once, but were changed since (so they are pending again). */
export const staleCount = (rows: GridRow[], cfg: GridConfig, doc: ReviewDoc): number => rows.filter(r => verifiedState(r, cfg, doc).stale).length;


export interface SecureDecideResult extends DecideResult { doc: ReviewDoc }

/** Record decisions for the rows the user may decide. Decisions of rows that no longer exist are dropped. `rows` carry verified states. */
export function decideSecure(rows: GridRow[], ids: Set<string>, to: "approved" | "rejected", cfg: GridConfig, actor: Actor, actorName: string, doc: ReviewDoc, now = new Date()): SecureDecideResult {
  const r = cfg.review!;
  const decisions: Record<string, DecisionRec> = {};
  const live = new Set(rows.map(x => x._id));
  const byId = new Map(rows.map(x => [x._id, x]));
  // keep a decision only while its row still exists and still matches it; a changed row has to be decided again
  for (const [id, rec] of Object.entries(doc.decisions)) { const row = byId.get(id); if (row && live.has(id) && rec.fp === rowFingerprint(row, cfg)) decisions[id] = rec; }
  let changed = 0, skipped = 0, firstReason: string | undefined;
  for (const row of rows) {
    if (!ids.has(row._id) || verifiedState(row, cfg, { version: 1, decisions }).state === to) continue;
    const d = canDecide(row, cfg, actor);
    if (!d.ok) { skipped++; firstReason ??= d.reason; continue; }
    changed++;
    const reason = r.reasonColumn ? String(row[r.reasonColumn] ?? "").trim() : "";
    decisions[row._id] = { s: to, by: actorName, at: formatStamp(now, r.timeZone), ...(reason ? { reason } : {}), fp: rowFingerprint(row, cfg) };
  }
  const next: ReviewDoc = { version: 1, decisions };
  return { doc: next, rows: applyDecisions(rows, cfg, next), changed, skipped, firstReason };
}

/** Rows of a grid as stored in a work item's fields, with verified decisions when the grid uses secure approvals. */
export function loadGridRows(cfg: GridConfig, get: (ref: string) => unknown): GridRow[] {
  const rows = cfg.dataField ? parseStored(get(cfg.dataField), cfg) : [];
  const sec = cfg.review?.secure?.dataField;
  return cfg.review && sec ? applyDecisions(rows, cfg, parseReviewDoc(get(sec))) : rows;
}

/** Reference names of every field a grid reads rows from (its data field and, for secure approvals, the decisions field). */
export const gridFields = (cfg: GridConfig | undefined): string[] => [cfg?.dataField, cfg?.review?.secure?.dataField].filter(Boolean) as string[];
