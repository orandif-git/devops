import * as React from "react";
import { compute, explainCalculation, findGridDataFields, toInputValue, undefinedVariables } from "../core/calc";
import { resolvedGrids } from "../core/sharedLookups";
import { listFields, witClient, withTimeout } from "../shared/ado";
import { Aggregate, CalcInput, Calculation, EmptyHandling, GridConfig, RowFilter } from "../core/types";
import { csv, Ctx, delAt, FieldInput, setAt, TypeChips, uid } from "./ui";
import { Issue } from "./validate";

const AGG: Aggregate[] = ["sum", "avg", "min", "max", "count"];
const FUNCS = "IF(cond, a, b) · ROUND(x, n) · MIN · MAX · SUM · ABS · FLOOR · CEIL · AND · OR · NOT · CONCAT";

const starter = (): Calculation => ({
  id: uid(), name: "Capitalization %", enabled: true, workItemTypes: [],
  inputs: [
    { name: "CapexHours", source: { kind: "field", field: "" } },
    { name: "TotalHours", source: { kind: "field", field: "" } },
  ],
  formula: "CapexHours / TotalHours * 100", resultField: "", decimals: 2, onEmpty: "blank", onDivZero: "blank", mode: "always",
});

function InputCard(p: { input: CalcInput; grids: Record<string, GridConfig>; onChange(i: CalcInput): void; onDelete(): void }) {
  const i = p.input, src = i.source;
  const grid = src.kind !== "field" ? p.grids[src.grid] : undefined;
  const setSrc = (s: CalcInput["source"]) => p.onChange({ ...i, source: s });
  const where = src.kind !== "field" ? src.where ?? [] : [];
  const setWhere = (w: RowFilter[]) => src.kind !== "field" && setSrc({ ...src, where: w });
  const firstGrid = Object.keys(p.grids)[0] ?? "";
  const groupCol = src.kind === "top" ? grid?.columns.find(c => c.id === src.groupBy) : undefined;
  const cols = (value: string, onChange: (v: string) => void) => (
    <select value={value} onChange={e => onChange(e.target.value)}><option value="" />{grid?.columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
  );
  return (
    <div className="card">
      <div className="row">
        <input className="fixed" style={{ width: 150, fontWeight: 600 }} value={i.name} placeholder="VariableName" onChange={e => p.onChange({ ...i, name: e.target.value.replace(/[^A-Za-z0-9_]/g, "") })} />
        <span className="fixed">=</span>
        <select className="fixed" value={src.kind} onChange={e => {
          const k = e.target.value;
          setSrc(k === "field" ? { kind: "field", field: "" } : k === "grid" ? { kind: "grid", grid: firstGrid, column: "", aggregate: "sum", where: [] }
            : { kind: "top", grid: firstGrid, groupBy: "", column: "", aggregate: "sum", pick: "max", return: "group", where: [] });
        }}>
          <option value="field">Work item field</option><option value="grid">Grid figure</option><option value="top">Top group (highest / lowest)</option>
        </select>
        {src.kind === "field" && <FieldInput value={src.field} onChange={field => setSrc({ kind: "field", field })} placeholder="Pick any field of the work item…" />}
        <select className="fixed" title="When this input has no value" value={i.onEmpty ?? "inherit"} onChange={e => p.onChange({ ...i, onEmpty: e.target.value as EmptyHandling })}>
          <option value="inherit">if empty: use default</option><option value="blank">if empty: blank result</option><option value="zero">if empty: count as 0</option>
        </select>
        <button className="btn icon danger fixed" onClick={p.onDelete}>✕</button>
      </div>
      {src.kind === "grid" && (
        <div className="row">
          <select className="fixed" value={src.aggregate} onChange={e => setSrc({ ...src, aggregate: e.target.value as Aggregate })}>{AGG.map(a => <option key={a}>{a}</option>)}</select>
          <span className="fixed">of</span>{cols(src.column, column => setSrc({ ...src, column }))}
          <span className="fixed">in grid</span>
          <select value={src.grid} onChange={e => setSrc({ ...src, grid: e.target.value, column: "", where: [] })}><option value="" />{Object.keys(p.grids).map(g => <option key={g}>{g}</option>)}</select>
        </div>
      )}
      {src.kind === "top" && (
        <>
          <div className="row">
            <span className="fixed">the</span>{cols(src.groupBy, groupBy => setSrc({ ...src, groupBy }))}
            <span className="fixed">with the</span>
            <select className="fixed" value={src.pick ?? "max"} onChange={e => setSrc({ ...src, pick: e.target.value as "max" | "min" })}><option value="max">highest</option><option value="min">lowest</option></select>
            <select className="fixed" value={src.aggregate} onChange={e => setSrc({ ...src, aggregate: e.target.value as Aggregate })}>{AGG.map(a => <option key={a}>{a}</option>)}</select>
            <span className="fixed">of</span>{cols(src.column, column => setSrc({ ...src, column }))}
          </div>
          <div className="row">
            <span className="fixed">in grid</span>
            <select value={src.grid} onChange={e => setSrc({ ...src, grid: e.target.value, groupBy: "", column: "", where: [] })}><option value="" />{Object.keys(p.grids).map(g => <option key={g}>{g}</option>)}</select>
            <span className="fixed">give me</span>
            <select className="fixed" value={src.return ?? "group"} onChange={e => setSrc({ ...src, return: e.target.value as "group" | "value" })}><option value="group">the group name (text)</option><option value="value">the figure (number)</option></select>
            {groupCol?.type === "date" && <>
              <span className="fixed">group dates by</span>
              <select className="fixed" value={src.bucket ?? "day"} onChange={e => setSrc({ ...src, bucket: e.target.value as "day" | "month" | "quarter" | "year" })}>
                <option value="day">day</option><option value="month">month (2026-03)</option><option value="quarter">quarter (2026-Q1)</option><option value="year">year</option></select>
            </>}
          </div>
          <div className="help">If two groups tie, the alphabetically first one wins. With no rows (or a highest of 0) the result is blank.</div>
        </>
      )}
      {src.kind !== "field" && (
        <>
          {where.map((w, k) => (
            <div className="row" key={k}>
              <span className="fixed">{k === 0 ? "only rows where" : "and where"}</span>
              {cols(w.column, column => setWhere(setAt(where, k, { ...w, column })))}
              <span className="fixed">is</span>
              <input defaultValue={w.values.join(", ")} placeholder="value, or several separated by commas (any of)" onBlur={e => setWhere(setAt(where, k, { ...w, values: csv(e.target.value) }))} />
              <button className="btn icon danger fixed" onClick={() => setWhere(delAt(where, k))}>✕</button>
            </div>
          ))}
          <button className="btn" onClick={() => setWhere([...where, { column: "", values: [] }])}>+ Add condition</button>
        </>
      )}
    </div>
  );
}

/** Run the calculation against a real work item and show every step – the quickest way to see why a result is blank. */
function LiveCheck(p: { calc: Calculation; grids: Record<string, GridConfig>; onUseDataField(grid: string, field: string): void }) {
  const { projectName, lookups } = React.useContext(Ctx);
  const [id, setId] = React.useState("");
  const [out, setOut] = React.useState<{ type: string; resultOnType: boolean; dataFieldsOnType: Record<string, boolean>; ex: ReturnType<typeof explainCalculation>; found: Record<string, string[]> } | string>();
  const run = async () => {
    const n = parseInt(id, 10);
    if (!n) { setOut("Enter a work item id."); return; }
    setOut("Loading…");
    try {
      const wi = await withTimeout((await witClient()).getWorkItem(n), `Reading work item ${n}`);
      const fields = (wi.fields ?? {}) as Record<string, unknown>;
      const type = String(fields["System.WorkItemType"] ?? "");
      const onType = new Set((await listFields(projectName, type)).map(f => f.referenceName));
      const grids = resolvedGrids({ grids: p.grids, lookups });
      const ex = explainCalculation(p.calc, f => fields[f], grids);
      const found = Object.fromEntries(ex.grids.filter(g => g.raw !== "ok").map(g => [g.name, findGridDataFields(fields, grids[g.name] ?? { columns: [] }).filter(f => f !== g.dataField)]));
      setOut({ type, resultOnType: onType.has(p.calc.resultField), dataFieldsOnType: Object.fromEntries(ex.grids.filter(g => g.dataField).map(g => [g.dataField!, onType.has(g.dataField!)])), ex, found });
    } catch (e) { setOut("Could not read the work item: " + (e as Error).message); }
  };
  return (
    <div className="card">
      <div className="help">Try it on a real work item: shows what each input reads and why the result is what it is. Reads saved values only – save the work item first.</div>
      <div className="row"><input style={{ maxWidth: 160 }} placeholder="Work item id" value={id} onChange={e => setId(e.target.value)} onKeyDown={e => { if (e.key === "Enter") run(); }} />
        <button className="btn" onClick={run}>Check</button></div>
      {typeof out === "string" && <div className="muted">{out}</div>}
      {out && typeof out !== "string" && (
        <div style={{ marginTop: 6 }}>
          <div>Work item type: <strong>{out.type}</strong>{p.calc.workItemTypes.length > 0 && !p.calc.workItemTypes.includes(out.type) && <span className="err"> – this calculation is limited to {p.calc.workItemTypes.join(", ")}, so it does not run here</span>}</div>
          <div>Result field <code>{p.calc.resultField}</code> on this type: {out.resultOnType ? <span className="ok">yes</span> : <span className="err">NO – add the field to this work item type</span>} · current value: <strong>{out.ex.current === null || out.ex.current === undefined || out.ex.current === "" ? "(empty)" : String(out.ex.current)}</strong></div>
          {out.ex.grids.map(g => (
            <div key={g.name}>Grid “{g.name}” → data field <code>{g.dataField ?? "(none saved)"}</code>              {g.dataField && !out.dataFieldsOnType[g.dataField] && <span className="err"> – not on this work item type</span>}: {g.raw === "ok" ? <span className="ok">{g.rows} row(s) read</span> : g.raw === "empty" ? <span className="err">EMPTY on this work item (rows not saved yet, or a different field)</span> : <span className="err">has text, but it is not readable grid data</span>}</div>
          ))}
          {out.ex.grids.filter(g => (out.found[g.name] ?? []).length > 0).map(g => (
            <div key={"fix" + g.name} className="card" style={{ borderColor: "var(--accent)" }}>
              <strong>Found the rows.</strong> The timesheet rows of “{g.name}” are stored in <code>{out.found[g.name][0]}</code>, not in <code>{g.dataField ?? "(none)"}</code>. The form control on the layout uses that field, so the calculation looked in the wrong place.
              <div className="row" style={{ marginTop: 6 }}><button className="btn primary" onClick={() => p.onUseDataField(g.name, out.found[g.name][0])}>Use {out.found[g.name][0]} as the data field of “{g.name}”</button>
                <span className="muted">Then press Save at the top and check again.</span></div>
            </div>
          ))}
          <table style={{ marginTop: 6 }}><tbody>
            {out.ex.inputs.map(i => <tr key={i.name}><td><strong>{i.name}</strong></td><td>=&nbsp;</td><td>{i.value === null ? <span className="muted">(empty)</span> : String(i.value)}</td><td className="muted">&nbsp;{i.source}</td></tr>)}
          </tbody></table>
          <div>Formula result: <strong>{out.ex.result.value === null ? "(blank)" : String(out.ex.result.value)}</strong>{out.ex.result.reason && <span className="muted"> – {out.ex.result.reason}</span>}</div>
        </div>
      )}
    </div>
  );
}

function TestPanel({ calc }: { calc: Calculation }) {
  const [vals, setVals] = React.useState<Record<string, string>>({});
  const parsed = Object.fromEntries(calc.inputs.map(i => [i.name, toInputValue(vals[i.name])]));
  const res = calc.formula.trim() ? compute(calc, parsed) : { value: null, reason: "no formula" };
  return (
    <div className="card">
      <div className="help">Type sample values (leave a box empty to test the “no value” behaviour). Nothing is saved.</div>
      <div className="row">
        {calc.inputs.map(i => (
          <label key={i.name} className="field" style={{ minWidth: 120 }}><span>{i.name || "(unnamed)"}</span>
            <input value={vals[i.name] ?? ""} onChange={e => setVals({ ...vals, [i.name]: e.target.value })} /></label>
        ))}
      </div>
      <div>Result: <strong className={res.value === null ? "muted" : ""}>{res.value === null ? "(blank)" : String(res.value)}</strong>
        {res.reason && <span className="muted"> – {res.reason}</span>}</div>
    </div>
  );
}

function Editor(p: { c: Calculation; grids: Record<string, GridConfig>; onChange(c: Calculation): void; onUseDataField(grid: string, field: string): void; issues: Issue[] }) {
  const c = p.c;
  const set = (patch: Partial<Calculation>) => p.onChange({ ...c, ...patch });
  const formulaRef = React.useRef<HTMLTextAreaElement>(null);
  const insert = (text: string) => {
    const el = formulaRef.current;
    if (!el) return set({ formula: c.formula + text });
    const a = el.selectionStart ?? c.formula.length, b = el.selectionEnd ?? a;
    set({ formula: c.formula.slice(0, a) + text + c.formula.slice(b) });
    window.setTimeout(() => { el.focus(); el.setSelectionRange(a + text.length, a + text.length); }, 0);
  };
  const missing = undefinedVariables(c);
  return (
    <div>
      <div className="row">
        <input value={c.name} placeholder="Calculation name" style={{ fontWeight: 600 }} onChange={e => set({ name: e.target.value })} />
        <label className="fixed"><input type="checkbox" checked={c.enabled} onChange={e => set({ enabled: e.target.checked })} /> Enabled</label>
      </div>
      <h3>Work item types</h3>
      <TypeChips value={c.workItemTypes} onChange={workItemTypes => set({ workItemTypes })} />

      <h3>1. Inputs</h3>
      <div className="help">Give each value a short name, then use the name in the formula. An input is either any field of the work item or a figure from a Smart Grid on it.</div>
      {c.inputs.map((i, k) => <InputCard key={k} input={i} grids={p.grids} onChange={ni => set({ inputs: setAt(c.inputs, k, ni) })} onDelete={() => set({ inputs: delAt(c.inputs, k) })} />)}
      <button className="btn" onClick={() => set({ inputs: [...c.inputs, { name: `Input${c.inputs.length + 1}`, source: { kind: "field", field: "" } }] })}>+ Add input</button>

      <h3>2. Formula</h3>
      <textarea ref={formulaRef} rows={2} style={{ width: "100%" }} spellCheck={false} value={c.formula} placeholder="CapexHours / TotalHours * 100" onChange={e => set({ formula: e.target.value })} />
      <div className="chips" style={{ margin: "4px 0" }}>
        {c.inputs.filter(i => i.name).map(i => <span key={i.name} className="chip" title="Insert into formula" onClick={() => insert(i.name)}>{i.name}</span>)}
        {["+", "-", "*", "/", "(", ")"].map(o => <span key={o} className="chip" onClick={() => insert(` ${o} `)}>{o}</span>)}
      </div>
      <div className="help">Functions: {FUNCS}. Comparisons: &lt; &gt; &lt;= &gt;= = &lt;&gt;. Example: <code>IF(TotalHours &gt; 0, CapexHours / TotalHours * 100, 0)</code></div>
      {missing.length > 0 && <div className="err">Unknown variable(s) in the formula: {missing.join(", ")} – add them as inputs.</div>}

      <h3>3. Result</h3>
      <div className="row">
        <label className="field" style={{ flex: 2 }}><span>Write the result to this work item field</span><FieldInput value={c.resultField} onChange={resultField => set({ resultField })} placeholder="Custom.CapitalizationPercent" /></label>
        <label className="field" style={{ width: 110 }}><span>Decimal places</span><input type="number" min={0} max={8} value={c.decimals ?? 2} onChange={e => set({ decimals: Math.max(0, Math.min(8, +e.target.value || 0)) })} /></label>
      </div>
      <div className="row">
        <label className="field" style={{ flex: 1 }}><span>When an input has no value</span>
          <select value={c.onEmpty} onChange={e => set({ onEmpty: e.target.value as Calculation["onEmpty"] })}>
            <option value="blank">Leave the result blank (recommended)</option><option value="zero">Count the input as 0</option></select></label>
        <label className="field" style={{ flex: 1 }}><span>Division by zero</span>
          <select value={c.onDivZero} onChange={e => set({ onDivZero: e.target.value as Calculation["onDivZero"] })}>
            <option value="blank">Leave the result blank (recommended)</option><option value="zero">Result is 0</option></select></label>
        <label className="field" style={{ flex: 1 }}><span>Recalculation</span>
          <select value={c.mode} onChange={e => set({ mode: e.target.value as Calculation["mode"] })}>
            <option value="always">Always recalculate (overwrites edits)</option><option value="whenEmpty">Only fill while the field is empty</option></select></label>
      </div>
      <div className="help">Results update when the work item opens and whenever an input changes. To make the field truly read-only for users, add a “read-only” rule to it in Organization settings → Process → your work item type → Rules.</div>

      <h3>Test</h3>
      <TestPanel calc={c} />
      <h3>Try on a real work item</h3>
      <LiveCheck calc={c} grids={p.grids} onUseDataField={p.onUseDataField} />
      {p.issues.length > 0 && <div className="issues" style={{ marginTop: 12 }}>{p.issues.map((x, i) => <div key={i} className={"issue " + x.level}>{x.message}</div>)}</div>}
    </div>
  );
}

export function CalculationsTab(p: { calcs: Calculation[]; grids: Record<string, GridConfig>; onChange(c: Calculation[]): void; onUseDataField(grid: string, field: string): void; issues: Issue[] }) {
  const [sel, setSel] = React.useState(0);
  const i = Math.min(sel, p.calcs.length - 1);
  const label = (c: Calculation, idx: number) => `Calculation “${c.name || "#" + (idx + 1)}”`;
  return (
    <div className="split">
      <div>
        <div className="list">
          {p.calcs.map((c, idx) => {
            const iss = p.issues.filter(x => x.where === label(c, idx)), e = iss.filter(x => x.level === "error").length;
            return <div key={c.id} className={"item" + (idx === i ? " on" : "")} onClick={() => setSel(idx)}>
              <span className="name" style={{ opacity: c.enabled ? 1 : .5 }}>{c.name || "(unnamed)"}</span>
              {e > 0 ? <span className="badge err">{e}</span> : iss.length ? <span className="badge">⚠</span> : null}
            </div>;
          })}
          {!p.calcs.length && <div className="item muted">No calculations yet</div>}
        </div>
        <div className="toolbar">
          <button className="btn primary" onClick={() => { p.onChange([...p.calcs, starter()]); setSel(p.calcs.length); }}>+ New calculation</button>
          {i >= 0 && <button className="btn" onClick={() => { p.onChange([...p.calcs, { ...JSON.parse(JSON.stringify(p.calcs[i])), id: uid(), name: p.calcs[i].name + " (copy)", resultField: "" }]); setSel(p.calcs.length); }}>Duplicate</button>}
          {i >= 0 && <button className="btn danger" onClick={() => { p.onChange(delAt(p.calcs, i)); setSel(0); }}>Delete</button>}
        </div>
      </div>
      <div className="card">
        {i >= 0 ? <Editor c={p.calcs[i]} grids={p.grids} onUseDataField={p.onUseDataField} onChange={c => p.onChange(setAt(p.calcs, i, c))} issues={p.issues.filter(x => x.where === label(p.calcs[i], i))} />
          : <div className="muted">Create a calculation such as “Capex hours ÷ Total hours × 100”, then pick the field that receives the result.</div>}
      </div>
    </div>
  );
}
