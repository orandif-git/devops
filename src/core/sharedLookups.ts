import { ColumnDef, GridConfig, LookupTable, ProjectConfig } from "./types";

/** Replace `lookup.table` references by the shared table's map / fallback (unknown table -> empty map). */
export function applySharedLookups(cfg: GridConfig, lookups: Record<string, LookupTable> = {}): GridConfig {
  if (!cfg.columns.some(c => c.lookup?.table)) return cfg;
  return {
    ...cfg,
    columns: cfg.columns.map(c => {
      if (!c.lookup?.table) return c;
      const t = lookups[c.lookup.table];
      return { ...c, lookup: { ...c.lookup, map: t?.map ?? {}, fallback: t?.fallback } };
    }),
  };
}

/** All grids of a project with shared mappings applied (what runtime code and validation should use). */
export function resolvedGrids(config: Pick<ProjectConfig, "grids" | "lookups">): Record<string, GridConfig> {
  return Object.fromEntries(Object.entries(config.grids ?? {}).map(([n, g]) => [n, applySharedLookups(g, config.lookups ?? {})]));
}

/** Every value an auto-fill column can produce: the mapped categories plus the fallback. */
export const lookupValues = (col: Pick<ColumnDef, "lookup">): string[] =>
  col.lookup ? Array.from(new Set([...Object.values(col.lookup.map), ...(col.lookup.fallback ? [col.lookup.fallback] : [])])) : [];
