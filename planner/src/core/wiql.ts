/** WIQL for the planner's page filters. Every value is escaped; field names are validated, so a filter can never change the query's shape. */
export interface EpicFilters {
  workItemType: string;
  states?: string[];
  areaPaths?: string[];                     // "under" matching
  iterationPaths?: string[];
  tags?: string[];
  fields?: { field: string; values: string[] }[];
  /** only Epics whose start..target range overlaps these dates (YYYY-MM-DD) */
  overlap?: { startField: string; targetField: string; from: string; to: string };
  /** only Epics changed on or after this day (YYYY-MM-DD): used for the incremental refresh */
  changedSince?: string;
}

const FIELD = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const q = (s: string) => `'${String(s).replace(/'/g, "''")}'`;
const list = (field: string, vals: string[]) => `${field} IN (${vals.map(q).join(", ")})`;

export function buildWiql(f: EpicFilters): string {
  if (!/^[\w .\-]{1,64}$/.test(f.workItemType)) throw new Error("The work item type contains characters that are not allowed.");
  const where = [`[System.TeamProject] = @project`, `[System.WorkItemType] = ${q(f.workItemType)}`];
  if (f.states?.length) where.push(list("[System.State]", f.states));
  if (f.areaPaths?.length) where.push("(" + f.areaPaths.map(a => `[System.AreaPath] UNDER ${q(a)}`).join(" OR ") + ")");
  if (f.iterationPaths?.length) where.push("(" + f.iterationPaths.map(a => `[System.IterationPath] UNDER ${q(a)}`).join(" OR ") + ")");
  if (f.tags?.length) where.push("(" + f.tags.map(t => `[System.Tags] CONTAINS ${q(t)}`).join(" OR ") + ")");
  for (const x of f.fields ?? []) {
    if (!x.values.length) continue;
    if (!FIELD.test(x.field)) throw new Error(`'${x.field}' is not a field reference name.`);
    where.push(list(`[${x.field}]`, x.values));
  }
  if (f.overlap) {
    const { startField, targetField, from, to } = f.overlap;
    for (const n of [startField, targetField]) if (!FIELD.test(n)) throw new Error(`'${n}' is not a field reference name.`);
    if (!DATE.test(from) || !DATE.test(to)) throw new Error("Dates must be YYYY-MM-DD.");
    // an Epic with no dates yet is kept (it can still have hours in its grid)
    where.push(`([${startField}] = '' OR [${startField}] <= '${to}')`, `([${targetField}] = '' OR [${targetField}] >= '${from}')`);
  }
  if (f.changedSince) { if (!DATE.test(f.changedSince)) throw new Error("Dates must be YYYY-MM-DD."); where.push(`[System.ChangedDate] >= '${f.changedSince}'`); }
  return `SELECT [System.Id] FROM WorkItems WHERE ${where.join(" AND ")} ORDER BY [System.Id]`;
}
