import { keyNorm } from "./keys";
import { GridConfig, GridRow, TeamRef } from "./types";

/**
 * “Rows & access” of a grid: what people may do with the rows, which cells stay fixed, and the preset a grid starts with.
 * Every field is optional and the default is how the grid always behaved, so a grid without these settings is unchanged.
 */
export interface AccessConfig {
  /** the id of the preset a grid starts with when it is empty (new or existing work item); empty = start blank */
  startPreset?: string;
  /** people may add / delete / move rows, and import or load a preset (default: yes) */
  allowAdd?: boolean; allowDelete?: boolean; allowMove?: boolean; allowImport?: boolean;
  /** cells that stay fixed: never (default), the cells the preset filled, or any cell that already has a saved value */
  lockCells?: "never" | "preset" | "filled";
  /** only the person who added a row (and administrators) may change or delete it; rows with no owner stay open to everyone */
  rowOwner?: boolean;
  /** besides project administrators: may always change fixed cells and other people's rows */
  admins?: { teams: TeamRef[]; people: string[] };
  /** administrators (project administrators and the ones listed) can change fixed cells and other people's rows (default: yes); off = nobody can, administrators included */
  adminsBypass?: boolean;
  /** ask before a row is deleted (default: yes) */
  confirmDelete?: boolean;
}

/** The person looking at the grid. `isAdmin` is undefined until it is known: until then they count as an ordinary user. */
export interface AccessWho { keys: string[]; /** the sign-in name stored on rows they add */ key: string; name: string; isAdmin?: boolean }

const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const filled = (v: unknown) => v !== undefined && v !== null && v !== "" && v !== false;

/** A clean access setting, or undefined when it holds nothing but the defaults (so it is not stored). */
export function normAccess(raw: unknown): AccessConfig | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>, out: AccessConfig = {};
  if (typeof r.startPreset === "string" && r.startPreset.trim()) out.startPreset = r.startPreset.trim();
  for (const k of ["allowAdd", "allowDelete", "allowMove", "allowImport", "confirmDelete", "adminsBypass"] as const) if (r[k] === false) out[k] = false;
  if (r.lockCells === "preset" || r.lockCells === "filled") out.lockCells = r.lockCells;
  if (r.rowOwner === true) out.rowOwner = true;
  const a = r.admins as { teams?: unknown; people?: unknown } | undefined;
  const teams = Array.isArray(a?.teams) ? (a!.teams as TeamRef[]).filter(t => t && typeof t.id === "string") : [], people = Array.isArray(a?.people) ? (a!.people as unknown[]).filter((x): x is string => typeof x === "string" && !!x.trim()) : [];
  if (teams.length || people.length) out.admins = { teams, people };
  return Object.keys(out).length ? out : undefined;
}

export const mayAdd = (a?: AccessConfig) => bool(a?.allowAdd, true);
export const mayDelete = (a?: AccessConfig) => bool(a?.allowDelete, true);
export const mayMove = (a?: AccessConfig) => bool(a?.allowMove, true);
export const mayImport = (a?: AccessConfig) => bool(a?.allowImport, true);
export const asksBeforeDelete = (a?: AccessConfig) => bool(a?.confirmDelete, true);
/** Is this person an administrator who is allowed to bypass the fixed cells and the row owner rule? */
export const bypasses = (a: AccessConfig | undefined, who: Pick<AccessWho, "isAdmin"> | undefined) => who?.isAdmin === true && bool(a?.adminsBypass, true);
/** Every team id the access settings mention (so the loader knows which memberships to read). */
export const accessTeamIds = (a?: AccessConfig): string[] => Array.from(new Set((a?.admins?.teams ?? []).map(t => t.id)));
/** Is the sign-in name stored on a row the user's own? */
export const isMine = (row: GridRow, who: Pick<AccessWho, "keys">) => !!row._by && who.keys.includes(keyNorm(row._by));
/** Does a configured administrator list contain this user? */
export function isAccessAdmin(a: AccessConfig | undefined, who: { keys: string[]; teamIds: string[] }): boolean {
  const people = (a?.admins?.people ?? []).map(keyNorm).filter(Boolean);
  return people.some(p => who.keys.includes(p)) || (a?.admins?.teams ?? []).some(t => who.teamIds.includes(t.id));
}

/** A row somebody else added, while “Row owner” is on: it can be read but not changed, moved or deleted (administrators can, and so can everyone when the row has no owner). */
export function ownerLocked(row: GridRow, a: AccessConfig | undefined, who: AccessWho | undefined): boolean {
  if (!a?.rowOwner || !row._by) return false;
  if (!who) return true;                                    // until we know who is looking, a row somebody added stays fixed
  return !isMine(row, who) && !bypasses(a, who);
}

/**
 * Is this cell fixed? “preset”: the preset filled it. “filled”: it already has a value that was saved (`saved` is the row as last saved or read), or the preset filled it.
 * A cell still being typed in (not saved yet) stays editable, and administrators can always change it.
 */
export function cellFixed(row: GridRow, colId: string, a: AccessConfig | undefined, who: AccessWho | undefined, saved?: GridRow): boolean {
  const mode = a?.lockCells ?? "never";
  if (mode === "never" || bypasses(a, who)) return false;
  if (filled(row[colId]) && row._p?.includes(colId)) return true;
  return mode === "filled" && !!saved && filled(saved[colId]) && filled(row[colId]);
}

/** A new row, with its owner when “Row owner” is on. */
export function withOwner<T extends GridRow>(row: T, a: AccessConfig | undefined, who: Pick<AccessWho, "key" | "name"> | undefined, now = new Date()): T {
  if (!a?.rowOwner || !who) return row;
  return { ...row, _by: who.key, _byName: who.name, _at: now.toISOString() };
}

/** The columns a preset filled in a row (a copy of the row is a new row: nothing in it is the preset's any more). */
export const withoutPreset = <T extends GridRow>(row: T): T => { const { _p, ...rest } = row; void _p; return rest as T; };

/** Settings that make no sense together, in words (shown in the settings and the checks). */
export function accessProblems(g: GridConfig): string[] {
  const a = g.access, out: string[] = [];
  if (!a) return out;
  if (a.startPreset && !(g.presets ?? []).some(p => p.id === a.startPreset)) out.push("The preset this grid starts with no longer exists. Choose another or start blank.");
  if (a.allowAdd === false && !a.startPreset && (g.derived == null)) out.push("People cannot add rows and no starting preset is chosen, so the grid will always be empty.");
  if (a.lockCells && a.lockCells !== "never" && g.derived) out.push("Fixed cells apply to source grids only, not to a derived grid.");
  return out;
}

/**
 * The preset an empty grid starts with, or undefined: none chosen, the grid already has rows, it is read-only or derived, the person may only comment,
 * or the preset is not offered on this work item (its “offered when” rules).
 */
export function startPresetFor(a: AccessConfig | undefined, st: { rows: number; readOnly: boolean; derived: boolean; commentOnly: boolean; offered: { id: string }[] }): string | undefined {
  const id = a?.startPreset;
  if (!id || st.rows > 0 || st.readOnly || st.derived || st.commentOnly) return undefined;
  return st.offered.some(x => x.id === id) ? id : undefined;
}
