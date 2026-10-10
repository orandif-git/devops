import * as SDK from "azure-devops-extension-sdk";
import { Cascade, ProjectConfig, Rule } from "../core/types";
import { calcApplies, calcRefs, evaluateCalculations } from "../core/calc";
import { resolvedGrids } from "../core/sharedLookups";
import { cascadeApplies, cascadeErrors, evaluateRules, hintedParent, ruleApplies } from "../core/rules";
import { getFormService, getProject, init, loadConfig } from "../shared/ado";

/**
 * Rules observer: runs invisibly on every work item form.
 * Supports set-value, conditional required, restricted values, custom errors,
 * and dependent-dropdown validation + Area-Path hints. Errors block save via form.setError.
 * Also runs the Calculations (standalone feature): results are written to their result fields.
 */
let config: ProjectConfig | undefined;
let projectId = "";
let weSetError = false;
let running = false;
let again = false;
let formFields: Set<string> | undefined;

const refsOf = (rules: Rule[], cascades: Cascade[]) => {
  const s = new Set<string>(["System.WorkItemType", "System.AreaPath"]);
  for (const r of rules) {
    r.when.conditions.forEach(c => s.add(c.field));
    [...r.then, ...(r.otherwise ?? [])].forEach(a => { if ("field" in a) s.add(a.field); });
  }
  for (const c of cascades) { s.add(c.parent); s.add(c.child); }
  return Array.from(s);
};

async function run(isLoad: boolean) {
  if (running) { again = true; return; }
  running = true;
  try {
    if (!config) config = await loadConfig(projectId);
    const svc = await getFormService();
    const type = String(await svc.getFieldValue("System.WorkItemType"));
    const rules = config.rules.filter(r => ruleApplies(r, type));
    const cascades = config.cascades.filter(c => cascadeApplies(c, type));
    const calcs = (config.calculations ?? []).filter(c => calcApplies(c, type));
    const grids = resolvedGrids(config);
    if (!rules.length && !cascades.length && !calcs.length) { if (weSetError) { await svc.clearError(); weSetError = false; } return; }
    // only touch fields this work item type really has (a missing field must not break the whole run)
    if (!formFields) formFields = new Set((await svc.getFields()).map(f => f.referenceName));
    const known = formFields;
    const refs = Array.from(new Set([...refsOf(rules, cascades), ...calcRefs(calcs, grids)])).filter(r => known.has(r));

    let errors: string[] = [];
    for (let pass = 0; pass < 5; pass++) {          // let chained rules settle; cap prevents flip-flop loops
      const values = (await svc.getFieldValues(refs)) as Record<string, unknown>;
      const get = (f: string) => values[f];
      const toSet: Record<string, string> = {};

      if (isLoad && pass === 0) {                    // area-path hints only pre-fill an empty parent
        for (const c of cascades) {
          const cur = values[c.parent];
          if (cur === undefined || cur === null || String(cur) === "") {
            const hint = hintedParent(c, String(values["System.AreaPath"] ?? ""));
            if (hint) toSet[c.parent] = hint;
          }
        }
      }
      const out = evaluateRules(rules, type, get);
      Object.assign(toSet, out.setValues);
      if (calcs.length) {
        const view = (f: string) => (f in toSet ? toSet[f] : get(f));
        const c = evaluateCalculations(calcs, type, view, grids);
        for (const [f, v] of Object.entries(c.changes)) if (known.has(f)) (toSet as Record<string, unknown>)[f] = v;
        else console.warn(`[Grid & Rules] calculation result field ${f} is not on ${type}`);
        c.notes.forEach(n => console.debug("[Grid & Rules] calculation:", n));
      }
      errors = [...out.errors, ...cascadeErrors(cascades, type, k => (k in toSet ? toSet[k] : values[k]))];
      for (const f of Object.keys(toSet)) if (!known.has(f)) delete toSet[f];
      if (!Object.keys(toSet).length) break;
      try { await svc.setFieldValues(toSet as Record<string, Object>); }
      catch {
        // one rejected field must not block the others: retry one by one and log what failed
        let ok = 0;
        for (const [f, v] of Object.entries(toSet)) {
          try { await svc.setFieldValue(f, v as Object); ok++; } catch (e) { console.warn(`[Grid & Rules] could not set ${f}:`, (e as Error).message); }
        }
        if (!ok) break;
      }
    }

    if (errors.length) { await svc.setError(Array.from(new Set(errors)).join(" • ")); weSetError = true; }
    else if (weSetError) { await svc.clearError(); weSetError = false; }
  } catch (e) {
    console.warn("[Grid & Rules] observer error", e);
  } finally {
    running = false;
    if (again) { again = false; run(false); }
  }
}

async function main() {
  await init(true);
  projectId = (await getProject()).id;
  SDK.register(SDK.getContributionId(), () => ({
    onLoaded: () => { config = undefined; formFields = undefined; run(true); },
    onFieldChanged: () => { run(false); },
    onSaved: () => { run(false); },
    onReset: () => { run(false); },
    onRefreshed: () => { run(false); },
  }));
}
main();
