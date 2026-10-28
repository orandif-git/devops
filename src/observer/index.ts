import * as SDK from "azure-devops-extension-sdk";
import { Cascade, ControlRule, ProjectConfig, Rule } from "../core/types";
import { calcApplies, calcRefs, evaluateCalculations } from "../core/calc";
import { resolvedGrids } from "../core/sharedLookups";
import { cascadeApplies, cascadeErrors, evaluateRules, hintedParent, ruleApplies } from "../core/rules";
import { getFormService, getProject } from "../shared/ado";
import { loadConfig } from "../shared/configStore";
import { revertsForRules } from "../core/commentOnly";
import { writtenFields } from "../core/written";
import { restrictedRules } from "../shared/commentOnlyAccess";

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
let startupRetries = 0;

const refsOf = (rules: Rule[], cascades: Cascade[]) => {
  const s = new Set<string>(["System.WorkItemType", "System.AreaPath"]);
  for (const r of rules) {
    r.when.conditions.forEach(c => s.add(c.field));
    [...r.then, ...(r.otherwise ?? [])].forEach(a => { if ("field" in a) s.add(a.field); });
  }
  for (const c of cascades) { s.add(c.parent); s.add(c.child); }
  return Array.from(s);
};

// ---- controls guard: people restricted by a rule cannot change what the rule protects; any such change is put back ----
interface Guard { rules: ControlRule[]; /** a comments-only rule applies: rules and calculations must not write for this user */ skipRun: boolean; /** fields the extension writes itself: never undone */ exempt: Set<string> }
let guardP: Promise<Guard> | undefined;
let snapshot: Record<string, unknown> | undefined;
let reverting = false;
let guardTimer: number | undefined;

/** Decide (once per load) which rules restrict this user on this work item, and remember the field values as opened. */
function prepareGuard(): Promise<Guard> {
  return (async () => {
    const none: Guard = { rules: [], skipRun: false, exempt: new Set() };
    try {
      if (!projectId) projectId = (await getProject()).id;
      if (!config) config = await loadConfig(projectId);
      const rules = (config.controls ?? []).filter(r => r.enabled);
      if (!rules.length) return none;
      const svc = await getFormService();
      if (await svc.isNew()) return none;
      const mine = await restrictedRules(projectId, rules, String(await svc.getFieldValue("System.WorkItemType")));
      if (!mine.length) return none;
      const refs = (await svc.getFields()).map(f => f.referenceName);
      snapshot = (await svc.getFieldValues(refs)) as Record<string, unknown>;
      return { rules: mine, skipRun: mine.some(r => r.mode === "comments"), exempt: new Set(writtenFields(config).map(w => w.field.toLowerCase())) };
    } catch (e) { console.warn("[Grid & Rules] controls guard could not start:", (e as Error).message); return none; }
  })();
}

async function guardChange(changed: Record<string, unknown>) {
  const g = await guardP;
  if (!g?.rules.length || !snapshot || reverting) return;
  const back = revertsForRules(changed, snapshot, g.rules, g.exempt);
  if (!back.length) return;
  const svc = await getFormService();
  reverting = true;
  try { for (const b of back) { try { await svc.setFieldValue(b.field, (b.value ?? "") as Object); } catch (e) { console.warn(`[Grid & Rules] could not undo ${b.field}:`, (e as Error).message); } } }
  finally { window.setTimeout(() => { reverting = false; }, 300); }
  try { await svc.setError(Array.from(new Set(back.map(b => b.message))).join(" ")); window.clearTimeout(guardTimer); guardTimer = window.setTimeout(() => { svc.clearError().catch(() => undefined); }, 6000); } catch { /* message only */ }
}

async function run(isLoad: boolean) {
  if (running) { again = true; return; }
  running = true;
  try {
    if (!projectId) projectId = (await getProject()).id;
    if (!config) config = await loadConfig(projectId);
    const svc = await getFormService();
    const type = String(await svc.getFieldValue("System.WorkItemType"));
    if (!guardP) guardP = prepareGuard();
    if ((await guardP).skipRun) return;                      // comments-only users: no rules or calculations write to the work item
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
        c.notes.forEach(n => console.info("[Grid & Rules] calculation:", n));
        if (pass === 0) console.info(`[Grid & Rules] ${calcs.length} calculation(s) on ${type}; fields available: ${refs.length}; changes:`, JSON.stringify(c.changes));
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
    if (isLoad && startupRetries < 3) { startupRetries++; window.setTimeout(() => { config = undefined; formFields = undefined; run(true); }, 1500 * startupRetries); }
  } finally {
    running = false;
    if (again) { again = false; run(false); }
  }
}

async function main() {
  // Register for form events FIRST, so the "work item loaded" event is never missed while we look things up.
  await SDK.init({ loaded: false, applyTheme: false });
  await SDK.ready();
  SDK.register(SDK.getContributionId(), () => ({
    onLoaded: () => { config = undefined; formFields = undefined; snapshot = undefined; guardP = undefined; guardP = prepareGuard(); run(true); },
    onFieldChanged: (a: { changedFields?: Record<string, unknown> }) => { if (a?.changedFields) guardChange(a.changedFields).catch(() => undefined); run(false); },
    onSaved: () => { snapshot = undefined; guardP = prepareGuard(); run(false); },
    onReset: () => { snapshot = undefined; guardP = prepareGuard(); run(false); },
    onRefreshed: () => { snapshot = undefined; guardP = prepareGuard(); run(false); },
  }));
  await SDK.notifyLoadSucceeded();
  console.info("[Grid & Rules] observer started");
  run(true);                       // the form may already be loaded before we started listening
}
main();
