import { keyNorm } from "./keys";
import { ColumnDef, GridConfig, GridRow, ReviewConfig } from "./types";

export type ReviewState = "pending" | "approved" | "rejected";
export const DEFAULT_STATUSES = { pending: "Pending review", approved: "Approved", rejected: "Rejected" };

/** The person looking at the grid, as far as approvals are concerned. */
export interface Actor {
  /** normalized identities of the user (sign-in name, display name, id) */
  keys: string[];
  /** ids of the Azure DevOps teams the user belongs to (of the teams used in the review settings) */
  teamIds: string[];
  isProjectAdmin: boolean;
  /** project administrator, or one of the configured grid administrators */
  isAdmin: boolean;
}

const lower = (v: unknown) => String(v ?? "").trim().toLowerCase();

export const statusLabels = (r: ReviewConfig) => ({ ...DEFAULT_STATUSES, ...r.statuses });

/** Status of a row; an empty or unknown label counts as pending review. */
export function stateOf(row: GridRow, r: ReviewConfig): ReviewState {
  const v = lower(row[r.statusColumn]);
  const l = statusLabels(r);
  if (v === lower(l.approved)) return "approved";
  if (v === lower(l.rejected)) return "rejected";
  return "pending";
}

/** Make sure every row has a valid status label (new rows start as pending). */
export function ensureStatus(row: GridRow, r: ReviewConfig): void {
  const l = statusLabels(r);
  const st = stateOf(row, r);
  const label = l[st];
  if (row[r.statusColumn] !== label) row[r.statusColumn] = label;
}

/** The person a row is about (for "nobody decides their own row"): the schedule's resource, else the first people-picker column. */
const personColumn = (cfg: GridConfig): ColumnDef | undefined =>
  (cfg.schedule && cfg.columns.find(c => c.id === cfg.schedule!.resource)) || cfg.columns.find(c => c.type === "identity");

const matches = (people: string[], actor: Actor) => people.some(p => { const k = keyNorm(p); return !!k && actor.keys.includes(k); });

/** Does this user count as a grid administrator (configured people or teams)? */
export const isGridAdmin = (r: ReviewConfig, actor: Pick<Actor, "keys" | "teamIds">): boolean =>
  matches(r.admins?.people ?? [], actor as Actor) || (r.admins?.teams ?? []).some(t => actor.teamIds.includes(t.id));

/** Every team id the review settings mention (so the loader knows which memberships to read). */
export const reviewTeamIds = (r: ReviewConfig): string[] =>
  Array.from(new Set([...(r.admins?.teams ?? []), ...r.approvers.flatMap(a => a.teams)].map(t => t.id)));

const ruleApplies = (rule: ReviewConfig["approvers"][number], row: GridRow) =>
  !rule.when || !rule.when.column || rule.when.values.some(v => lower(v) === lower(row[rule.when!.column]));

export interface Decision { ok: boolean; reason?: string }

/** May this user approve or reject this row? */
export function canDecide(row: GridRow, cfg: GridConfig, actor: Actor): Decision {
  const r = cfg.review!;
  if (r.noSelfApproval) {
    const pc = personColumn(cfg);
    const who = pc ? keyNorm(row[pc.id]) : "";
    if (who && actor.keys.includes(who)) return { ok: false, reason: "You cannot approve or reject your own row." };
  }
  if (actor.isAdmin) return { ok: true };
  const rules = r.approvers.filter(a => ruleApplies(a, row));
  if (!rules.length) return { ok: false, reason: "No approver is set for this row; only administrators can decide it." };
  const mine = rules.some(a => matches(a.people, actor) || a.teams.some(t => actor.teamIds.includes(t.id)));
  return mine ? { ok: true } : { ok: false, reason: `Only ${rules.map(a => a.name || "the approvers").join(" / ")} can decide this row.` };
}

/** Is the row locked for this user (approved rows are locked except for administrators)? */
export const isLocked = (row: GridRow, cfg: GridConfig, actor: Actor | undefined): boolean => {
  const r = cfg.review;
  if (!r || !r.lockApproved || stateOf(row, r) !== "approved") return false;
  return !actor?.isAdmin;
};

export const reviewColumns = (r: ReviewConfig) => [r.statusColumn, r.byColumn, r.atColumn, r.reasonColumn].filter(Boolean) as string[];

const stamp = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

