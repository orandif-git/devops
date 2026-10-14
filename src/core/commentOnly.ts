import { keyNorm } from "./keys";
import { CommentOnlyConfig, ControlRule } from "./types";

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

type Scope = { enabled: boolean; workItemTypes: string[]; teams: unknown[]; people: unknown[] };
export const commentOnlyApplies = (c: Scope | undefined, type: string) =>
  !!c?.enabled && (c.teams.length > 0 || c.people.length > 0) && (!c.workItemTypes.length || c.workItemTypes.includes(type));

/** Is this user one of the restricted people, or in one of the restricted teams (direct members)? */
export function isRestrictedUser(c: Pick<CommentOnlyConfig, "teams" | "people">, actor: { keys: string[]; teamIds: string[] }): boolean {
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

// ---------------- control rules (any number of rules per project) ----------------

export const DEFAULT_LOCK_MESSAGE = "You cannot change this field. Your change was undone.";
export const newRuleId = () => "ctl-" + Math.random().toString(36).slice(2, 8);

export function normalizeRule(r: Partial<ControlRule> | undefined, i = 0): ControlRule | undefined {
  if (!r || typeof r !== "object") return undefined;
  const list = (v: unknown) => (Array.isArray(v) ? Array.from(new Set(v.map(s => String(s).trim()).filter(Boolean))) : []);
  const mode = r.mode === "lock" ? "lock" : "comments";
  return {
    id: typeof r.id === "string" && r.id ? r.id : `rule-${i + 1}`,
    name: typeof r.name === "string" && r.name.trim() ? r.name.trim() : `Rule ${i + 1}`,
    enabled: !!r.enabled,
    mode,
    workItemTypes: list(r.workItemTypes),
    teams: Array.isArray(r.teams) ? r.teams.filter(t => t && typeof t.id === "string").map(t => ({ id: t.id, name: String(t.name ?? "") })) : [],
    people: list(r.people),
    fields: Array.isArray(r.fields) ? list(r.fields) : mode === "comments" ? [...DEFAULT_ALLOWED] : [],
    message: typeof r.message === "string" && r.message.trim() ? r.message.trim() : undefined,
  };
}

/** The rule list from a stored configuration: the new list, or the older single comment-only setting converted to "Comment-only access". */
export function readControls(c: { controls?: unknown; commentOnly?: unknown }): ControlRule[] | undefined {
  if (Array.isArray(c.controls)) return c.controls.map((r, i) => normalizeRule(r as Partial<ControlRule>, i)).filter((r): r is ControlRule => !!r);
  const old = normalizeCommentOnly(c.commentOnly as Partial<CommentOnlyConfig> | undefined);
  if (!old) return undefined;
  return [{ id: "rule-1", name: "Comment-only access", enabled: old.enabled, mode: "comments", workItemTypes: old.workItemTypes, teams: old.teams, people: old.people, fields: old.allowedFields, message: old.message }];
}

export const ruleApplies = (r: ControlRule, type: string) => commentOnlyApplies(r, type);

/** Does this rule stop the user changing this field? */
export function ruleBlocks(r: ControlRule, field: string): boolean {
  const f = field.toLowerCase();
  const listed = r.fields.some(x => x.toLowerCase() === f);
  return r.mode === "lock" ? listed : !listed && !DEFAULT_ALLOWED.some(x => x.toLowerCase() === f);
}

/** The changes to put back for a user restricted by these rules (the stricter result wins when several apply). `exempt` = fields the extension writes itself (never undone). */
export function revertsForRules(changed: Record<string, unknown>, snapshot: Record<string, unknown>, rules: ControlRule[], exempt: Set<string> = new Set()): { field: string; value: unknown; message: string }[] {
  const out: { field: string; value: unknown; message: string }[] = [];
  for (const [field, value] of Object.entries(changed ?? {})) {
    if (SYSTEM_NOISE.has(field) || !(field in snapshot) || exempt.has(field.toLowerCase())) continue;
    const rule = rules.find(r => ruleBlocks(r, field));
    if (!rule || sameValue(value, snapshot[field])) continue;
    out.push({ field, value: snapshot[field], message: rule.message || (rule.mode === "lock" ? DEFAULT_LOCK_MESSAGE : DEFAULT_MESSAGE) });
  }
  return out;
}
