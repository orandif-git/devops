import * as React from "react";
import { isDateType } from "../core/fieldTypes";
import { FieldInfo, hasField } from "../data/fields";

/** A field chooser: the fields of the work item type as a list, plus a box to type a reference name. */
export function FieldPick(p: { label: string; value: string; fields: FieldInfo[]; accept(f: FieldInfo): boolean; placeholder?: string; onChange(v: string): void; flex?: number; /** no visible label (it still names the control for screen readers): for a table cell */ bare?: boolean }) {
  const known = p.fields.length > 0;
  const options = p.fields.filter(f => p.accept(f) || (f.type === "" && !isDateType(f.type)));
  const missing = p.value && !hasField(p.fields, p.value);
  return (
    <label className="field" style={{ flex: p.flex ?? 1 }}>{p.bare ? null : <span>{p.label}</span>}
      {known ? (
        <select aria-label={p.label} value={p.value} onChange={e => p.onChange(e.target.value)}>
          <option value="">(none)</option>
          {p.value && !options.some(f => f.referenceName.toLowerCase() === p.value.toLowerCase()) && <option value={p.value}>{p.value} (not in the list)</option>}
          {options.map(f => <option key={f.referenceName} value={f.referenceName}>{f.name} · {f.referenceName}</option>)}
        </select>
      ) : <input aria-label={p.label} value={p.value} placeholder={p.placeholder} onChange={e => p.onChange(e.target.value.trim())} />}
      {known && <input className="refname" aria-label={p.label + " (type the reference name)"} defaultValue="" key={p.value} placeholder={"or type the reference name, e.g. " + (p.placeholder ?? "Custom.Field")} onBlur={e => { const v = e.target.value.trim(); if (v && v.toLowerCase() !== p.value.toLowerCase()) p.onChange(v); e.target.value = ""; }} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />}
      {missing && <span className="err">Not a field of this work item type.</span>}
    </label>
  );
}
