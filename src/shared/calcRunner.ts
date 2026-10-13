import { calcApplies, calcRefs, evaluateCalculations } from "../core/calc";
import { resolvedGrids } from "../core/sharedLookups";
import { ProjectConfig } from "../core/types";
import { getFormService, getProject } from "./ado";
import { loadConfig } from "./configStore";

/**
 * Runs the project's calculations against the open work item and writes changed results to their fields.
 * Used by the Smart Grid control (in addition to the background observer): both write only when a value differs,
 * so they never fight, and the result appears even if one of them is not running.
 */
let configPromise: Promise<ProjectConfig> | undefined;
let knownFields: Set<string> | undefined;
let chain: Promise<unknown> = Promise.resolve();

export const resetCalcRunner = () => { configPromise = undefined; knownFields = undefined; };

async function config() {
  configPromise ??= getProject().then(p => loadConfig(p.id));
  return configPromise;
}

async function run(): Promise<Record<string, number | string | null>> {
  const cfg = await config();
  const svc = await getFormService();
  const type = String(await svc.getFieldValue("System.WorkItemType"));
  const calcs = (cfg.calculations ?? []).filter(c => calcApplies(c, type));
  if (!calcs.length) return {};
  knownFields ??= new Set((await svc.getFields()).map(f => f.referenceName));
  const known = knownFields;
  const grids = resolvedGrids(cfg);
  const refs = calcRefs(calcs, grids).filter(r => known.has(r));
  const all: Record<string, number | string | null> = {};
  for (let pass = 0; pass < 4; pass++) {
    const values = (await svc.getFieldValues(refs)) as Record<string, unknown>;
    const { changes, notes } = evaluateCalculations(calcs, type, f => (f in all ? all[f] : values[f]), grids);
    if (pass === 0) notes.forEach(n => console.info("[Grid & Rules] calculation:", n));
    const toSet = Object.fromEntries(Object.entries(changes).filter(([f]) => known.has(f)));
    for (const f of Object.keys(changes)) if (!known.has(f)) console.warn(`[Grid & Rules] result field ${f} is not on ${type}`);
    if (!Object.keys(toSet).length) break;
    try { await svc.setFieldValues(toSet as Record<string, Object>); }
    catch { for (const [f, v] of Object.entries(toSet)) { try { await svc.setFieldValue(f, v as Object); } catch (e) { console.warn(`[Grid & Rules] could not set ${f}:`, (e as Error).message); } } }
    Object.assign(all, toSet);
  }
  if (Object.keys(all).length) console.info("[Grid & Rules] calculations wrote:", JSON.stringify(all));
  return all;
}

/** Queue a run (runs never overlap). Errors are logged, never thrown into the caller. */
export function applyCalculations(): Promise<void> {
  chain = chain.then(run).then(() => undefined, e => { console.warn("[Grid & Rules] calculations failed:", (e as Error).message); });
  return chain as Promise<void>;
}
