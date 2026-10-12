import * as React from "react";
import { LookupTable } from "../core/types";
import { Fld } from "./validate";

export interface HubCtx {
  projectName: string;
  types: string[];
  fields: Fld[];
  /** set when loading the work item types / fields failed (shown instead of an endless "Loading…") */
  loadError?: string;
  lookups: Record<string, LookupTable>;
  setLookups(l: Record<string, LookupTable>): void;
}
export const Ctx = React.createContext<HubCtx>({ projectName: "", types: [], fields: [], lookups: {}, setLookups: () => undefined });

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
  const { types, loadError } = React.useContext(Ctx);
  const toggle = (t: string) => p.onChange(p.value.includes(t) ? p.value.filter(x => x !== t) : [...p.value, t]);
  return (
    <div>
      <div className="chips">
        {types.map(t => <span role="button" tabIndex={0} onKeyDown={activate} key={t} className={"chip" + (p.value.includes(t) ? " on" : "")} onClick={() => toggle(t)}>{t}</span>)}
        {!types.length && (loadError ? <span className="err">Could not load the work item types (see the red message at the top of the page).</span> : <span className="muted">Loading work item types…</span>)}
      </div>
      <div className="help">{p.value.length ? "Applies only to the selected types." : "Applies to all work item types."}</div>
    </div>
  );
}

export type SectionStatus = "ok" | "todo" | "off";
const STATUS_LABEL: Record<SectionStatus, string> = { ok: "Done", todo: "Needs attention", off: "Not used" };

/** Ask the section with this id (if shown) to open and scroll into view. */
export const jumpToSection = (id: string) => window.dispatchEvent(new CustomEvent("wig-section", { detail: id }));

/**
 * A numbered, collapsible part of an editor with a one-line purpose and a status ("Done", "Needs attention", "Not used").
 * Sections that need attention start open; the others start closed unless `open` says otherwise.
 */
export function Section(p: { id: string; no: number; title: string; help: string; status: SectionStatus; summary?: string; open?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(p.open ?? p.status === "todo");
  const ref = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    const h = (e: Event) => {
      if ((e as CustomEvent).detail !== p.id) return;
      setOpen(true);
      window.setTimeout(() => ref.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 30);
    };
    window.addEventListener("wig-section", h);
    return () => window.removeEventListener("wig-section", h);
  }, [p.id]);
  return (
    <section ref={ref} className={"sect s-" + p.status} id={"sect-" + p.id}>
      <button type="button" className="sect-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="sect-no" aria-hidden="true">{p.status === "ok" ? "✓" : p.no}</span>
        <span className="sect-title"><b>{p.no}. {p.title}</b><span className="muted">{p.help}</span></span>
        <span className={"badge sect-" + p.status}>{p.summary ?? STATUS_LABEL[p.status]}</span>
        <span className="sect-chev" aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="sect-body">{p.children}</div>}
    </section>
  );
}

/** Keyboard activation (Enter / Space) for clickable elements that are not buttons. */
export const activate = (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (e.currentTarget as HTMLElement).click(); } };
