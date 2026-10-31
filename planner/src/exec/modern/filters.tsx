import * as React from "react";
import { dimLabel, ExecStatus, STATUS_NAME } from "../../core/executive";
import { stageDatesOn, stagesOn } from "../../core/stages";
import { periodHidden, declOptions, movedOptions, optionsOf, sdateOptions } from "../layouts";
import type { LP } from "../layouts";
import { SHOWN, pass, sortQuarters } from "../model";
import { COLOR } from "../parts";

export interface FilterGroup { key: string; label: string; options: { value: string; count: number; color?: string }[]; selected: string[]; onChange(v: string[]): void; pinned: boolean }

/** Every filter of the dashboard as a list of groups: the first few are pinned in the filter bar, the rest sit in the “More filters” panel. They are the same filters the classic design has. */
export function filterGroups(lp: LP): FilterGroup[] {
  const { f, setF } = lp, x = lp.settings.executive, g: FilterGroup[] = [];
  g.push({ key: "status", label: "Status", pinned: true, selected: f.status.map(s => STATUS_NAME[s]), onChange: v => setF({ ...f, status: SHOWN.filter(s => v.includes(STATUS_NAME[s])) }),
    options: SHOWN.map(s => ({ value: STATUS_NAME[s], count: lp.all.filter(i => pass(i, f, "status") && i.status === s).length, color: COLOR[s] })) });
  if (stagesOn(x.stages)) g.push({ key: "stage", label: "Stage", pinned: true, selected: f.stage, onChange: v => setF({ ...f, stage: v }), options: optionsOf(lp, "stage", i => i.stage || i.stageGap, v => [...x.stages.stages.map(s => s.name), ...v.filter(y => y && !x.stages.stages.some(s => s.name === y))]).filter(o => o.value) });
  lp.fields.forEach((d, k) => g.push({ key: "dim:" + d, label: dimLabel(d), pinned: k === 0, selected: f.dims[d] ?? [], onChange: v => setF({ ...f, dims: { ...f.dims, [d]: v } }), options: optionsOf(lp, { dim: d }, i => i.r.dims[d]) }));
  if (stageDatesOn(x.stages)) g.push({ key: "sdate", label: "Stage dates", pinned: true, selected: f.sdate, onChange: v => setF({ ...f, sdate: v }), options: sdateOptions(lp) });
  g.push({ key: "state", label: "State", pinned: false, selected: f.state, onChange: v => setF({ ...f, state: v }), options: optionsOf(lp, "state", i => i.state) });
  if (x.resources) g.push({ key: "team", label: "Team", pinned: false, selected: f.team, onChange: v => setF({ ...f, team: v }), options: optionsOf(lp, "team", i => i.team) });
  g.push({ key: "quarter", label: "Go-live", pinned: false, selected: f.quarter, onChange: v => setF({ ...f, quarter: v }), options: optionsOf(lp, "quarter", i => i.quarter, sortQuarters) });
  if (lp.historyOn) g.push({ key: "moved", label: "Go-live changes", pinned: false, selected: f.moved, onChange: v => setF({ ...f, moved: v }), options: movedOptions(lp) });
  if (x.declaredField && x.statusSource !== "rag") g.push({ key: "decl", label: "RAG check", pinned: false, selected: f.decl, onChange: v => setF({ ...f, decl: v }), options: declOptions(lp) });
  return g;
}
export { periodHidden };
export type { ExecStatus };

/** The “More filters” panel: the filters that are not pinned, as chips with their counts, and anything else the toolbar has (saved filter, query). */
export function MorePanel(p: { groups: FilterGroup[]; extra?: React.ReactNode; onClose(): void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const down = (e: MouseEvent) => { const t = e.target as Node; if (ref.current && !ref.current.contains(t) && !(t as HTMLElement).closest?.("[data-more-btn]")) p.onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); p.onClose(); } };
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key, true); };
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (g: FilterGroup, v: string) => g.onChange(g.selected.includes(v) ? g.selected.filter(y => y !== v) : [...g.selected, v]);
  return (
    <div className="exm-more" ref={ref} role="dialog" aria-label="More filters">
      {p.groups.filter(g => g.options.length > 0 || g.selected.length > 0).map(g => (
        <div key={g.key}><h5>{g.label}</h5><div className="cs">{g.options.map(o => <button key={o.value} type="button" className={"c" + (g.selected.includes(o.value) ? " on" : "")} aria-pressed={g.selected.includes(o.value)} onClick={() => toggle(g, o.value)}>{o.value}<small>{o.count}</small></button>)}</div></div>))}
      {p.extra && <div className="ex">{p.extra}</div>}
      <div className="ft">These are the same filters as the classic design. They apply to every page.</div>
    </div>
  );
}
