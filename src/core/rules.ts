import { Action, Cascade, Condition, ConditionGroup, Rule } from "./types";

export type FieldGetter = (refName: string) => unknown;

const str = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "object" ? String((v as { displayName?: string }).displayName ?? v) : String(v));
const isEmpty = (v: unknown) => str(v).trim() === "";

export function evalCondition(c: Condition, get: FieldGetter): boolean {
  const raw = get(c.field);
  const v = str(raw), t = c.value ?? "";
  const lc = (s: string) => s.toLowerCase();
  const list = () => t.split(",").map(s => s.trim()).filter(Boolean);
  const numeric = () => [parseFloat(v), parseFloat(t)] as const;
  switch (c.op) {
    case "equals": return lc(v) === lc(t);
    case "notEquals": return lc(v) !== lc(t);
    case "contains": return lc(v).includes(lc(t));
    case "notContains": return !lc(v).includes(lc(t));
    case "startsWith": return lc(v).startsWith(lc(t));
    case "in": return list().some(x => lc(x) === lc(v));
    case "notIn": return !list().some(x => lc(x) === lc(v));
    case "empty": return isEmpty(raw);
    case "notEmpty": return !isEmpty(raw);
    case "gt": { const [a, b] = numeric(); return a > b; }
    case "gte": { const [a, b] = numeric(); return a >= b; }
    case "lt": { const [a, b] = numeric(); return a < b; }
    case "lte": { const [a, b] = numeric(); return a <= b; }
    case "under": return lc(v) === lc(t) || lc(v).startsWith(lc(t) + "\\");
    default: return false;
  }
}

export function evalGroup(g: ConditionGroup, get: FieldGetter): boolean {
  if (!g.conditions.length) return true;
  return g.match === "any" ? g.conditions.some(c => evalCondition(c, get)) : g.conditions.every(c => evalCondition(c, get));
}

export function ruleApplies(rule: Rule, workItemType: string): boolean {
  return rule.enabled && (!rule.workItemTypes.length || rule.workItemTypes.includes(workItemType));
}

/** Actions to run for the current field state (then or otherwise branch). */
export function actionsFor(rule: Rule, get: FieldGetter): Action[] {
  return evalGroup(rule.when, get) ? rule.then : rule.otherwise ?? [];
}

export interface Outcome {
  /** field -> value to set (only when it differs from the current value) */
  setValues: Record<string, string>;
  /** blocking messages (shown through the form's setError) */
  errors: string[];
}

export function evaluateRules(rules: Rule[], workItemType: string, get: FieldGetter): Outcome {
  const out: Outcome = { setValues: {}, errors: [] };
  for (const rule of rules) {
    if (!ruleApplies(rule, workItemType)) continue;
    for (const a of actionsFor(rule, get)) {
      switch (a.type) {
        case "setValue":
          if (str(get(a.field)) !== a.value) out.setValues[a.field] = a.value;
          break;
        case "requireField":
          if (isEmpty(get(a.field))) out.errors.push(a.message || `${a.field} is required (${rule.name})`);
          break;
        case "restrictValues": {
          const cur = str(get(a.field));
          if (cur && !a.values.some(x => x.toLowerCase() === cur.toLowerCase()))
            out.errors.push(a.message || `'${cur}' is not allowed for ${a.field} (${rule.name})`);
          break;
        }
        case "error":
          out.errors.push(a.message);
          break;
      }
    }
  }
  return out;
}

export function cascadeApplies(c: Cascade, workItemType: string) {
  return !c.workItemTypes.length || c.workItemTypes.includes(workItemType);
}

/** Allowed child values for the parent value; null = unrestricted (parent empty / unmapped). */
export function allowedChildValues(c: Cascade, parentValue: unknown): string[] | null {
  const p = str(parentValue);
  if (!p) return null;
  const key = Object.keys(c.map).find(k => k.toLowerCase() === p.toLowerCase());
  return key ? c.map[key] : null;
}

export function cascadeErrors(cascades: Cascade[], workItemType: string, get: FieldGetter): string[] {
  const errs: string[] = [];
  for (const c of cascades) {
    if (!cascadeApplies(c, workItemType)) continue;
    const allowed = allowedChildValues(c, get(c.parent));
    const child = str(get(c.child));
    if (allowed && child && !allowed.some(a => a.toLowerCase() === child.toLowerCase()))
      errs.push(`'${child}' is not valid for ${c.parent} = '${str(get(c.parent))}'`);
  }
  return errs;
}

/** Parent value suggested by area path hints (deepest matching hint wins). */
export function hintedParent(c: Cascade, areaPath: string): string | null {
  let best: { len: number; v: string } | null = null;
  for (const h of c.hints ?? []) {
    if (evalCondition({ field: "x", op: "under", value: h.areaPathUnder }, () => areaPath) && (!best || h.areaPathUnder.length > best.len))
      best = { len: h.areaPathUnder.length, v: h.parentValue };
  }
  return best ? best.v : null;
}

/** Convert the config format of the njpaul/ms "Dependent Lists" extension. */
export function importLegacyCascades(json: unknown): Cascade[] {
  const out: Cascade[] = [];
  const casc = (json as { cascades?: Record<string, Record<string, Record<string, unknown>>> })?.cascades ?? {};
  for (const parent of Object.keys(casc)) {
    const byChild: Record<string, Cascade> = {};
    for (const pv of Object.keys(casc[parent])) {
      const entry = casc[parent][pv];
      for (const k of Object.keys(entry)) {
        if (k === "hint") continue;
        const child = (byChild[k] ??= { id: `${parent}>${k}`, parent, child: k, workItemTypes: [], map: {}, hints: [] });
        child.map[pv] = (entry[k] as string[]) ?? [];
        const hint = entry.hint as { when?: string; is?: string } | undefined;
        if (hint?.when === "Area Path" && hint.is) child.hints!.push({ areaPathUnder: hint.is, parentValue: pv });
      }
    }
    out.push(...Object.values(byChild));
  }
  return out;
}
