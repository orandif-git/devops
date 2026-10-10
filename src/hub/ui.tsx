import * as React from "react";
import { Fld } from "./validate";

export interface HubCtx {
  projectName: string;
  types: string[];
  fields: Fld[];
}
export const Ctx = React.createContext<HubCtx>({ projectName: "", types: [], fields: [] });

/** Immutable array helpers */
export const setAt = <T,>(a: T[], i: number, v: T) => a.map((x, j) => (j === i ? v : x));
export const delAt = <T,>(a: T[], i: number) => a.filter((_, j) => j !== i);
export const uid = () => Math.random().toString(36).slice(2, 10);
export const csv = (s: string) => s.split(",").map(x => x.trim()).filter(Boolean);

let n = 0;
/** Field reference-name input with autocomplete from the real process fields. */
export function FieldInput(p: { value: string; onChange(v: string): void; placeholder?: string; className?: string }) {
  const { fields } = React.useContext(Ctx);
  const id = React.useMemo(() => `fl-${n++}`, []);
  const known = fields.find(f => f.referenceName === p.value);
  return (
    <>
      <input className={p.className} list={id} value={p.value} placeholder={p.placeholder ?? "Field…"} onChange={e => p.onChange(e.target.value.trim())}
        title={known ? `${known.name} (${known.type})` : p.value ? "Unknown field" : ""} style={p.value && fields.length && !known ? { borderColor: "var(--err)" } : undefined} />
      <datalist id={id}>{fields.map(f => <option key={f.referenceName} value={f.referenceName}>{f.name}</option>)}</datalist>
    </>
  );
}

/** Text input offering allowed values of a field, when known. */
export function ValueInput(p: { field: string; value: string; onChange(v: string): void; placeholder?: string }) {
  const { fields } = React.useContext(Ctx);
  const id = React.useMemo(() => `vl-${n++}`, []);
  const allowed = fields.find(f => f.referenceName === p.field)?.allowedValues ?? [];
  return (
    <>
      <input list={id} value={p.value} placeholder={p.placeholder ?? "Value"} onChange={e => p.onChange(e.target.value)} />
      {allowed.length > 0 && <datalist id={id}>{allowed.map(v => <option key={v} value={v} />)}</datalist>}
    </>
  );
}

export function TypeChips(p: { value: string[]; onChange(v: string[]): void }) {
  const { types } = React.useContext(Ctx);
  const toggle = (t: string) => p.onChange(p.value.includes(t) ? p.value.filter(x => x !== t) : [...p.value, t]);
  return (
    <div>
      <div className="chips">
        {types.map(t => <span key={t} className={"chip" + (p.value.includes(t) ? " on" : "")} onClick={() => toggle(t)}>{t}</span>)}
        {!types.length && <span className="muted">Loading work item types…</span>}
      </div>
      <div className="help">{p.value.length ? "Applies only to the selected types." : "Applies to all work item types."}</div>
    </div>
  );
}
