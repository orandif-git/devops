import { keyNorm } from "./keys";

/** Which of the chosen teams a person belongs to (the Resource cell value in, team names out). */
export type TeamBook = (resource: unknown) => string[];

export interface TeamMembers { team: string; members: string[] }

/** Build the lookup from each team's member names ("Display Name <DOMAIN\\user>" or just the sign-in name). People match with or without a domain. */
export function buildTeamBook(teams: TeamMembers[]): TeamBook {
  const byPerson = new Map<string, string[]>();
  for (const t of teams) for (const m of t.members) {
    const k = keyNorm(m);
    if (!k) continue;
    const list = byPerson.get(k) ?? [];
    if (!list.includes(t.team)) list.push(t.team);
    byPerson.set(k, list);
  }
  const order = teams.map(t => t.team);
  return resource => (byPerson.get(keyNorm(resource)) ?? []).slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

let current: Map<string, TeamBook> | undefined;
/** The loaded team lookup used when rows are recalculated; keyed by the sorted ids of the teams it covers. */
export const setTeamBooks = (b: Map<string, TeamBook> | undefined) => { current = b; };
export const teamBookKey = (teams: { id: string }[]) => teams.map(t => t.id).sort().join(",");

/** Fill a team-from-membership column of a row. Without a loaded lookup the stored value is left alone. */
export function applyTeamFrom(row: Record<string, unknown>, colId: string, cfg: { resource: string; teams: { id: string; name: string }[]; allowOverride?: boolean }): void {
  const book = current?.get(teamBookKey(cfg.teams));
  if (!book) return;
  const who = row[cfg.resource];
  const keep = new Set(cfg.teams.map(t => t.name));
  const auto = book(who).filter(n => keep.has(n)).join(", ");
  if (!cfg.allowOverride) { row[colId] = auto; return; }
  // with manual override: a typed value stays while the resource is unchanged; clearing the cell or picking another resource refills it
  const key = `_tf_${colId}`;
  const was = typeof row[key] === "string" ? (JSON.parse(row[key] as string) as [string, string]) : undefined;
  const mine = JSON.stringify([String(who ?? ""), auto]);
  const typed = String(row[colId] ?? "").trim();
  const manual = !!was && was[0] === String(who ?? "") && typed !== "" && typed !== was[1];
  if (!manual) { row[colId] = auto; row[key] = mine; }

}