export interface DecideResult { rows: GridRow[]; changed: number; skipped: number; firstReason?: string }

/** Approve or reject the given rows (only those the user may decide; rows already in that state are left alone). */
export function decide(rows: GridRow[], ids: Set<string>, to: "approved" | "rejected", cfg: GridConfig, actor: Actor, actorName: string, now = new Date()): DecideResult {
  const r = cfg.review!;
  const l = statusLabels(r);
  let changed = 0, skipped = 0, firstReason: string | undefined;
  const out = rows.map(row => {
    if (!ids.has(row._id) || stateOf(row, r) === to) return row;
    const d = canDecide(row, cfg, actor);
    if (!d.ok) { skipped++; firstReason ??= d.reason; return row; }
    changed++;
    const next = { ...row, [r.statusColumn]: l[to] };
    if (r.byColumn) next[r.byColumn] = actorName;
    if (r.atColumn) next[r.atColumn] = stamp(now);
    return next;
  });
  return { rows: out, changed, skipped, firstReason };
}

/** Back to pending review, clearing who / when (the typed reason stays). */
export function resetRow(row: GridRow, r: ReviewConfig): GridRow {
  const next = { ...row, [r.statusColumn]: statusLabels(r).pending };
  if (r.byColumn) next[r.byColumn] = "";
  if (r.atColumn) next[r.atColumn] = "";
  return next;
}

const auto = (c: ColumnDef, cfg: GridConfig) => !!c.formula || !!c.lookup || !!c.statusBands || !!c.derive || !!c.capacity || !!c.others || !!c.teamOf || c.type === "calculated" || c.id === cfg.schedule?.end;

/** The columns a person types in (not calculated, not the review columns): what an approval vouches for. */
export function typedColumns(cfg: GridConfig): ColumnDef[] {
  const skip = new Set(cfg.review ? reviewColumns(cfg.review) : []);
  return cfg.columns.filter(c => !skip.has(c.id) && !auto(c, cfg));
}

/**
 * After a cell edit: an edited approved / rejected row goes back to pending review (when configured).
 * Only columns a person types in count; calculated columns and the review columns do not.
 */
export function resetOnEdit(before: GridRow[], after: GridRow[], cfg: GridConfig): GridRow[] {
  const r = cfg.review;
  if (!r || !r.resetOnEdit) return after;
  const typed = typedColumns(cfg);
  const prev = new Map(before.map(b => [b._id, b]));
  return after.map(row => {
    const old = prev.get(row._id);
    if (!old || stateOf(old, r) === "pending") return row;
    const edited = typed.some(c => JSON.stringify(old[c.id] ?? null) !== JSON.stringify(row[c.id] ?? null));
    return edited ? resetRow(row, r) : row;
  });
}

/** A row that was copied or imported must be reviewed again. */
export const freshReview = (row: GridRow, r: ReviewConfig): GridRow => resetRow(row, r);

/** The columns a review needs, created when missing (re-using what exists). */
export function withReview(g: GridConfig): GridConfig {
  const cols = [...g.columns];
  const cur = g.review;
  const ensure = (id: string, make: () => Omit<ColumnDef, "id">, preferred?: string) => {
    const hit = (preferred && cols.find(c => c.id === preferred)) || cols.find(c => c.id === id);
    if (hit) return hit.id;
    let use = id;
    for (let n = 2; cols.some(c => c.id === use); n++) use = id + n;
    cols.push({ ...make(), id: use });
    return use;
  };
  const statusColumn = ensure("reviewstatus", () => ({ name: "Review status", type: "string", width: 130 }), cur?.statusColumn);
  const byColumn = ensure("reviewedby", () => ({ name: "Reviewed by", type: "string" }), cur?.byColumn);
  const atColumn = ensure("reviewedat", () => ({ name: "Reviewed at", type: "string" }), cur?.atColumn);
  const reasonColumn = ensure("reviewreason", () => ({ name: "Review comment", type: "string" }), cur?.reasonColumn);
  return {
    ...g, columns: cols,
    review: { resetOnEdit: true, lockApproved: true, noSelfApproval: false, approvers: [], admins: { teams: [], people: [] }, ...cur, statusColumn, byColumn, atColumn, reasonColumn, statuses: { ...DEFAULT_STATUSES, ...(cur?.statuses ?? {}) } },
  };
}
