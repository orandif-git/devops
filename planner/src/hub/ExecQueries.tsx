import * as React from "react";
import { catalog, FieldDef, OP_LABEL, OPS_BY_TYPE, SHOW_LABEL } from "../core/execQuery";
import { ExecQuery, PlannerSettings, QueryCondition, QueryShow } from "../core/types";

const id = () => "q" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const blankCond = (fields: FieldDef[], join: "and" | "or" = "and"): QueryCondition => ({ field: fields[0]?.key ?? "", op: OPS_BY_TYPE[fields[0]?.type ?? "text"][0], value: "", join });

/** Ready-made questions to start from. */
export const exampleQueries = (): ExecQuery[] => [
  { id: id(), name: "At risk", show: "epics", month: "current", conditions: [{ field: "status", op: "=", value: "At risk", join: "and" }] },
  { id: id(), name: "Late", show: "epics", month: "current", conditions: [{ field: "late", op: "=", value: "Yes", join: "and" }] },
  { id: id(), name: "Teams highly utilized", show: "teams", month: "current", conditions: [{ field: "utilization", op: ">=", value: "85", join: "and" }] },
  { id: id(), name: "People over capacity", show: "people", month: "current", conditions: [{ field: "utilization", op: ">", value: "100", join: "and" }] },
];

function ValueInput(p: { f?: FieldDef; c: QueryCondition; onChange(v: string): void }) {
  const { f, c } = p;
  if (c.op === "empty" || c.op === "notEmpty") return <span className="muted" style={{ width: 160 }}>–</span>;
  const listId = "dl-" + (f?.key ?? "x");
  if (f?.type === "choice" && f.choices && c.op !== "in") return <select aria-label="Value" value={c.value} onChange={e => p.onChange(e.target.value)} style={{ width: 200 }}><option value="">(choose)</option>{f.choices.map(v => <option key={v}>{v}</option>)}</select>;
  return <>
    <input aria-label="Value" list={f?.type === "date" ? listId : undefined} value={c.value} style={{ width: 200 }}
      placeholder={f?.type === "date" ? "YYYY-MM-DD, today, today-30" : f?.type === "number" ? "number" : c.op === "in" ? "a, b, c" : "value"} onChange={e => p.onChange(e.target.value)} />
    {f?.type === "date" && <datalist id={listId}>{["today", "today-30", "today+30", "today+90"].map(v => <option key={v} value={v} />)}</datalist>}
  </>;
}

