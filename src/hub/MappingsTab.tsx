import * as React from "react";
import { activate } from "./ui";
import { LookupTable, ProjectConfig } from "../core/types";
import { LookupEditor } from "./LookupEditor";
import { Issue } from "./validate";

/** Shared mappings (value → category) maintained once and used by any grid column. */
export function MappingsTab(p: { config: ProjectConfig; onChange(l: Record<string, LookupTable>, grids?: ProjectConfig["grids"]): void; issues: Issue[] }) {
  const lookups = p.config.lookups ?? {};
  const names = Object.keys(lookups);
  const [sel, setSel] = React.useState(names[0] ?? "");
  const cur = names.includes(sel) ? sel : names[0];
  const usedBy = (n: string) => Object.entries(p.config.grids).flatMap(([g, cfg]) => cfg.columns.filter(c => c.lookup?.table === n).map(c => `${g} › ${c.name}`));
  const add = () => { let n = 1; while (lookups["Mapping " + n]) n++; const name = "Mapping " + n; p.onChange({ ...lookups, [name]: { map: {}, fallback: "" } }); setSel(name); };
  const rename = (from: string, to: string) => {
    if (!to || to === from || lookups[to]) return;
    const out: Record<string, LookupTable> = {}; for (const k of names) out[k === from ? to : k] = lookups[k];
    // keep grid columns pointing at the renamed mapping
    const grids = Object.fromEntries(Object.entries(p.config.grids).map(([g, cfg]) => [g, { ...cfg, columns: cfg.columns.map(c => (c.lookup?.table === from ? { ...c, lookup: { ...c.lookup, table: to } } : c)) }]));
    p.onChange(out, grids as ProjectConfig["grids"]); setSel(to);
  };
  return (
    <div className="split">
      <div>
        <div className="list">
          {names.map(n => <div role="button" tabIndex={0} onKeyDown={activate} key={n} className={"item" + (n === cur ? " on" : "")} onClick={() => setSel(n)}>
            <span className="name">{n}</span>{p.issues.some(x => x.where === `Mapping “${n}”` && x.level === "error") && <span className="badge err">!</span>}</div>)}
          {!names.length && <div className="item muted">No mappings yet</div>}
        </div>
        <div className="toolbar">
          <button className="btn primary" onClick={add}>+ New mapping</button>
          {cur && <button className="btn danger" disabled={usedBy(cur).length > 0} title={usedBy(cur).length ? "Still used by a grid column" : ""}
            onClick={() => { const o = { ...lookups }; delete o[cur]; p.onChange(o); }}>Delete</button>}
        </div>
      </div>
      <div className="card">
        {cur ? (
          <>
            <label className="field"><span>Mapping name</span><input defaultValue={cur} key={cur} onBlur={e => rename(cur, e.target.value.trim())} /></label>
            <div className="help">Example: <b>Resource type</b> – External ← Vendor, IT Contract · Business ← Business · all other values → Internal. Use it on any grid column: <i>Auto-fill from another column → Mapping → Shared</i>.</div>
            <LookupEditor key={cur} value={lookups[cur]} onChange={v => p.onChange({ ...lookups, [cur]: { ...lookups[cur], map: v.map, fallback: v.fallback } })} />
            <div className="help">{usedBy(cur).length ? <>Used by: {usedBy(cur).join(", ")}</> : "Not used by any grid column yet."}</div>
            {p.issues.filter(x => x.where === `Mapping “${cur}”`).length > 0 && <div className="issues">{p.issues.filter(x => x.where === `Mapping “${cur}”`).map((x, i) => <div key={i} className={"issue " + x.level}>{x.message}</div>)}</div>}
          </>
        ) : <div className="muted">Create a mapping such as Team → Resource type once, then reuse it in every grid.</div>}
      </div>
    </div>
  );
}
