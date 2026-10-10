import * as SDK from "azure-devops-extension-sdk";
import { Cascade, ProjectConfig, Rule } from "../core/types";
import { cascadeApplies, cascadeErrors, evaluateRules, hintedParent, ruleApplies } from "../core/rules";
import { getFormService, getProject, init, loadConfig } from "../shared/ado";

/**
 * Rules observer: runs invisibly on every work item form.
 * Supports set-value, conditional required, restricted values, custom errors,
 * and dependent-dropdown validation + Area-Path hints. Errors block save via form.setError.
 */
let config: ProjectConfig | undefined;
let projectId = "";
let weSetError = false;
let running = false;
let again = false;

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
    if (!rules.length && !cascades.length) { if (weSetError) { await svc.clearError(); weSetError = false; } return; }
    const refs = refsOf(rules, cascades);

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
      errors = [...out.errors, ...cascadeErrors(cascades, type, k => (k in toSet ? toSet[k] : values[k]))];
      if (!Object.keys(toSet).length) break;
      await svc.setFieldValues(toSet);
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
    onLoaded: () => { config = undefined; run(true); },
    onFieldChanged: () => { run(false); },
    onSaved: () => { run(false); },
    onReset: () => { run(false); },
    onRefreshed: () => { run(false); },
  }));
}
main();