function QueryCard(p: { q: ExecQuery; s: PlannerSettings; onChange(q: ExecQuery): void; onRemove(): void; onMove(d: number): void; first: boolean; last: boolean }) {
  const { q } = p;
  const fields = catalog(q.show, p.s);
  const set = (patch: Partial<ExecQuery>) => p.onChange({ ...q, ...patch });
  const setCond = (i: number, c: QueryCondition) => set({ conditions: q.conditions.map((x, j) => (j === i ? c : x)) });
  const groups = Array.from(new Set(fields.map(f => f.group)));
  const fixedMonth = /^\d{4}-\d{2}$/.test(q.month);
  return (
    <div className="card">
      <div className="row">
        <label className="field" style={{ width: 260 }}><span>Name (shown as a chip under Ask)</span><input value={q.name} placeholder="e.g. Software upgrades at risk" onChange={e => set({ name: e.target.value })} /></label>
        <label className="field" style={{ width: 130 }}><span>Show</span><select value={q.show} onChange={e => set({ show: e.target.value as QueryShow, conditions: [] })}>{(Object.keys(SHOW_LABEL) as QueryShow[]).map(k => <option key={k} value={k}>{SHOW_LABEL[k]}</option>)}</select></label>
        <label className="field" style={{ width: 150 }}><span>Month (grid and capacity)</span>
          <select value={fixedMonth ? "fixed" : q.month} onChange={e => set({ month: e.target.value === "fixed" ? new Date().toISOString().slice(0, 7) : e.target.value })}><option value="current">Current month</option><option value="next">Next month</option><option value="fixed">A fixed month…</option></select></label>
        {fixedMonth && <label className="field" style={{ width: 130 }}><span>Month</span><input type="month" value={q.month} onChange={e => /^\d{4}-\d{2}$/.test(e.target.value) && set({ month: e.target.value })} /></label>}
        <span style={{ flex: 1 }} />
        <button className="btn icon" aria-label="Move up" disabled={p.first} onClick={() => p.onMove(-1)}>↑</button><button className="btn icon" aria-label="Move down" disabled={p.last} onClick={() => p.onMove(1)}>↓</button>
        <button className="btn danger" onClick={p.onRemove}>Delete</button>
      </div>
      {q.conditions.map((c, i) => {
        const f = fields.find(x => x.key === c.field);
        return (
          <div className="row" key={i} style={{ alignItems: "center" }}>
            {i === 0 ? <span style={{ width: 70 }} className="muted">Where</span>
              : <select aria-label="And / Or" value={c.join} style={{ width: 70 }} onChange={e => setCond(i, { ...c, join: e.target.value as "and" | "or" })}><option value="and">And</option><option value="or">Or</option></select>}
            <select aria-label="Field" value={c.field} style={{ width: 240 }} onChange={e => { const nf = fields.find(x => x.key === e.target.value); const ok = nf && OPS_BY_TYPE[nf.type].includes(c.op); setCond(i, { ...c, field: e.target.value, op: ok ? c.op : OPS_BY_TYPE[nf?.type ?? "text"][0], value: nf?.type === f?.type ? c.value : "" }); }}>
              {!f && c.field && <option value={c.field}>{c.field} (not available)</option>}
              {groups.map(g => <optgroup key={g} label={g}>{fields.filter(x => x.group === g).map(x => <option key={x.key} value={x.key}>{x.label}</option>)}</optgroup>)}
            </select>
            <select aria-label="Operator" value={c.op} style={{ width: 120 }} onChange={e => setCond(i, { ...c, op: e.target.value as QueryCondition["op"] })}>{OPS_BY_TYPE[f?.type ?? "text"].map(o => <option key={o} value={o}>{OP_LABEL[o]}</option>)}</select>
            <ValueInput f={f} c={c} onChange={v => setCond(i, { ...c, value: v })} />
            <button className="btn icon" aria-label="Remove row" onClick={() => set({ conditions: q.conditions.filter((_, j) => j !== i) })}>×</button>
          </div>);
      })}
      {!q.conditions.length && <div className="help">No conditions: every {SHOW_LABEL[q.show].toLowerCase()} row is returned.</div>}
      <button className="btn" onClick={() => set({ conditions: [...q.conditions, blankCond(fields)] })}>+ Add a condition</button>
    </div>
  );
}

/** Named queries for the Executive Dashboard, built like Azure DevOps queries. Each name becomes a chip under the Ask box. */
export function ExecQueries(p: { s: PlannerSettings; onChange(s: PlannerSettings): void }) {
  const qs = p.s.executive.queries;
  const setQ = (queries: ExecQuery[]) => p.onChange({ ...p.s, executive: { ...p.s.executive, queries } });
  const move = (i: number, d: number) => { const a = [...qs]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setQ(a); };
  return (
    <div>
      <h3>Questions (queries)</h3>
      <div className="help">Build a query like in Azure DevOps: field, operator, value, joined with And / Or (And binds tighter than Or). Give it a name and it appears as a chip under the Ask box; clicking it, or typing its name, runs it. A query can return <b>Epics</b>, <b>people</b> or <b>teams</b>. People and teams are read for a month from the planner's grids and team capacity, for example <i>Utilization % &gt;= 85</i>. Dates accept YYYY-MM-DD, today, today-30, today+7.</div>
      {qs.map((q, i) => <QueryCard key={q.id} q={q} s={p.s} first={i === 0} last={i === qs.length - 1} onChange={n => setQ(qs.map((x, j) => (j === i ? n : x)))} onRemove={() => setQ(qs.filter((_, j) => j !== i))} onMove={d => move(i, d)} />)}
      <div className="row">
        <button className="btn" onClick={() => setQ([...qs, { id: id(), name: "", show: "epics", month: "current", conditions: [] }])}>+ Add a query</button>
        {!qs.length && <button className="btn" onClick={() => setQ(exampleQueries())}>Add example queries</button>}
      </div>
    </div>
  );
}
