import { validateConfig as validateGrid } from "../core/gridModel";
import { checkFormula } from "../core/expr";
import { ProjectConfig } from "../core/types";

export interface Issue { level: "error" | "warn"; where: string; message: string }

/** Minimal field metadata the validator needs (subset of shared/ado FieldInfo). */
export interface Fld { referenceName: string; name: string; type: string; readOnly: boolean; allowedValues?: string[] }
export interface Catalog {
  /** all fields in the org/project */
  all: Map<string, Fld>;
  /** fields per work item type, filled lazily by the UI */
  byType: Record<string, Map<string, Fld>>;
  types: string[];
}

export const makeCatalog = (all: Fld[], types: string[], byType: Record<string, Fld[]> = {}): Catalog => ({
  all: new Map(all.map(f => [f.referenceName, f])),
  byType: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, new Map(v.map(f => [f.referenceName, f]))])),
  types,
});

const NUMERIC = /^(integer|double|picklistInteger|picklistDouble)$/i;
const ci = (a: string, list: string[]) => list.some(x => x.toLowerCase() === a.toLowerCase());

function lookup(cat: Catalog, ref: string, types: string[]): { fld?: Fld; missingOn: string[] } {
  const fld = cat.all.get(ref) ?? Object.values(cat.byType).map(m => m.get(ref)).find(Boolean);
  const missingOn = types.filter(t => cat.byType[t] && !cat.byType[t].has(ref));
  return { fld, missingOn };
}

export function validateProject(cfg: ProjectConfig, cat: Catalog): Issue[] {
  const out: Issue[] = [];
  const add = (level: Issue["level"], where: string, message: string) => out.push({ level, where, message });

  const checkField = (where: string, ref: string, types: string[]) => {
    if (!ref) { add("error", where, "No field selected"); return undefined; }
    if (!cat.all.size) return undefined; // catalog not loaded
    const { fld, missingOn } = lookup(cat, ref, types);
    if (!fld) { add("error", where, `Field '${ref}' does not exist in this organization`); return undefined; }
    if (missingOn.length) add("warn", where, `'${fld.name}' is not on work item type ${missingOn.join(", ")}`);
    return fld;
  };
  const checkValues = (where: string, fld: Fld | undefined, values: string[], what: string) => {
    if (!fld?.allowedValues?.length) return;
    for (const v of values) if (v && !ci(v, fld.allowedValues)) add("error", where, `'${v}' is not an allowed value of ${fld.name} (${what})`);
  };
  for (const t of cfg.rules.flatMap(r => r.workItemTypes).concat(cfg.cascades.flatMap(c => c.workItemTypes)))
    if (cat.types.length && !cat.types.includes(t)) add("warn", "Types", `Work item type '${t}' does not exist in this project`);

  cfg.rules.forEach((r, i) => {
    const w = `Rule “${r.name || "#" + (i + 1)}”`;
    if (!r.name.trim()) add("warn", w, "Give the rule a name – it appears in error messages");
    if (!r.then.length && !(r.otherwise ?? []).length) add("warn", w, "The rule has no actions");
    r.when.conditions.forEach(c => {
      const f = checkField(w, c.field, r.workItemTypes);
      const needsValue = !["empty", "notEmpty"].includes(c.op);
      if (needsValue && !(c.value ?? "").trim()) add("error", w, `Condition on '${c.field}' needs a value`);
      if (["gt", "gte", "lt", "lte"].includes(c.op) && c.value && isNaN(parseFloat(c.value))) add("error", w, `'${c.value}' is not a number`);
      if (["equals", "notEquals", "in", "notIn"].includes(c.op) && f?.allowedValues?.length && c.value) {
        const vals = c.op === "in" || c.op === "notIn" ? c.value.split(",").map(s => s.trim()) : [c.value];
        for (const v of vals) if (v && !ci(v, f.allowedValues)) add("warn", w, `'${v}' is not a value of ${f.name}, so this condition may never match`);
      }
    });
    [...r.then, ...(r.otherwise ?? [])].forEach(a => {
      if (a.type === "error") { if (!a.message.trim()) add("error", w, "Error action needs a message"); return; }
      const f = checkField(w, a.field, r.workItemTypes);
      if (a.type === "setValue") {
        if (f?.readOnly) add("warn", w, `${f.name} is read-only; setting it may fail`);
        checkValues(w, f, [a.value], "set value");
        if (f && NUMERIC.test(f.type) && a.value !== "" && isNaN(parseFloat(a.value))) add("error", w, `${f.name} is numeric, '${a.value}' is not a number`);
      } else if (a.type === "restrictValues") {
        if (!a.values.length) add("error", w, "Restrict action needs at least one allowed value");
        checkValues(w, f, a.values, "restricted values");
      }
    });
  });

  cfg.cascades.forEach((c, i) => {
    const w = `Dependent “${c.child || "#" + (i + 1)}”`;
    const p = checkField(w, c.parent, c.workItemTypes), ch = checkField(w, c.child, c.workItemTypes);
    if (c.parent && c.parent === c.child) add("error", w, "Parent and dependent field must differ");
    if (!Object.keys(c.map).length) add("error", w, "No parent → dependent mappings");
    checkValues(w, p, Object.keys(c.map), "parent value");
    checkValues(w, ch, Object.values(c.map).flat(), "dependent value");
    (c.hints ?? []).forEach(h => { if (!h.areaPathUnder || !h.parentValue) add("error", w, "An Area Path hint is incomplete"); else checkValues(w, p, [h.parentValue], "hint"); });
    if (ch?.allowedValues?.length) {
      const used = new Set(Object.values(c.map).flat().map(v => v.toLowerCase()));
      const unused = ch.allowedValues.filter(v => !used.has(v.toLowerCase()));
      if (unused.length) add("warn", w, `${unused.length} ${ch.name} value(s) are not mapped to any parent (they can't be chosen when the parent is set): ${unused.slice(0, 5).join(", ")}${unused.length > 5 ? "…" : ""}`);
    }
  });

  for (const [name, g] of Object.entries(cfg.grids)) {
    const w = `Grid “${name}”`;
    validateGrid(g).forEach(m => add("error", w, m));
    g.columns.forEach(c => { if (c.formula) { const e = checkFormula(c.formula); if (e) add("error", w, `Formula of '${c.id}': ${e}`); } });
    g.columns.forEach(c => { if (c.type === "dropdown" && c.dependsOn) for (const [k, v] of Object.entries(c.dependsOn.map)) if (!v.length) add("warn", w, `'${c.id}': no options for parent value '${k}'`); });
    if (!g.dataField) add("warn", w, "No data field set – it must then be set on the form control");
    else {
      const f = checkField(w, g.dataField, []);
      if (f && NUMERIC.test(f.type)) add("error", w, `Data field ${f.name} must be a text field`);
    }
    (g.totals ?? []).forEach(t => {
      const f = checkField(w, t.field, []);
      if (f && !NUMERIC.test(f.type)) add("error", w, `${f.name} is not numeric; a total can only be written to an Integer/Decimal field`);
      if (f?.readOnly) add("warn", w, `${f.name} is read-only`);
    });
    if (g.child?.enabled) {
      const types = g.child.workItemType ? [g.child.workItemType] : [];
      if (!g.child.workItemType) add("error", w, "Child work item type is required");
      for (const ref of Object.values(g.child.fieldMap ?? {})) if (ref) checkField(w, ref, types);
    }
  }
  return out;
}
