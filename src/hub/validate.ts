import { isNoLimit, validateConfig as validateGrid } from "../core/gridModel";
import { checkFormula } from "../core/expr";
import { ProjectConfig } from "../core/types";
import { orderCalculations, undefinedVariables } from "../core/calc";
import { lookupValues, resolvedGrids } from "../core/sharedLookups";
import { extractRefs, FUNCTION_NAMES } from "../core/expr";

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

export function validateProject(raw: ProjectConfig, cat: Catalog): Issue[] {
  const out: Issue[] = [];
  // shared mappings applied, so every check below sees the effective lookup tables
  const cfg: ProjectConfig = { ...raw, grids: resolvedGrids(raw) };
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
    g.columns.forEach(c => { if (c.lookup?.table && !(raw.lookups ?? {})[c.lookup.table]) add("error", w, `'${c.id}' uses shared mapping '${c.lookup.table}', which does not exist`); });
    validateGrid(g).forEach(m => add("error", w, m));
    g.columns.forEach(c => {
      if (!c.formula) return;
      const e = checkFormula(c.formula);
      if (e) { add("error", w, `Formula of '${c.id}': ${e}`); return; }
      for (const ref of extractRefs(c.formula)) {
        if (!g.columns.some(x => x.id.toLowerCase() === ref.toLowerCase() || x.name.toLowerCase() === ref.toLowerCase())) add("error", w, `Formula of '${c.id}' uses '${ref}', which is not a column of this grid`);
        else if (ref.toLowerCase() === c.id.toLowerCase()) add("error", w, `Formula of '${c.id}' refers to itself`);
      }
    });
    g.columns.forEach(c => {
      if (!c.statusBands) return;
      const src = g.columns.find(x => x.id === c.statusBands!.source);
      if (src && src.type !== "number" && src.type !== "calculated") add("warn", w, `Status column '${c.id}': '${src.name}' is not a number column, so no status will be set`);
      if (c.statusBands.ranges.length && !isNoLimit(c.statusBands.ranges[c.statusBands.ranges.length - 1].upTo)) add("warn", w, `Status column '${c.id}': the last range has an upper limit, so larger values get no status – leave “up to” empty on the last range`);
    });
    // ---- review (approve / reject)
    if (g.review) {
      const r = g.review;
      if (g.derived) add("warn", w, "Review is set on a derived grid, where rows cannot be approved – set it on the source grid");
      const sc = g.columns.find(c => c.id === r.statusColumn);
      if (sc && (sc.type !== "string" || sc.lookup || sc.formula || sc.statusBands)) add("warn", w, `The review status column '${sc.id}' should be a plain text column`);
      if (!r.approvers.length && !r.admins.teams.length && !r.admins.people.length) add("warn", w, "Review: no approver rule or grid administrator is set, so only project administrators can approve or reject rows");
      r.approvers.forEach(a => { if (!a.teams.length && !a.people.length) add("warn", w, `Review: approver rule “${a.name || "(unnamed)"}” has no team or person, so nobody can use it`); if (a.when && !a.when.values.length) add("warn", w, `Review: approver rule “${a.name || "(unnamed)"}” has a condition without values, so it never applies`); });
      if (r.noSelfApproval && !g.schedule && !g.columns.some(c => c.type === "identity")) add("warn", w, "Review: “nobody approves their own row” needs a people-picker column to know who the row is about");
      if (r.secure?.dataField) {
        const f = checkField(w, r.secure.dataField, []);
        if (f && NUMERIC.test(f.type)) add("error", w, `The approvals field ${f.name} must be a text field`);
        if (Object.entries(cfg.grids).some(([n, o]) => n !== name && (o.dataField === r.secure!.dataField || o.review?.secure?.dataField === r.secure!.dataField))) add("error", w, "The approvals field is also used by another grid; every grid needs its own");
        if (!r.approvers.length && !r.admins.teams.length && !r.admins.people.length) add("warn", w, "Secure approvals are on, but no approver is set in the extension; the field rule decides who may write, the rules here decide who sees the buttons");
      }
      if (!r.reasonColumn) add("warn", w, "Review: no comment column is set, so approvers cannot leave a reject reason");
    }
    // ---- presets
    const presetNames = new Set<string>();
    (g.presets ?? []).forEach(pr => {
      const pw = `${w} › preset “${pr.name || "(unnamed)"}”`;
      if (!pr.name.trim()) add("error", pw, "The preset has no name");
      else if (presetNames.has(pr.name.trim().toLowerCase())) add("error", pw, "Another preset has the same name");
      presetNames.add(pr.name.trim().toLowerCase());
      pr.columns.forEach(id => { if (!g.columns.some(c => c.id === id)) add("error", pw, `It keeps the column '${id}', which does not exist`); });
      if (!pr.rows.length) add("warn", pw, "The preset has no rows");
      (pr.when ?? []).forEach(wh => {
        if (!wh.field) add("error", pw, "A rule has no field");
        else { checkField(pw, wh.field, []); if (!wh.values.length) add("warn", pw, `The rule on ${wh.field} has no value, so it never matches`); }
      });
      const bad = new Set<string>();
      pr.rows.forEach(r => pr.columns.forEach(id => {
        const c = g.columns.find(x => x.id === id);
        const v = String(r[id] ?? "");
        const opts = c?.options ?? (c?.dependsOn ? Object.values(c.dependsOn.map).flat() : undefined);
        if (c && c.type === "dropdown" && v && opts && !opts.some(o => o.toLowerCase() === v.toLowerCase())) bad.add(`${c.name}: ${v}`);
      }));
      if (bad.size) add("warn", pw, `Some values are not in the column's options: ${Array.from(bad).slice(0, 4).join("; ")}${bad.size > 4 ? "…" : ""}`);
    });
    if (g.presetSave?.enabled && !g.presetSave.admins && !g.presetSave.teams.length) add("warn", w, "“Save as preset” is on, but neither project administrators nor a team may use it");
    // ---- derived grids
    if (g.derived) {
      const src = cfg.grids[g.derived.source];
      if (!g.derived.source || !src) add("error", w, `Source grid '${g.derived.source}' does not exist`);
      else if (src.derived) add("error", w, `Source grid '${g.derived.source}' is itself derived; chain only one level`);
      else if (g.derived.source === name) add("error", w, "A grid cannot be derived from itself");
      if (!g.dataField) add("error", w, "A derived grid needs its own data field (a long-text field) to remember manual entries");
      else if (g.dataField === src?.dataField) add("error", w, "A derived grid needs a different data field than its source grid");
      if (g.allocation) {
        for (const [k, label] of [["resource", "person"], ["period", "month"], ["hours", "hours"]] as const) {
          const colId = g.allocation[k];
          const col = g.columns.find(x => x.id === colId);
          if (!col) add("error", w, `Publishing: pick the ${label} column`);
          else if (k !== "hours" && col.derive?.role !== "key") add("error", w, `Publishing: the ${label} column must be a KEY column`);
          else if (k === "hours" && col.type !== "number") add("warn", w, "Publishing: the hours column should be a number column");
        }
      }
      if (!g.columns.some(c => c.derive?.role === "key")) add("error", w, "Mark at least one column as a KEY (e.g. Resource, Period) so rows can be created");
      g.columns.forEach(c => {
        if (c.capacity) {
          const keyIds = g.columns.filter(x => x.derive?.role === "key").map(x => x.id);
          if (!keyIds.includes(c.capacity.resource)) add("error", w, `Column '${c.id}': the person column must be one of the KEY columns`);
          if (!keyIds.includes(c.capacity.period)) add("error", w, `Column '${c.id}': the month column must be one of the KEY columns`);
          else if (g.columns.find(x => x.id === c.capacity!.period)?.derive?.bucket !== "month") add("warn", w, `Column '${c.id}': the month column should group dates by month`);
        }
        if (c.others) {
          const keyIds = g.columns.filter(x => x.derive?.role === "key").map(x => x.id);
          if (!keyIds.includes(c.others.resource) || !keyIds.includes(c.others.period)) add("error", w, `Column '${c.id}': the person and month columns must be KEY columns`);
          if (!Object.values(cfg.grids).some(x => x.allocation)) add("warn", w, `Column '${c.id}' shows hours of other Epics, but no grid publishes its hours yet – turn on “Publish this grid's hours”`);
        }
        if (c.teamOf) {
          const keyIds = g.columns.filter(x => x.derive?.role === "key").map(x => x.id);
          if (!keyIds.includes(c.teamOf.resource)) add("error", w, `Column '${c.id}': the person column must be one of the KEY columns`);
        }
        if (!c.derive) return;
        if (!c.derive.source) add("error", w, `Column '${c.id}': pick the source column`);
        else if (src && !src.columns.some(x => x.id === c.derive!.source) && !(src.schedule && (c.derive.source === "_month" || c.derive.source === "_hours"))) add("error", w, `Column '${c.id}': '${c.derive.source}' is not a column of '${g.derived!.source}'${src.schedule ? " – it is scheduled by dates, so use the “Scheduled month” / “Scheduled hours” source (button “Use the scheduled month and hours” in this grid)" : ""}`);
        else if (src && c.derive.role === "agg" && c.derive.aggregate !== "count" && src.columns.find(x => x.id === c.derive!.source)?.type !== "number") add("warn", w, `Column '${c.id}' aggregates a column that is not a number`);
      });
      if (src?.schedule && !g.columns.some(c => c.derive?.source === "_month") && g.columns.some(c => c.derive)) add("warn", w, `The source grid '${g.derived.source}' is scheduled by dates, so month columns should use the source “Scheduled month” (_month) and hours the “Scheduled hours” (_hours)`);
      if (src?.schedule) g.columns.forEach(c => { if (c.derive?.role === "agg" && c.derive.source === src.schedule!.effort) add("warn", w, `Column '${c.id}' adds up the effort of '${g.derived!.source}', which would count the whole effort in every month the task touches – use “Scheduled hours” (_hours) instead`); });
      if (src && !src.schedule && g.columns.some(c => c.derive?.source === "_month" || c.derive?.source === "_hours")) add("error", w, `Source grid '${g.derived.source}' is not scheduled, so “Scheduled month/hours” do not exist`);
    } else if (g.schedule && !g.dataField) add("warn", w, "No data field set – it must then be set on the form control");
    else if (g.allocation) add("warn", w, "This grid is set to publish hours, but it is not derived, so nothing is published");
    else if (g.columns.some(c => c.capacity || c.others || c.teamOf)) add("warn", w, "A column takes its value from the Capacity register, but this grid is not derived, so it is ignored");
    else if (g.columns.some(c => c.derive)) add("warn", w, "Some columns have a source set, but this grid is not marked as derived, so they are ignored");
    g.columns.forEach(c => { if (c.type === "dropdown" && c.dependsOn) for (const [k, v] of Object.entries(c.dependsOn.map)) if (!v.length) add("warn", w, `'${c.id}': no options for parent value '${k}'`); });
    if (!g.dataField) add("warn", w, "No data field set – it must then be set on the form control");
    else {
      const f = checkField(w, g.dataField, []);
      if (f && NUMERIC.test(f.type)) add("error", w, `Data field ${f.name} must be a text field`);
    }
    g.columns.forEach(c => {
      if (!c.lookup) return;
      const src = g.columns.find(x => x.id === c.lookup!.column);
      const known = src?.options ?? (src?.dependsOn ? Object.values(src.dependsOn.map).flat() : undefined);
      if (known?.length) {
        const missing = known.filter(o => !Object.keys(c.lookup!.map).some(k => k.toLowerCase() === o.toLowerCase()));
        if (missing.length && !c.lookup!.fallback) add("warn", w, `'${c.id}' has no auto-fill value for ${missing.length} option(s) of '${src!.id}': ${missing.slice(0, 4).join(", ")}${missing.length > 4 ? "…" : ""}`);
        const extra = Object.keys(c.lookup!.map).filter(k => !known.some(o => o.toLowerCase() === k.toLowerCase()));
        if (extra.length) add("warn", w, `'${c.id}' lookup lists value(s) that '${src!.id}' does not offer: ${extra.slice(0, 4).join(", ")}`);
      }
    });
    (g.totals ?? []).forEach(t => {
      const f = checkField(w, t.field, []);
      if (f && !NUMERIC.test(f.type)) add("error", w, `${f.name} is not numeric; a total can only be written to an Integer/Decimal field`);
      if (f?.readOnly) add("warn", w, `${f.name} is read-only`);
      const wc = t.where && g.columns.find(x => x.id === t.where!.column);
      const opts = wc?.options ?? (wc?.lookup ? lookupValues(wc) : undefined);
      if (t.where && opts?.length) for (const v of t.where.values) if (!opts.some(o => o.toLowerCase() === v.toLowerCase())) add("warn", w, `Filter value '${v}' is not an option of '${wc!.id}', so this total will be 0`);
    });
    (g.breakdowns ?? []).forEach(b => Object.entries(b.fields ?? {}).forEach(([grp, ref]) => {
      const f = checkField(w, ref, []);
      if (f && !NUMERIC.test(f.type)) add("error", w, `${f.name} (for '${grp}') is not numeric; a grouped total can only be written to an Integer/Decimal field`);
      if (f?.readOnly) add("warn", w, `${f.name} is read-only`);
    }));
    if (g.child?.enabled) {
      const types = g.child.workItemType ? [g.child.workItemType] : [];
      if (!g.child.workItemType) add("error", w, "Child work item type is required");
      for (const ref of Object.values(g.child.fieldMap ?? {})) if (ref) checkField(w, ref, types);
    }
  }

  // ---- shared mappings
  for (const [name, t] of Object.entries(raw.lookups ?? {})) {
    const w = `Mapping “${name}”`;
    if (!Object.keys(t.map).length && !t.fallback) add("error", w, "The mapping has no values and no fallback");
    if (!Object.values(raw.grids).some(g => g.columns.some(c => c.lookup?.table === name))) add("warn", w, "No grid column uses this mapping yet – add a column that auto-fills from another column (Grids → column → Auto-fill → Mapping), or delete the mapping if you no longer need it");
  }

  // ---- calculations
  const calcs = cfg.calculations ?? [];
  const written = new Map<string, string>();
  for (const g of Object.values(cfg.grids)) {
    (g.totals ?? []).forEach(t => t.field && written.set(t.field, "a grid total"));
    (g.breakdowns ?? []).forEach(b => Object.values(b.fields ?? {}).forEach(f => f && written.set(f, "a grid breakdown")));
  }
  const { cyclic } = orderCalculations(calcs.filter(c => c.enabled));
  calcs.forEach((c, i) => {
    const w = `Calculation “${c.name || "#" + (i + 1)}”`;
    if (!c.name.trim()) add("warn", w, "Give the calculation a name");
    if (!c.formula.trim()) add("error", w, "The formula is empty");
    else { const e = checkFormula(c.formula); if (e) add("error", w, `Formula: ${e}`); }
    undefinedVariables(c).forEach(v => add("error", w, `Formula uses '${v}', which is not defined as an input`));
    const seen = new Set<string>();
    c.inputs.forEach(inp => {
      const n = inp.name.toLowerCase();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(inp.name)) add("error", w, `Input name '${inp.name}' must start with a letter and use only letters, digits and _`);
      else if (FUNCTION_NAMES.includes(inp.name.toUpperCase())) add("error", w, `Input name '${inp.name}' is a reserved function name`);
      if (seen.has(n)) add("error", w, `Input name '${inp.name}' is used twice`);
      seen.add(n);
      if (c.formula.trim() && !new RegExp(`\\b${inp.name}\\b`, "i").test(c.formula)) add("warn", w, `Input '${inp.name}' is not used in the formula`);
      if (inp.source.kind === "field") {
        const f = checkField(w, inp.source.field, c.workItemTypes);
        if (f && /^(html|history|guid)$/i.test(f.type)) add("warn", w, `${f.name} is a ${f.type} field and may not hold a number`);
      } else {
        const g = cfg.grids[inp.source.grid];
        if (!g) add("error", w, `Input '${inp.name}' uses grid '${inp.source.grid}', which does not exist`);
        else {
          if (!g.columns.some(col => col.id === (inp.source as { column: string }).column)) add("error", w, `Input '${inp.name}': pick a column of grid '${inp.source.grid}'`);
          if (!g.dataField) add("error", w, `Grid '${inp.source.grid}' has no data field saved in its definition, so this calculation sees an empty grid (the result stays blank). Open Grids → ${inp.source.grid} and enter the same long-text Data field the form control uses, then Save.`);
          if (inp.source.kind === "top") {
            const gb = g.columns.find(col => col.id === (inp.source as { groupBy: string }).groupBy);
            if (!gb) add("error", w, `Input '${inp.name}': pick the column to group by`);
            const vc = g.columns.find(col => col.id === (inp.source as { column: string }).column);
            if (vc && vc.type !== "number" && inp.source.aggregate !== "count") add("warn", w, `Input '${inp.name}': '${vc.name}' is not a number column, so its ${inp.source.aggregate} will be 0`);
            if (inp.source.bucket && inp.source.bucket !== "day" && gb && gb.type !== "date") add("warn", w, `Input '${inp.name}': grouping by month/quarter/year only applies to date columns ('${gb.name}' is ${gb.type})`);
            const rtype = c.resultField ? cat.all.get(c.resultField)?.type ?? "" : "";
            if (inp.source.return !== "value" && NUMERIC.test(rtype) && c.formula.trim().toLowerCase() === inp.name.toLowerCase())
              add("error", w, `Input '${inp.name}' returns a group name (text) but ${c.resultField} is numeric – choose “the figure” instead, or a text field`);
          }
          (inp.source.where ?? []).forEach(cond => {
            const col = g.columns.find(x => x.id === cond.column);
            if (!col) add("error", w, `Input '${inp.name}': a condition uses an unknown column`);
            else if (!cond.values.length) add("error", w, `Input '${inp.name}': a condition on '${col.name}' has no value`);
            else {
              const opts = col.options ?? (col.lookup ? lookupValues(col) : undefined);
              if (opts?.length) for (const v of cond.values) if (!opts.some(o => o.toLowerCase() === v.toLowerCase())) add("warn", w, `'${v}' is not a value of '${col.name}', so this input may always be 0`);
            }
          });
        }
      }
    });
    const rf = checkField(w, c.resultField, c.workItemTypes);
    if (rf?.readOnly) add("warn", w, `${rf.name} is read-only; writing the result may fail`);
    if (rf && /^(html|history|guid|boolean)$/i.test(rf.type)) add("error", w, `${rf.name} (${rf.type}) cannot hold a calculated result`);
    if (c.resultField) {
      const other = calcs.find((x, j) => j !== i && x.resultField === c.resultField);
      if (other) add("error", w, `${c.resultField} is also written by calculation “${other.name}”`);
      if (written.has(c.resultField)) add("error", w, `${c.resultField} is also written by ${written.get(c.resultField)}`);
    }
    if (cyclic.some(x => x.id === c.id)) add("error", w, "Circular dependency: this calculation (directly or through others) depends on its own result");
    if (rf && !/^(string|plainText|picklistString)$/i.test(rf.type) && /"/.test(c.formula)) add("warn", w, `The formula uses text but ${rf.name} is ${rf.type || "not a text field"}`);
  });
  return out;
}
