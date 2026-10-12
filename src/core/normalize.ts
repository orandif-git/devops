import { DEFAULT_STATUSES } from "./review";
import { GridConfig, ProjectConfig, ReviewConfig } from "./types";

/** A review setting with every part present, so a partly written (hand-edited, older) one cannot crash the pages. */
export function normalizeReview(r: Partial<ReviewConfig> | undefined): ReviewConfig | undefined {
  if (!r || typeof r !== "object") return undefined;
  return {
    statusColumn: String(r.statusColumn ?? ""),
    byColumn: r.byColumn || undefined, atColumn: r.atColumn || undefined, reasonColumn: r.reasonColumn || undefined,
    statuses: { ...DEFAULT_STATUSES, ...Object.fromEntries(Object.entries(r.statuses ?? {}).filter(([, v]) => typeof v === "string" && v.trim())) },
    resetOnEdit: r.resetOnEdit ?? true,
    lockApproved: r.lockApproved ?? true,
    noSelfApproval: r.noSelfApproval ?? false,
    approvers: (Array.isArray(r.approvers) ? r.approvers : []).map((a, i) => ({
      id: a?.id || `r${i}`, name: a?.name ?? "", teams: Array.isArray(a?.teams) ? a.teams : [], people: Array.isArray(a?.people) ? a.people : [], ...(a?.when ? { when: { column: a.when.column ?? "", values: Array.isArray(a.when.values) ? a.when.values : [] } } : {}),
    })),
    secure: r.secure && typeof r.secure === "object" ? { dataField: String(r.secure.dataField ?? "") } : undefined,
    admins: { teams: Array.isArray(r.admins?.teams) ? r.admins!.teams : [], people: Array.isArray(r.admins?.people) ? r.admins!.people : [] },
  };
}

export function normalizeGrid(g: GridConfig): GridConfig {
  const out: GridConfig = { ...g, columns: Array.isArray(g.columns) ? g.columns : [] };
  if (g.review !== undefined) out.review = normalizeReview(g.review);
  if (g.presets !== undefined) out.presets = Array.isArray(g.presets) ? g.presets.map(p => ({ ...p, columns: Array.isArray(p.columns) ? p.columns : [], rows: Array.isArray(p.rows) ? p.rows : [] })) : undefined;
  if (g.presetSave) out.presetSave = { enabled: !!g.presetSave.enabled, teams: Array.isArray(g.presetSave.teams) ? g.presetSave.teams : [], admins: g.presetSave.admins !== false };
  return out;
}

/** Fill in what an older or hand-written configuration leaves out. */
export function normalizeProject(c: ProjectConfig): ProjectConfig {
  return { ...c, grids: Object.fromEntries(Object.entries(c.grids ?? {}).map(([k, g]) => [k, normalizeGrid(g)])) };
}
