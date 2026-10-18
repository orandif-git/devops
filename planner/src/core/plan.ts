import { epicLines } from "./units";
import { PersonRow } from "./model";
import { groupByTeam } from "./model";
import { PlanGroup } from "./types";

export const GROUP_LABEL: Record<PlanGroup, string> = { team: "Team › Person › Epic", epic: "Epic › Team › Person", person: "Person › Epic" };
const r1 = (n: number) => Math.round(n * 10) / 10;

/** One row of the resource plan, with its hours and available hours per month and the rows under it. */
export interface PlanNode {
  key: string; kind: "team" | "person" | "epic"; level: number; label: string; meta: string;
  epicId?: number; person?: PersonRow; people?: PersonRow[];
  hours: Record<string, number>; avail: Record<string, number | null>;
  /** person rows that show the person's whole load coloured by capacity band (not the hours of one Epic) */
  banded: boolean; children: PlanNode[];
}
export interface EpicInfo { title: string; state: string }

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const sumBy = (months: string[], list: PersonRow[], pick: (p: PersonRow, m: string) => number) => Object.fromEntries(months.map(m => [m, r1(list.reduce((a, p) => a + pick(p, m), 0))]));
const total = (n: PlanNode) => Object.values(n.hours).reduce((a, b) => a + b, 0);

/** Totals over the months shown: all hours, and all hours the people of the row have available. */
export const nodeTotals = (n: PlanNode) => ({ hours: r1(total(n)), available: r1(Object.values(n.avail).reduce<number>((a, b) => a + (b ?? 0), 0)) });

/** The plan as a tree in the order chosen: Team › Person › Epic, Epic › Team › Person, or Person › Epic. */
export function buildPlan(people: PersonRow[], months: string[], by: PlanGroup, epic: (id: number) => EpicInfo | undefined): PlanNode[] {
  const epicLabel = (id: number) => `${id} · ${epic(id)?.title ?? ""}`;
  const personNode = (pp: PersonRow, level: number, kids: PlanNode[], banded: boolean): PlanNode => ({
    key: "p:" + pp.key + ":" + level, kind: "person", level, label: pp.name, meta: kids.length ? plural(kids.length, "Epic") : "", person: pp, people: [pp],
    hours: banded ? { ...pp.hours } : {}, avail: { ...pp.available }, banded, children: kids });
  const epicsOf = (pp: PersonRow, level: number): PlanNode[] => epicLines(pp, months).map(l => ({
    key: `e:${pp.key}:${l.epicId}`, kind: "epic" as const, level, label: epicLabel(l.epicId), meta: epic(l.epicId)?.state ?? "", epicId: l.epicId, person: pp, people: [pp],
    hours: Object.fromEntries(months.map(m => [m, l.byMonth[m] ?? 0])), avail: { ...pp.available }, banded: false, children: [] }));

  if (by === "team") return groupByTeam(people).map(g => ({
    key: "t:" + g.team, kind: "team" as const, level: 0, label: g.team, meta: plural(g.people.length, "person").replace("persons", "people"), people: g.people,
    hours: sumBy(months, g.people, (p, m) => p.hours[m] ?? 0), avail: sumBy(months, g.people, (p, m) => p.available[m] ?? 0), banded: false,
    children: g.people.map(pp => personNode(pp, 1, epicsOf(pp, 2), true)) }));

  if (by === "person") return people.map(pp => personNode(pp, 0, epicsOf(pp, 1), true));

  // Epic › Team › Person
  const tree = new Map<number, Map<string, Map<string, { pp: PersonRow; hours: Record<string, number> }>>>();
  for (const pp of people) for (const m of months) for (const e of pp.epics[m] ?? []) {
    const teams = tree.get(e.epicId) ?? new Map(); tree.set(e.epicId, teams);
    const ppl = teams.get(pp.team) ?? new Map(); teams.set(pp.team, ppl);
    const cell = ppl.get(pp.key) ?? { pp, hours: {} }; ppl.set(pp.key, cell);
    cell.hours[m] = r1((cell.hours[m] ?? 0) + e.hours);
  }
  const sums = (cells: { pp: PersonRow; hours: Record<string, number> }[]) => ({
    hours: Object.fromEntries(months.map(m => [m, r1(cells.reduce((a, c) => a + (c.hours[m] ?? 0), 0))])),
    avail: sumBy(months, cells.map(c => c.pp), (p, m) => p.available[m] ?? 0) });
  const byHours = (a: PlanNode, b: PlanNode) => total(b) - total(a) || a.label.localeCompare(b.label);
  return Array.from(tree).map(([id, teams]) => {
    const teamNodes: PlanNode[] = Array.from(teams).map(([team, ppl]) => {
      const cells = Array.from(ppl.values());
      const kids = cells.map(c => ({ key: `p:${c.pp.key}:${id}`, kind: "person" as const, level: 2, label: c.pp.name, meta: "", person: c.pp, people: [c.pp], hours: sums([c]).hours, avail: { ...c.pp.available }, banded: false, children: [] })).sort(byHours);
      return { key: `t:${id}:${team}`, kind: "team" as const, level: 1, label: team, meta: plural(kids.length, "person").replace("persons", "people"), people: cells.map(c => c.pp), ...sums(cells), banded: false, children: kids };
    }).sort(byHours);
    const all = Array.from(teams.values()).flatMap(p => Array.from(p.values()));
    return { key: "e:" + id, kind: "epic" as const, level: 0, label: epicLabel(id), meta: `${plural(teamNodes.length, "team")} · ${plural(all.length, "person").replace("persons", "people")}`, epicId: id, ...sums(all), banded: false, children: teamNodes };
  }).sort(byHours);
}

/** Keys of every row that has rows under it. */
export function parents(nodes: PlanNode[]): PlanNode[] { return nodes.flatMap(n => (n.children.length ? [n, ...parents(n.children)] : [])); }
