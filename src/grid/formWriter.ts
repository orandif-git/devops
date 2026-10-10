import { mappedTotals, serialize } from "../core/gridModel";
import { GridConfig, GridRow } from "../core/types";
import { getFormService } from "../shared/ado";

/** Events the form delivers to the control, forwarded to the derived grids that live in the same iframe. */
export type FormEvent = { type: "loaded" | "saved" | "reset" | "refreshed" | "changed"; changed?: Record<string, unknown> };
const listeners = new Set<(e: FormEvent) => void>();
export const onFormEvent = (fn: (e: FormEvent) => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const emitFormEvent = (e: FormEvent) => listeners.forEach(fn => fn(e));

let known: Set<string> | undefined;

/** Write rows to the grid's data field first (on their own), then each mapped total separately. Returns a warning, or "". */
export async function writeGrid(cfg: GridConfig, rows: GridRow[]): Promise<string> {
  const svc = await getFormService();
  await svc.setFieldValue(cfg.dataField!, serialize(rows));
  const wanted = mappedTotals(rows, cfg);
  if (!Object.keys(wanted).length) return "";
  if (!known) known = new Set((await svc.getFields()).map(f => f.referenceName));
  const problems: string[] = [];
  for (const [field, value] of Object.entries(wanted)) {
    if (!known.has(field)) { problems.push(`${field} (not on this work item type)`); continue; }
    try { await svc.setFieldValue(field, value); } catch (e) { problems.push(`${field} (${(e as Error).message || "rejected"})`); }
  }
  return problems.length ? `Totals not saved to: ${problems.join("; ")}.` : "";
}
