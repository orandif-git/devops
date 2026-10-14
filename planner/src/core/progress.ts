import { extractJson } from "../../../src/core/gridModel";
import { EpicRecord, ExecSettings, GridSource } from "./types";

/** How much of one grid's work is ticked done. `weight` counts effort when every row has one, otherwise rows. */
export interface GridDone { rows: number; done: number; weight: number; weightDone: number; weighted: boolean }

const num = (v: unknown): number | undefined => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : undefined; };
const TRUE = /^(true|yes|y|1|done|x|✓|✔|checked|complete[d]?)$/i;
export const isTicked = (v: unknown) => v === true || v === 1 || (typeof v === "string" && TRUE.test(v.trim()));

/** Count the rows of a grid that are ticked in its done column. Undefined when the grid has no done column or no readable rows. */
export function gridDoneOf(raw: string | undefined | null, src: GridSource): GridDone | undefined {
  const col = src.columns.done;
  const text = String(raw ?? "").trim();
  if (!col || !text) return undefined;
  let data: unknown;
  try { data = extractJson(text); } catch { return undefined; }
  const rows = Array.isArray(data) ? data : Array.isArray((data as { rows?: unknown })?.rows) ? (data as { rows: unknown[] }).rows : null;
  if (!rows) return undefined;
  const list = rows.filter((r): r is Record<string, unknown> => !!r && typeof r === "object");
  if (!list.length) return undefined;
  const eff = src.columns.effort;
  const weights = eff ? list.map(r => num(r[eff])) : [];
  const weighted = !!eff && weights.every(w => w !== undefined && w > 0);
  let done = 0, weight = 0, weightDone = 0;
  list.forEach((r, i) => { const t = isTicked(r[col]); if (t) done++; const w = weighted ? weights[i]! : 1; weight += w; if (t) weightDone += w; });
  return { rows: list.length, done, weight, weightDone, weighted };
}

/** The Epic's progress in percent and where it came from: the first source that has a value. */
export function progressOf(e: EpicRecord, x: ExecSettings, gridDone: Record<string, GridDone | undefined> = {}, sources: GridSource[] = []): { pct: number; from: string } | undefined {
  const n = (f?: string) => (f ? num(e.extra[f]) : undefined);
  for (const p of x.progress) {
    if (p.kind === "percentField") {
      const v = n(p.field);
      if (v !== undefined) return { pct: Math.max(0, Math.min(100, Math.round(v))), from: p.field! };
    } else if (p.kind === "ratioFields") {
      const d = n(p.doneField), t = n(p.totalField);
      if (d !== undefined && t !== undefined && t > 0) return { pct: Math.max(0, Math.min(100, Math.round(d / t * 100))), from: `${p.doneField} ÷ ${p.totalField}` };
    } else {
      const g = p.sourceId ? gridDone[p.sourceId] : undefined;
      if (g && g.weight > 0) return { pct: Math.round((g.weighted ? g.weightDone / g.weight : g.done / g.rows) * 100), from: `ticked rows of ${sources.find(s => s.id === p.sourceId)?.name || "the grid"}` };
    }
  }
  return undefined;
}
