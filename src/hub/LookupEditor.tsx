import * as React from "react";
import { groupsToMap, mapToGroups, unassigned } from "../core/lookupGroups";
import { csv, delAt, setAt } from "./ui";

export interface MappingValue { map: Record<string, string>; fallback?: string }

/** Edit a value→category mapping grouped by category, plus the "all other values" fallback. */
export function LookupEditor(p: { value: MappingValue; sourceName?: string; sourceOptions?: string[]; onChange(v: MappingValue): void }) {
  const l = p.value;
  // draft keeps empty categories alive while typing; the saved map only holds filled ones
  const [groups, setDraft] = React.useState(() => mapToGroups(l.map));
  const rest = unassigned(p.sourceOptions ?? [], l.map);
  const setGroups = (g: ReturnType<typeof mapToGroups>) => { setDraft(g); p.onChange({ ...l, map: groupsToMap(g) }); };
  return (
    <div className="card">
      <div className="help">Group the values{p.sourceName ? <> of “{p.sourceName}”</> : ""} by category. Anything not listed gets the “all other values” category, so a new value you add later needs no change unless it belongs to another category.</div>
      {groups.map((g, k) => (
        <div className="row" key={k}>
          <input className="fixed" style={{ width: 150, fontWeight: 600 }} defaultValue={g.category} key={"c" + k + g.category} placeholder="Category"
            onBlur={e => setGroups(setAt(groups, k, { ...g, category: e.target.value }))} />
          <span className="fixed">←</span>
          <input defaultValue={g.values.join(", ")} key={"v" + k + g.values.join()} placeholder="values in this category, comma separated"
            onBlur={e => setGroups(setAt(groups, k, { ...g, values: csv(e.target.value) }))} />
          <button className="btn icon danger fixed" onClick={() => setGroups(delAt(groups, k))}>✕</button>
        </div>
      ))}
      <button className="btn" onClick={() => setGroups([...groups, { category: "", values: [] }])}>+ Add category</button>
      <div className="row" style={{ marginTop: 8 }}>
        <span className="fixed">All other values →</span>
        <input style={{ maxWidth: 200 }} placeholder="e.g. Internal" value={l.fallback ?? ""} onChange={e => p.onChange({ ...l, fallback: e.target.value || undefined })} />
      </div>
      {(p.sourceOptions?.length ?? 0) > 0 && (
        <div className="help">{rest.length ? <>Currently receiving “{l.fallback || "(blank)"}”: {rest.join(", ")}</> : "Every value of the source column is listed in a category."}</div>
      )}
    </div>
  );
}
