import * as React from "react";
import { Cascade } from "../core/types";
import { importLegacyCascades } from "../core/rules";
import { csv, Ctx, delAt, FieldInput, setAt, TypeChips, uid } from "./ui";
import { Issue } from "./validate";

function Editor(p: { c: Cascade; onChange(c: Cascade): void; issues: Issue[] }) {
  const { fields } = React.useContext(Ctx);
  const c = p.c;
  const parentF = fields.find(f => f.referenceName === c.parent), childF = fields.find(f => f.referenceName === c.child);
  const keys = Object.keys(c.map);
  const setMap = (map: Cascade["map"]) => p.onChange({ ...c, map });
  const rename = (k: string, nk: string) => { const m: Cascade["map"] = {}; for (const key of keys) m[key === k ? nk : key] = c.map[key]; setMap(m); };
  const toggle = (k: string, v: string) => setMap({ ...c.map, [k]: c.map[k].includes(v) ? c.map[k].filter(x => x !== v) : [...c.map[k], v] });
  const childVals = childF?.allowedValues ?? [];
  return (
    <div>
      <div className="row">
        <label className="field" style={{ flex: 1 }}><span>Parent field</span><FieldInput value={c.parent} onChange={parent => p.onChange({ ...c, parent })} /></label>
        <label className="field" style={{ flex: 1 }}><span>Dependent field</span><FieldInput value={c.child} onChange={child => p.onChange({ ...c, child })} /></label>
      </div>
      <h3>Work item types</h3>
      <TypeChips value={c.workItemTypes} onChange={workItemTypes => p.onChange({ ...c, workItemTypes })} />
      <h3>Mapping</h3>
      <div className="help">Pick which {childF?.name ?? "dependent"} values are valid for each {parentF?.name ?? "parent"} value. Invalid combinations block save; add the <b>Smart Dropdown</b> control to the dependent field to also hide invalid options.</div>
      {parentF?.allowedValues?.length ? (
        <button className="btn" onClick={() => { const m = { ...c.map }; for (const v of parentF.allowedValues!) m[v] ??= []; setMap(m); }}>Add all {parentF.name} values</button>
      ) : null}
      {keys.map(k => (
        <div className="card" key={k}>
          <div className="row">
            <input className="fixed" style={{ fontWeight: 600 }} value={k} onChange={e => rename(k, e.target.value)} list={parentF?.allowedValues ? `pv-${c.id}` : undefined} />
            <span className="muted">→</span>
            {childVals.length === 0 && <input defaultValue={c.map[k].join(", ")} placeholder="values, comma separated" onBlur={e => setMap({ ...c.map, [k]: csv(e.target.value) })} />}
            <button className="btn icon danger fixed" onClick={() => { const m = { ...c.map }; delete m[k]; setMap(m); }}>✕</button>
          </div>
          {childVals.length > 0 && <div className="chips">{childVals.map(v => <span key={v} className={"chip" + (c.map[k].some(x => x.toLowerCase() === v.toLowerCase()) ? " on" : "")} onClick={() => toggle(k, v)}>{v}</span>)}</div>}
        </div>
      ))}
      {parentF?.allowedValues && <datalist id={`pv-${c.id}`}>{parentF.allowedValues.map(v => <option key={v} value={v} />)}</datalist>}
      <button className="btn" onClick={() => { let n = 1; while (c.map["Value " + n]) n++; setMap({ ...c.map, ["Value " + n]: [] }); }}>+ Add parent value</button>
      <h3>Area Path hints <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></h3>
      <div className="help">When the parent is empty on a form, fill it from the Area Path (matches the path and everything below it).</div>
      {(c.hints ?? []).map((h, i) => (
        <div className="row" key={i}>
          <input placeholder="Area path, e.g. Proj\Cats" value={h.areaPathUnder} onChange={e => p.onChange({ ...c, hints: setAt(c.hints!, i, { ...h, areaPathUnder: e.target.value }) })} />
          <span className="muted fixed">→</span>
          <input placeholder="Parent value" value={h.parentValue} onChange={e => p.onChange({ ...c, hints: setAt(c.hints!, i, { ...h, parentValue: e.target.value }) })} />
          <button className="btn icon danger fixed" onClick={() => p.onChange({ ...c, hints: delAt(c.hints!, i) })}>✕</button>
        </div>
      ))}
      <button className="btn" onClick={() => p.onChange({ ...c, hints: [...(c.hints ?? []), { areaPathUnder: "", parentValue: "" }] })}>+ Add hint</button>
      {p.issues.length > 0 && <div className="issues" style={{ marginTop: 12 }}>{p.issues.map((x, i) => <div key={i} className={"issue " + x.level}>{x.message}</div>)}</div>}
    </div>
  );
}

export function CascadesTab(p: { cascades: Cascade[]; onChange(c: Cascade[]): void; issues: Issue[] }) {
  const [sel, setSel] = React.useState(0);
  const [legacy, setLegacy] = React.useState("");
  const [legacyMsg, setLegacyMsg] = React.useState("");
  const i = Math.min(sel, p.cascades.length - 1);
  const label = (c: Cascade, idx: number) => `Dependent “${c.child || "#" + (idx + 1)}”`;
  const doImport = () => {
    try {
      const list = importLegacyCascades(JSON.parse(legacy));
      if (!list.length) { setLegacyMsg("No cascades found in that JSON."); return; }
      p.onChange([...p.cascades, ...list.map(c => ({ ...c, id: uid() }))]); setLegacy(""); setLegacyMsg(`Imported ${list.length} dependent list(s).`);
    } catch (e) { setLegacyMsg("Invalid JSON: " + (e as Error).message); }
  };
  return (
    <div className="split">
      <div>
        <div className="list">
          {p.cascades.map((c, idx) => <div key={c.id} className={"item" + (idx === i ? " on" : "")} onClick={() => setSel(idx)}>
            <span className="name">{c.parent || "?"} → {c.child || "?"}</span>
            {p.issues.some(x => x.where === label(c, idx) && x.level === "error") && <span className="badge err">!</span>}
          </div>)}
          {!p.cascades.length && <div className="item muted">None yet</div>}
        </div>
        <div className="toolbar">
          <button className="btn primary" onClick={() => { p.onChange([...p.cascades, { id: uid(), parent: "", child: "", workItemTypes: [], map: {}, hints: [] }]); setSel(p.cascades.length); }}>+ New</button>
          {i >= 0 && <button className="btn danger" onClick={() => { p.onChange(delAt(p.cascades, i)); setSel(0); }}>Delete</button>}
        </div>
        <details><summary className="muted">Import from “Dependent Lists” JSON</summary>
          <textarea rows={6} style={{ width: "100%" }} value={legacy} onChange={e => setLegacy(e.target.value)} placeholder='{"version":"1","cascades":{…}}' />
          <button className="btn" onClick={doImport} disabled={!legacy.trim()}>Import</button> <span className="muted">{legacyMsg}</span>
        </details>
      </div>
      <div className="card">
        {i >= 0 ? <Editor c={p.cascades[i]} onChange={c => p.onChange(setAt(p.cascades, i, c))} issues={p.issues.filter(x => x.where === label(p.cascades[i], i))} />
          : <div className="muted">Create a dependent dropdown, e.g. Species → Breed.</div>}
      </div>
    </div>
  );
}
