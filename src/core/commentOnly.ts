import { keyNorm } from "./keys";
import { CommentOnlyConfig } from "./types";

export const DEFAULT_ALLOWED = ["System.History"];
export const DEFAULT_MESSAGE = "You can only add comments on this work item. Your change to another field was undone.";
/** Fields the form and server change by themselves when a work item is opened or saved. */
const SYSTEM_NOISE = new Set(["System.Rev", "System.ChangedDate", "System.ChangedBy", "System.AuthorizedDate", "System.AuthorizedAs", "System.RevisedDate", "System.Watermark", "System.PersonId", "System.CommentCount", "System.Id", "System.IsDeleted", "System.BoardColumn", "System.BoardColumnDone"]);

export function normalizeCommentOnly(c: Partial<CommentOnlyConfig> | undefined): CommentOnlyConfig | undefined {
  if (!c || typeof c !== "object") return undefined;
  return {
    enabled: !!c.enabled,
    workItemTypes: Array.isArray(c.workItemTypes) ? c.workItemTypes.map(String) : [],
    teams: Array.isArray(c.teams) ? c.teams.filter(t => t && typeof t.id === "string").map(t => ({ id: t.id, name: String(t.name ?? "") })) : [],
    people: Array.isArray(c.people) ? c.people.map(String).filter(Boolean) : [],
    allowedFields: Array.isArray(c.allowedFields) ? c.allowedFields.map(s => String(s).trim()).filter(Boolean) : [...DEFAULT_ALLOWED],
    message: typeof c.message === "string" && c.message.trim() ? c.message.trim() : undefined,
  };
}

export const commentOnlyApplies = (c: CommentOnlyConfig | undefined, type: string) =>
  !!c?.enabled && (c.teams.length > 0 || c.people.length > 0) && (!c.workItemTypes.length || c.workItemTypes.includes(type));

/** Is this user one of the restricted people, or in one of the restricted teams (direct members)? */
export function isRestrictedUser(c: CommentOnlyConfig, actor: { keys: string[]; teamIds: string[] }): boolean {
  return c.people.some(p => { const k = keyNorm(p); return !!k && actor.keys.includes(k); }) || c.teams.some(t => actor.teamIds.includes(t.id));
}

const plain = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") { try { return JSON.stringify(v); } catch { return String(v); } }
  return String(v);
};
export const sameValue = (a: unknown, b: unknown) => plain(a) === plain(b) || (plain(a) !== "" && plain(b) !== "" && Number.isFinite(Number(plain(a))) && Number(plain(a)) === Number(plain(b)));

/** The fields the user changed that must be put back: not allowed, known from the snapshot taken when the work item was opened, and really different. */
export function fieldsToRevert(changed: Record<string, unknown>, snapshot: Record<string, unknown>, allowed: string[]): { field: string; value: unknown }[] {
  const ok = new Set([...DEFAULT_ALLOWED, ...allowed].map(s => s.toLowerCase()));
  const out: { field: string; value: unknown }[] = [];
  for (const [field, value] of Object.entries(changed ?? {})) {
    if (ok.has(field.toLowerCase()) || SYSTEM_NOISE.has(field) || !(field in snapshot)) continue;
    if (!sameValue(value, snapshot[field])) out.push({ field, value: snapshot[field] });
  }
  return out;
}
