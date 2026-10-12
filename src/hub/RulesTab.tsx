import * as React from "react";
import { Action, Condition, Operator, Rule } from "../core/types";
import { delAt, FieldInput, setAt, TypeChips, uid, ValueInput, csv, activate } from "./ui";
import { Issue } from "./validate";

const OPS: [Operator, string][] = [
  ["equals", "equals"], ["notEquals", "does not equal"], ["contains", "contains"], ["notContains", "does not contain"],
  ["startsWith", "starts with"], ["in", "is one of (a, b)"], ["notIn", "is not one of"], ["empty", "is empty"], ["notEmpty", "is not empty"],
  ["gt", ">"], ["gte", "≥"], ["lt", "<"], ["lte", "≤"], ["under", "is under (area/iteration path)"],
];
const ACTIONS: [Action["type"], string][] = [
  ["setValue", "Set field value"], ["requireField", "Require field (block save if empty)"],
  ["restrictValues", "Only allow values"], ["error", "Block save with message"],
];

const blankAction = (t: Action["type"]): Action =>
  t === "setValue" ? { type: t, field: "", value: "" } : t === "requireField" ? { type: t, field: "" } : t === "restrictValues" ? { type: t, field: "", values: [] } : { type: "error", message: "" };

function ActionRows(p: { actions: Action[]; onChange(a: Action[]): void }) {
  return (
    <>
      {p.actions.map((a, i) => (
        <div className="row" key={i}>
          <select className="fixed" value={a.type} onChange={e => p.onChange(setAt(p.actions, i, blankAction(e.target.value as Action["type"])))}>
            {ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {"field" in a && <FieldInput value={a.field} onChange={field => p.onChange(setAt(p.actions, i, { ...a, field } as Action))} />}
          {a.type === "setValue" && <ValueInput field={a.field} value={a.value} onChange={value => p.onChange(setAt(p.actions, i, { ...a, value }))} />}
          {a.type === "restrictValues" && <input placeholder="Allowed values, comma separated" defaultValue={a.values.join(", ")} key={a.field + a.values.join("\u0001")}
            onBlur={e => p.onChange(setAt(p.actions, i, { ...a, values: csv(e.target.value) }))} />}
          {a.type === "requireField" && <input placeholder="Message (optional)" value={a.message ?? ""} onChange={e => p.onChange(setAt(p.actions, i, { ...a, message: e.target.value }))} />}
          {a.type === "restrictValues" && <input placeholder="Message (optional)" value={a.message ?? ""} onChange={e => p.onChange(setAt(p.actions, i, { ...a, message: e.target.value }))} />}
          {a.type === "error" && <input placeholder="Message shown on the form" value={a.message} onChange={e => p.onChange(setAt(p.actions, i, { ...a, message: e.target.value }))} />}
          <button className="btn icon danger fixed" onClick={() => p.onChange(delAt(p.actions, i))}>✕</button>
        </div>
      ))}
      <button className="btn" onClick={() => p.onChange([...p.actions, blankAction("setValue")])}>+ Add action</button>
    </>
  );
}

function RuleEditor(p: { rule: Rule; onChange(r: Rule): void; issues: Issue[] }) {
  const r = p.rule;
  const setCond = (i: number, c: Condition) => p.onChange({ ...r, when: { ...r.when, conditions: setAt(r.when.conditions, i, c) } });
  return (
    <div>
      <div className="row">
        <input value={r.name} placeholder="Rule name" onChange={e => p.onChange({ ...r, name: e.target.value })} style={{ fontWeight: 600 }} />
        <label className="fixed"><input type="checkbox" checked={r.enabled} onChange={e => p.onChange({ ...r, enabled: e.target.checked })} /> Enabled</label>
      </div>
      <h3>Work item types</h3>
      <TypeChips value={r.workItemTypes} onChange={workItemTypes => p.onChange({ ...r, workItemTypes })} />
      <h3>When</h3>
      <div className="row">
        <select className="fixed" value={r.when.match} onChange={e => p.onChange({ ...r, when: { ...r.when, match: e.target.value as "all" | "any" } })}>
          <option value="all">ALL of these are true</option><option value="any">ANY of these is true</option>
        </select>
      </div>
      {r.when.conditions.map((c, i) => (
        <div className="row" key={i}>
          <FieldInput value={c.field} onChange={field => setCond(i, { ...c, field })} />
          <select className="fixed" value={c.op} onChange={e => setCond(i, { ...c, op: e.target.value as Operator })}>{OPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          {!["empty", "notEmpty"].includes(c.op) && <ValueInput field={c.field} value={c.value ?? ""} onChange={value => setCond(i, { ...c, value })} />}
          <button className="btn icon danger fixed" onClick={() => p.onChange({ ...r, when: { ...r.when, conditions: delAt(r.when.conditions, i) } })}>✕</button>
        </div>
      ))}
      <button className="btn" onClick={() => p.onChange({ ...r, when: { ...r.when, conditions: [...r.when.conditions, { field: "", op: "equals", value: "" }] } })}>+ Add condition</button>
      {!r.when.conditions.length && <div className="help">No conditions: the rule always applies.</div>}
      <h3>Then</h3>
      <ActionRows actions={r.then} onChange={then => p.onChange({ ...r, then })} />
      <h3>Otherwise <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></h3>
      <ActionRows actions={r.otherwise ?? []} onChange={otherwise => p.onChange({ ...r, otherwise })} />
      {p.issues.length > 0 && <div className="issues" style={{ marginTop: 12 }}>{p.issues.map((x, i) => <div key={i} className={"issue " + x.level}>{x.message}</div>)}</div>}
    </div>
  );
}

export function RulesTab(p: { rules: Rule[]; onChange(r: Rule[]): void; issues: Issue[] }) {
  const [sel, setSel] = React.useState(0);
  const i = Math.min(sel, p.rules.length - 1);
  const add = () => { p.onChange([...p.rules, { id: uid(), name: "New rule", enabled: true, workItemTypes: [], when: { match: "all", conditions: [{ field: "System.State", op: "equals", value: "" }] }, then: [] }]); setSel(p.rules.length); };
  const forRule = (r: Rule, idx: number) => p.issues.filter(x => x.where === `Rule “${r.name || "#" + (idx + 1)}”`);
  return (
    <div className="split">
      <div>
        <div className="list">
          {p.rules.map((r, idx) => {
            const iss = forRule(r, idx), e = iss.filter(x => x.level === "error").length;
            return <div role="button" tabIndex={0} onKeyDown={activate} key={r.id} className={"item" + (idx === i ? " on" : "")} onClick={() => setSel(idx)}>
              <span className="name" style={{ opacity: r.enabled ? 1 : .5 }}>{r.name || "(unnamed)"}</span>
              {e > 0 ? <span className="badge err">{e}</span> : iss.length > 0 ? <span className="badge">⚠</span> : null}
            </div>;
          })}
          {!p.rules.length && <div className="item muted">No rules yet</div>}
        </div>
        <div className="toolbar"><button className="btn primary" onClick={add}>+ New rule</button>
          {i >= 0 && <button className="btn" onClick={() => { p.onChange([...p.rules, { ...JSON.parse(JSON.stringify(p.rules[i])), id: uid(), name: p.rules[i].name + " (copy)" }]); setSel(p.rules.length); }}>Duplicate</button>}
          {i >= 0 && <button className="btn danger" onClick={() => { p.onChange(delAt(p.rules, i)); setSel(0); }}>Delete</button>}</div>
      </div>
      <div className="card">
        {i >= 0 ? <RuleEditor rule={p.rules[i]} issues={forRule(p.rules[i], i)} onChange={r => p.onChange(setAt(p.rules, i, r))} />
          : <div className="muted">Create a rule such as “When State = Closed, require Resolution”.</div>}
      </div>
    </div>
  );
}
