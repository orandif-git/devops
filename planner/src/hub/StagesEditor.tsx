import React from "react";
import { PlannerSettings } from "../core/types";
import { evenStages, IGNORE, StageSettings, stagesOn } from "../core/stages";
import { isCategoryType } from "../core/fieldTypes";
import { FieldInfo, listFieldValues, listStates } from "../data/fields";
import { FieldPick } from "./SettingsTab";
import { IconPlus, IconTrash } from "./icons";

const SRC: [StageSettings["source"], string][] = [["both", "The field, and the state when the field is empty"], ["field", "A field"], ["state", "The state"]];

/** Settings for the delivery stages: where the stage is read from, the stages with their progress and planned window, the value-to-stage mapping and the rules. */
export function StagesEditor(p: { s: PlannerSettings; fields: FieldInfo[]; project: string; onChange(v: StageSettings): void }) {
  const st = p.s.executive.stages, set = (patch: Partial<StageSettings>) => p.onChange({ ...st, ...patch });
  const [found, setFound] = React.useState<string[]>([]);
  const usesField = st.source !== "state", usesState = st.source !== "field";
  React.useEffect(() => {
    let live = true;
    Promise.all([usesField && st.field ? listFieldValues(p.project, p.s.workItemType, st.field) : Promise.resolve([]), usesState ? listStates(p.project, p.s.workItemType) : Promise.resolve([])])
      .then(([a, b]) => { if (live) setFound([...a, ...b.filter(x => !a.includes(x))]); }).catch(() => { /* the mapping is still editable by hand */ });
    return () => { live = false; };
  }, [st.source, st.field, p.project, p.s.workItemType]);   // eslint-disable-line react-hooks/exhaustive-deps
  const values = Array.from(new Set([...found, ...Object.keys(st.map)]));
  const names = st.stages.map(x => x.name);
  const setStage = (i: number, patch: Partial<StageSettings["stages"][number]>) => {
    const old = st.stages[i].name, next = st.stages.map((x, j) => (j === i ? { ...x, ...patch } : x));
    const map = patch.name !== undefined && patch.name !== old ? Object.fromEntries(Object.entries(st.map).map(([k, v]) => [k, v === old ? patch.name! : v])) : st.map;
    set({ stages: next, map });
  };
  const num = (v: string) => Math.max(0, Math.min(100, Number(v) || 0));
  const quickStart = () => { const ns = values.filter(v => v), stages = evenStages(ns); set({ stages, map: Object.fromEntries(ns.map(v => [v, v])) }); };
  return (
    <div className="stages-ed">
      <div className="row">
        <label className="field" style={{ width: 300 }}><span>The stage is read from</span><select value={st.source} onChange={e => set({ source: e.target.value as StageSettings["source"] })}>{SRC.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        {usesField && <FieldPick label="Stage field (for example Delivery Status)" value={st.field} fields={p.fields} accept={f => isCategoryType(f.type)} placeholder="Custom.DeliveryStatus" onChange={v => set({ field: v })} />}
      </div>
      <div className="help" style={{ marginTop: 10 }}><b>Stages</b>, in order. “Counts as” is the progress of an Epic in that stage; “Planned window” is the share of the Epic’s time (start to go-live) in which it should be in that stage.</div>
      {st.stages.map((g, i) => (
        <div className="row" key={i}>
          <span className="badge">{i + 1}</span>
          <label className="field" style={{ width: 180 }}><span>Name</span><input value={g.name} onChange={e => setStage(i, { name: e.target.value })} /></label>
          <label className="field" style={{ width: 110 }}><span>Counts as (%)</span><input type="number" min={0} max={100} value={g.pct} onChange={e => setStage(i, { pct: num(e.target.value) })} /></label>
          <label className="field" style={{ width: 110 }}><span>Window from (%)</span><input type="number" min={0} max={100} value={g.from} onChange={e => setStage(i, { from: num(e.target.value) })} /></label>
          <label className="field" style={{ width: 110 }}><span>Window to (%)</span><input type="number" min={0} max={100} value={g.to} onChange={e => setStage(i, { to: num(e.target.value) })} /></label>
          <button className="btn danger" onClick={() => set({ stages: st.stages.filter((_, j) => j !== i), map: Object.fromEntries(Object.entries(st.map).filter(([, v]) => v !== g.name)) })}><IconTrash /> Remove</button>
        </div>))}
      <div className="row">
        <button className="btn" onClick={() => set({ stages: [...st.stages, ...evenStages([`Stage ${st.stages.length + 1}`]).map(x => ({ ...x, pct: Math.min(100, st.stages.length ? 90 : 50), from: 0, to: 100 }))] })}><IconPlus /> Add a stage</button>
        {!st.stages.length && values.length > 0 && <button className="btn" onClick={quickStart}>Use the {values.length} values found as stages</button>}
      </div>
      {st.stages.length > 0 && <>
        <div className="help" style={{ marginTop: 10 }}><b>Which value is which stage</b>. Values that are not mapped are listed on the dashboard as “not mapped”; choose “{IGNORE}” for values that should not count (for example Cancelled).</div>
        {values.length === 0 && <div className="muted">No values found yet. Pick the stage field (or the state) above.</div>}
        {values.map(v => (
          <div className="row" key={v}>
            <span style={{ width: 220 }}>{v}</span>
            <select aria-label={`Stage for ${v}`} value={st.map[v] ?? ""} onChange={e => { const map = { ...st.map }; if (e.target.value) map[v] = e.target.value; else delete map[v]; set({ map }); }}>
              <option value="">(not mapped)</option>{names.map(n => <option key={n} value={n}>{n}</option>)}<option value={IGNORE}>{IGNORE}</option>
            </select>
          </div>))}
      </>}
      {stagesOn(st) && <>
        <div className="help" style={{ marginTop: 10 }}><b>Rules</b></div>
        <label style={{ display: "block", margin: "4px 0" }}><input type="checkbox" checked={st.smooth} onChange={e => set({ smooth: e.target.checked })} /> Move progress smoothly inside a stage with the time of its planned window (otherwise progress jumps from stage to stage)</label>
        <label style={{ display: "block", margin: "4px 0" }}><input type="checkbox" checked={st.lagRule} onChange={e => set({ lagRule: e.target.checked })} /> Flag an Epic that is behind for its stage: Needs attention at <input type="number" min={1} max={10} style={{ width: 54 }} value={st.lagAmber} onChange={e => set({ lagAmber: Number(e.target.value) || 1 })} /> stages behind, At risk at <input type="number" min={1} max={10} style={{ width: 54 }} value={st.lagRed} onChange={e => set({ lagRed: Number(e.target.value) || 2 })} /></label>
        <label style={{ display: "block", margin: "4px 0" }}><input type="checkbox" checked={st.stuckRule} onChange={e => set({ stuckRule: e.target.checked })} /> Flag an Epic that has stayed in one stage for more than <input type="number" min={1} max={730} style={{ width: 64 }} value={st.stuckDays} onChange={e => set({ stuckDays: Number(e.target.value) || 45 })} /> days (read from the work item history)</label>
      </>}
    </div>
  );
}
