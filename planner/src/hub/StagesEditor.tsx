import React from "react";
import { PlannerSettings } from "../core/types";
import { IGNORE, looksLikeRag, parseStageNames, SDLC_STAGES, StageDateDef, StageDateSettings, StageSettings, stagesOn, suggestMap, withStageNames } from "../core/stages";
import { isCategoryType, isDateType } from "../core/fieldTypes";
import { FieldInfo, listFieldValues, listStates } from "../data/fields";
import { FieldPick } from "./FieldPick";

const SRC: [StageSettings["source"], string][] = [["field", "A field"], ["state", "The state"], ["both", "Field, then the state"]];
const pct = (v: string) => Math.max(0, Math.min(100, Number(v) || 0));

/**
 * Settings for the delivery stages, in three short steps: where the stage comes from, the stages (a comma list; the usual SDLC phases are one click away) with what each counts as, and which value of the field or state is which stage.
 * The values come from the field's pick-list, and "Suggest mapping" matches them to the stages by name (Doing → Development, Delivery Committed → UAT, Closed → ignore).
 */
export function StagesEditor(p: { s: PlannerSettings; fields: FieldInfo[]; project: string; onChange(v: StageSettings): void }) {
  const st = p.s.executive.stages, set = (patch: Partial<StageSettings>) => p.onChange({ ...st, ...patch });
  const [found, setFound] = React.useState<string[]>([]), [loaded, setLoaded] = React.useState(false);
  const usesField = st.source !== "state", usesState = st.source !== "field", names = st.stages.map(x => x.name);
  React.useEffect(() => {
    let live = true; setLoaded(false);
    Promise.all([usesField && st.field ? listFieldValues(p.project, p.s.workItemType, st.field) : Promise.resolve([]), usesState ? listStates(p.project, p.s.workItemType) : Promise.resolve([])])
      .then(([a, b]) => { if (live) { setFound([...a, ...b.filter(x => !a.includes(x))]); setLoaded(true); } }).catch(() => { if (live) setLoaded(true); });
    return () => { live = false; };
  }, [st.source, st.field, p.project, p.s.workItemType]);   // eslint-disable-line react-hooks/exhaustive-deps
  const values = Array.from(new Set([...found, ...Object.keys(st.map)]));
  const rag = usesField && !!st.field && looksLikeRag(found);
  const setNames = (list: string[], suggest = false) => { const n = withStageNames(st, list); p.onChange(suggest ? { ...n, map: suggestMap(values, list, n.map) } : n); };
  const setStage = (i: number, patch: Partial<StageSettings["stages"][number]>) => set({ stages: st.stages.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const unmapped = values.filter(v => !(v in st.map)).length;
  return (
    <div className="stages-ed">
      <div className="help"><b>1. Where the stage comes from</b></div>
      <div className="row" role="radiogroup" aria-label="The stage comes from">
        {SRC.map(([k, l]) => <label key={k} style={{ marginRight: 14 }}><input type="radio" name="stage-src" checked={st.source === k} onChange={() => set({ source: k })} /> {l}</label>)}
      </div>
      {usesField && <div className="row"><FieldPick label="Delivery phase field (for example Delivery Status or SDLC Phase)" value={st.field} fields={p.fields} accept={f => isCategoryType(f.type)} placeholder="Custom.DeliveryStatus" onChange={v => set({ field: v })} /></div>}
      {rag && <div className="err" role="alert" style={{ margin: "4px 0" }}>The values of this field (Red, Amber, Green…) look like a RAG status, not delivery phases. Pick the field that holds the phase (Design, Development, SIT, UAT…). The RAG field belongs in “Declared status” below.</div>}

      <div className="help" style={{ marginTop: 12 }}><b>2. Stages</b>, in order, comma separated.</div>
      <div className="row">
        <label className="field" style={{ flex: 1 }}><span>Stages (first to last)</span><input aria-label="Stages" key={names.join("|")} defaultValue={names.join(", ")} placeholder="Design, Development, SIT, UAT, Deployment" onBlur={e => setNames(parseStageNames(e.target.value))} /></label>
        <button className="btn" onClick={() => setNames(SDLC_STAGES, true)} title="Design, Development, SIT, UAT, Deployment">Use the SDLC stages</button>
      </div>
      {st.stages.length > 0 && <table className="stage-tbl"><thead><tr><th>Stage</th><th title="What an Epic in this stage counts as">Counts as %</th><th title="The share of the Epic's time (start to go-live) in which it should be in this stage">Planned window from %</th><th>to %</th></tr></thead>
        <tbody>{st.stages.map((g, i) => <tr key={g.name}><td>{g.name}</td>
          <td><input type="number" min={0} max={100} aria-label={`${g.name} counts as`} value={g.pct} onChange={e => setStage(i, { pct: pct(e.target.value) })} style={{ width: 70 }} /></td>
          <td><input type="number" min={0} max={100} aria-label={`${g.name} window from`} value={g.from} onChange={e => setStage(i, { from: pct(e.target.value) })} style={{ width: 70 }} /></td>
          <td><input type="number" min={0} max={100} aria-label={`${g.name} window to`} value={g.to} onChange={e => setStage(i, { to: pct(e.target.value) })} style={{ width: 70 }} /></td></tr>)}</tbody></table>}
      {st.stages.length > 0 && <div className="help">“Counts as” is the progress of an Epic in that stage. The planned window is when, as a share of the Epic’s time, it should be in the stage; it drives “behind for the stage”.</div>}

      {st.stages.length > 0 && <>
        <div className="help" style={{ marginTop: 12 }}><b>3. Which value is which stage</b>{usesField && !st.field ? ". Choose the field above first." : <>. {values.length ? `${values.length} values found${loaded ? "" : "…"}.` : loaded ? "No values found: the field has no pick-list, so type them by editing the mapping later or pick the state." : "Reading the values…"}</>}</div>
        {values.length > 0 && <>
          <table className="stage-tbl"><thead><tr><th>Value found</th><th>Stage</th></tr></thead>
            <tbody>{values.map(v => <tr key={v}><td>{v}</td><td><select aria-label={`Stage for ${v}`} value={st.map[v] ?? ""} onChange={e => { const map = { ...st.map }; if (e.target.value) map[v] = e.target.value; else delete map[v]; set({ map }); }}>
              <option value="">(not mapped)</option>{names.map(n => <option key={n} value={n}>{n}</option>)}<option value={IGNORE}>{IGNORE}</option></select></td></tr>)}</tbody></table>
          <div className="row"><button className="btn" onClick={() => set({ map: suggestMap(values, names, st.map) })} disabled={!unmapped}>Suggest mapping for the {unmapped} not mapped</button>
            <span className="muted">Matches by name and common words (Doing → Development, Delivery Committed → UAT, Closed or On Hold → ignore). Check it; you can change any line.</span></div>
          <div className="help">“{IGNORE}” is for values that should not count (Closed, On Hold, Cancelled). Done Epics always count as 100% by their state.</div></>}
      </>}

      {st.stages.length > 0 && <StageDatesEditor st={st} fields={p.fields} set={set} />}
      {stagesOn(st) && <>
        <div className="help" style={{ marginTop: 12 }}><b>Rules</b></div>
        <label style={{ display: "block", margin: "4px 0" }}><input type="checkbox" checked={st.smooth} onChange={e => set({ smooth: e.target.checked })} /> Move progress smoothly inside a stage with the time of its planned window (otherwise progress jumps from stage to stage)</label>
        <div className="help rule-eg">e.g. In Development an Epic counts as 33%: off, it stays 33% until it moves to SIT (50%); on, it creeps towards 50% over the stage’s window.</div>
        <label style={{ display: "block", margin: "4px 0" }}><input type="checkbox" checked={st.lagRule} onChange={e => set({ lagRule: e.target.checked })} /> Flag an Epic that is behind for its stage: Needs attention at <input type="number" min={1} max={10} style={{ width: 54 }} value={st.lagAmber} onChange={e => set({ lagAmber: Number(e.target.value) || 1 })} /> stages behind, At risk at <input type="number" min={1} max={10} style={{ width: 54 }} value={st.lagRed} onChange={e => set({ lagRed: Number(e.target.value) || 2 })} /></label>
        <div className="help rule-eg">e.g. With 63% of its time used an Epic should be in UAT: still in SIT = Needs attention, still in Development = At risk.</div>
        <label style={{ display: "block", margin: "4px 0" }}><input type="checkbox" checked={st.stuckRule} onChange={e => set({ stuckRule: e.target.checked })} /> Flag an Epic that has stayed in one stage for more than <input type="number" min={1} max={730} style={{ width: 64 }} value={st.stuckDays} onChange={e => set({ stuckDays: Number(e.target.value) || 45 })} /> days (read from the work item history)</label>
        <div className="help rule-eg">e.g. An Epic in UAT for 70 days becomes Needs attention even if its dates look fine (needs the work item history).</div>
      </>}
    </div>
  );
}

const defOf = (names: string[], i: number): StageDateDef => ({ start: "", startMode: "field", end: "", endMode: i < names.length - 1 ? "next" : "none" });

/** Optional: the date fields that say when each stage started and ended. A stage can end when the next one starts, so no “completed” field is needed. */
function StageDatesEditor(p: { st: StageSettings; fields: FieldInfo[]; set(patch: Partial<StageSettings>): void }) {
  const { st } = p, d = st.dates, names = st.stages.map(x => x.name), setD = (patch: Partial<StageDateSettings>) => p.set({ dates: { ...d, ...patch } });
  const def = (i: number): StageDateDef => d.stages[names[i]] ?? defOf(names, i);
  const setDef = (i: number, patch: Partial<StageDateDef>) => setD({ stages: { ...Object.fromEntries(names.map((n, k) => [n, def(k)])), [names[i]]: { ...def(i), ...patch } } });
  const dateField = (label: string, value: string, onChange: (v: string) => void) => <FieldPick bare label={label} value={value} fields={p.fields} accept={f => isDateType(f.type)} placeholder="Custom.StageStartDate" onChange={onChange} />;
  const link = (text: string, on: () => void) => <button type="button" className="lk" onClick={on}>{text}</button>;
  return (
    <div className="stage-dates">
      <div className="help" style={{ marginTop: 14 }}><b>Stage dates</b> (optional). If your Epics have date fields for when each stage started, the dashboard can show how long an Epic has been in its stage, how long each finished stage took, and where the dates do not fit.</div>
      <label style={{ display: "block", margin: "4px 0" }}><input type="checkbox" checked={d.enabled} onChange={e => setD({ enabled: e.target.checked, ...(e.target.checked && !Object.keys(d.stages).length ? { stages: Object.fromEntries(names.map((n, i) => [n, defOf(names, i)])) } : {}) })} /> Use the stage dates</label>
      {d.enabled && <>
        <table className="stage-tbl"><thead><tr><th>Stage</th><th>Starts when</th><th>Ends when</th></tr></thead>
          <tbody>{names.map((n, i) => { const f = def(i);
            return <tr key={n}><td><b>{n}</b></td>
              <td>{f.startMode === "prev" && i > 0 ? <>When {names[i - 1]} ends {link("use a date field", () => setDef(i, { startMode: "field" }))}</> : <>{dateField(`${n} starts`, f.start, v => setDef(i, { start: v, startMode: "field" }))}{i > 0 && <div>{link(`use “${names[i - 1]} ends” instead`, () => setDef(i, { startMode: "prev", start: "" }))}</div>}</>}</td>
              <td>{f.endMode === "next" && i < names.length - 1 ? <>When {names[i + 1]} starts <span className="muted">(calculated)</span> {link("use its own field", () => setDef(i, { endMode: "field" }))}</> : f.endMode === "field" ? <>{dateField(`${n} ends`, f.end, v => setDef(i, { end: v, endMode: "field" }))}{i < names.length - 1 && <div>{link(`use “${names[i + 1]} starts” instead`, () => setDef(i, { endMode: "next", end: "" }))}</div>}</> : <><span className="muted">Open (until delivered)</span> {link("choose a field", () => setDef(i, { endMode: "field" }))}</>}</td></tr>; })}</tbody></table>
        <div className="help">There is no field for “{names[1] ?? "Development"} completed”? Leave “Ends when” on “When the next stage starts”: the end of a stage is the start date of the next one. A stage can also start when the previous one ends.</div>
        <label style={{ display: "block", margin: "4px 0" }}><input type="checkbox" checked={d.fallback} onChange={e => setD({ fallback: e.target.checked })} /> When a date is missing, read it from the work item history</label>
        <div className="help rule-eg">Otherwise the stage shows “date missing” and is left out of the durations. Needs the work item history to be readable.</div>
        <label style={{ display: "block", margin: "4px 0" }}><input type="checkbox" checked={d.consistency} onChange={e => setD({ consistency: e.target.checked })} /> Flag Epics where the stage and the dates do not fit</label>
        <div className="help rule-eg">A start date is missing, dates are out of order, a stage looks skipped, or the Epic went back to an earlier stage (rework).</div>
        <div className="row" style={{ alignItems: "flex-end" }}><FieldPick label="Delivered date field (optional): used for on-time delivery and days late" value={d.delivered} fields={p.fields} accept={f => isDateType(f.type)} placeholder="Custom.UATCompletionDate" onChange={v => setD({ delivered: v })} /></div>
        <label style={{ display: "block", margin: "8px 0 4px" }}><input type="checkbox" checked={d.track} onChange={e => setD({ track: e.target.checked })} /> Track changes to the stage dates</label>
        <div className="help rule-eg">Like the go-live date changes: who changed a date, from what to what, and when. Shown in the Epic panel and as a filter. Needs the work item history.</div>
        <label style={{ display: "block", margin: "4px 0 4px 22px" }}><input type="checkbox" disabled={!d.track} checked={d.late} onChange={e => setD({ late: e.target.checked })} /> Show “recorded late” when a date was entered more than <input type="number" min={1} max={90} style={{ width: 56 }} disabled={!d.track || !d.late} value={d.lateDays} onChange={e => setD({ lateDays: Number(e.target.value) || 7 })} /> days after the date itself</label>
        <div className="help rule-eg" style={{ marginLeft: 22 }}>It helps you judge how much to trust a date. It says nothing about why.</div>
      </>}
    </div>
  );
}
