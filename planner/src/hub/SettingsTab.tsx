import * as React from "react";
import { listTeams, TeamRef } from "../../../src/shared/capacityStore";
import { ColumnGuess, detectColumns } from "../core/detect";
import { validateSettings } from "../core/settings";
import { GridSource, PlannerSettings } from "../core/types";
import { readField } from "../data/epics";
import { FieldInfo, hasField, listTypeFields } from "../data/fields";

const COLS: [keyof GridSource["columns"], string, boolean][] = [["resource", "Resource (person)", true], ["start", "Start date", false], ["end", "End date", false], ["effort", "Effort (hours)", false], ["allocation", "Allocation %", false], ["status", "Review status", false], ["task", "Task / activity", false]];

function Chips(p: { all: TeamRef[]; value: TeamRef[]; onChange(v: TeamRef[]): void }) {
  const on = (t: TeamRef) => p.value.some(x => x.id === t.id);
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "4px 0" }}>
      {p.all.map(t => <button key={t.id} className={"chip" + (on(t) ? " on" : "")} onClick={() => p.onChange(on(t) ? p.value.filter(x => x.id !== t.id) : [...p.value, t])}>{t.name}</button>)}
      {!p.all.length && <span className="muted">Loading teams…</span>}
    </div>
  );
}

function SourceEditor(p: { s: GridSource; fields: FieldInfo[]; onChange(s: GridSource): void; onRemove(): void }) {
  const { s } = p;
  const [epic, setEpic] = React.useState("");
  const [found, setFound] = React.useState<{ columns: ColumnGuess[]; rows: number; scheduled: number } | string>();
  const set = (patch: Partial<GridSource>) => p.onChange({ ...s, ...patch });
  const detect = async () => {
    setFound("Reading…");
    try {
      const r = await readField(Number(epic), s.dataField);
      if (!r) return setFound("No such work item.");
      if (!r.text) return setFound(`Epic ${epic} (“${r.title}”) has nothing in ${s.dataField}.`);
      const d = detectColumns(r.text);
      setFound("error" in d ? d.error : d);
    } catch (e) { setFound("Failed: " + (e as Error).message); }
  };
  const keys = typeof found === "object" ? found.columns.map(c => c.key) : [];
  return (
    <div className="card">
      <div className="row">
        <label className="field" style={{ flex: 1 }}><span>Name</span><input value={s.name} placeholder="SDLC Timesheet" onChange={e => set({ name: e.target.value })} /></label>
        <label className="field" style={{ flex: 1 }}><span>Data field of the grid (the long-text field that holds its rows)</span><input list="epic-fields" value={s.dataField} placeholder="Custom.ResourceGrid" onChange={e => set({ dataField: e.target.value.trim() })} />{!hasField(p.fields, s.dataField) && <span className="err">Not a field of this work item type: pick one from the list.</span>}</label>
        <button className="btn danger" onClick={p.onRemove}>Remove</button>
      </div>
      <datalist id={"cols-" + s.id}>{keys.map(k => <option key={k} value={k} />)}</datalist>
      <div className="row" style={{ flexWrap: "wrap" }}>
        {COLS.map(([k, label, req]) => (
          <label className="field" key={k} style={{ width: 150 }}><span>{label}{req ? " *" : ""}</span>
            <input list={"cols-" + s.id} value={s.columns[k] ?? ""} placeholder="column id" onChange={e => set({ columns: { ...s.columns, [k]: e.target.value.trim() || (k === "resource" ? "" : undefined) } })} /></label>
        ))}
      </div>
      <label className="field"><span>Leave out rows whose review status is (optional, comma separated, e.g. Rejected)</span>
        <input defaultValue={s.excludedStatuses.join(", ")} onBlur={e => set({ excludedStatuses: e.target.value.split(",").map(x => x.trim()).filter(Boolean) })} /></label>
      <div className="help">Not sure about the column ids? Enter an Epic that has rows in this grid and press <b>Detect</b>: the columns found are offered in the boxes above.</div>
      <div className="row">
        <input placeholder="Epic id" value={epic} style={{ width: 100 }} onChange={e => setEpic(e.target.value)} />
        <button className="btn" disabled={!/^\d+$/.test(epic) || !s.dataField} onClick={detect}>Detect</button>
      </div>
      {typeof found === "string" && <div className="muted" role="status">{found}</div>}
      {typeof found === "object" && (
        <table style={{ borderCollapse: "collapse", marginTop: 6, fontSize: 12 }}>
          <thead><tr><th style={{ textAlign: "left", padding: "2px 10px 2px 0" }}>Column id</th><th style={{ textAlign: "left", padding: "2px 10px" }}>Looks like</th><th style={{ textAlign: "left", padding: "2px 10px" }}>Example</th></tr></thead>
          <tbody>{found.columns.map(c => <tr key={c.key}><td style={{ padding: "2px 10px 2px 0" }}><code>{c.key}</code></td><td style={{ padding: "2px 10px" }}>{c.kind}</td><td style={{ padding: "2px 10px" }} className="muted">{c.sample}</td></tr>)}
            <tr><td colSpan={3} className="muted" style={{ paddingTop: 4 }}>{found.rows} row(s), {found.scheduled} with monthly hours stored by the grid.</td></tr></tbody>
        </table>
      )}
    </div>
  );
}

/** Everything the planner needs to know about your process, in one place. */
export function SettingsTab(p: { projectId: string; projectName: string; value: PlannerSettings; saved: PlannerSettings; busy: boolean; msg: string; onChange(s: PlannerSettings): void; onSave(): void; onDiscard(): void }) {
  const s = p.value;
  const [teams, setTeams] = React.useState<TeamRef[]>([]);
  const [fields, setFields] = React.useState<FieldInfo[]>([]);
  const [fieldsMsg, setFieldsMsg] = React.useState("");
  React.useEffect(() => { listTeams(p.projectId).then(setTeams).catch(() => undefined); }, [p.projectId]);
  React.useEffect(() => { setFieldsMsg(""); listTypeFields(p.projectName, p.value.workItemType).then(setFields).catch(e => { setFields([]); setFieldsMsg("The fields of this work item type could not be listed (" + (e as Error).message + "). You can still type reference names."); }); }, [p.projectName, p.value.workItemType]);
  const set = (patch: Partial<PlannerSettings>) => p.onChange({ ...s, ...patch });
  const errors = validateSettings(s);
  const dirty = JSON.stringify(s) !== JSON.stringify(p.saved);
  return (
    <div>
      <div className="toolbar">
        <button className="btn primary" disabled={!dirty || p.busy || errors.length > 0} onClick={p.onSave}>{p.busy ? "Saving…" : "Save settings"}</button>
        <button className="btn" disabled={!dirty} onClick={p.onDiscard}>Discard</button>
        {dirty && <span className="badge">unsaved</span>}<span className={errors.length ? "err" : "ok"}>{errors.length ? `${errors.length} thing(s) to fix` : "Settings are complete"}</span>
        <span className="muted" role="status">{p.msg}</span>
      </div>
      {errors.length > 0 && <ul className="err" style={{ margin: "4px 0 10px 18px" }}>{errors.map(e => <li key={e}>{e}</li>)}</ul>}

      <h3>Epics</h3>
      <div className="row">
        <label className="field" style={{ width: 160 }}><span>Work item type</span><input value={s.workItemType} onChange={e => set({ workItemType: e.target.value })} /></label>
        <label className="field" style={{ flex: 1 }}><span>Epic start-date field</span><input list="epic-fields" value={s.epicStartField} placeholder="Custom.StartDate" onChange={e => set({ epicStartField: e.target.value.trim() })} />{!hasField(fields, s.epicStartField) && <span className="err">Not a field of this work item type.</span>}</label>
        <label className="field" style={{ flex: 1 }}><span>Epic target-date field</span><input list="epic-fields" value={s.epicTargetField} placeholder="Custom.TargetDate" onChange={e => set({ epicTargetField: e.target.value.trim() })} />{!hasField(fields, s.epicTargetField) && <span className="err">Not a field of this work item type.</span>}</label>
      </div>
      <datalist id="epic-fields">{fields.map(f => <option key={f.referenceName} value={f.referenceName}>{f.name}</option>)}</datalist>
      {fieldsMsg && <div className="muted">{fieldsMsg}</div>}
      {fields.length > 0 && <div className="help">{fields.length} fields found on {s.workItemType}. Start typing a name or reference name in a field box and pick from the list.</div>}

      <h3>Hours sources (grids)</h3>
      <div className="help">Each grid you add here is read from every Epic. Hours from all of them are added per person and month.</div>
      {s.sources.map((g, i) => <SourceEditor key={g.id} s={g} fields={fields} onChange={n => set({ sources: s.sources.map((x, j) => (j === i ? n : x)) })} onRemove={() => set({ sources: s.sources.filter((_, j) => j !== i) })} />)}
      <button className="btn" onClick={() => set({ sources: [...s.sources, { id: "src" + Date.now().toString(36), name: "", dataField: "", columns: { resource: "" }, excludedStatuses: [] }] })}>+ Add a grid</button>
      <label style={{ display: "block", margin: "8px 0" }}><input type="checkbox" checked={s.estimateUnscheduled} onChange={e => set({ estimateUnscheduled: e.target.checked })} /> When a row has no monthly hours stored, estimate them from its start date, end date and effort (flagged as estimated)</label>

      <h3>Capacity</h3>
      <div className="help">Available hours per person and month are read from the Azure DevOps team capacity of these teams.</div>
      <Chips all={teams} value={s.capacityTeams} onChange={v => set({ capacityTeams: v })} />

      <h3>Period and colours</h3>
      <div className="row">
        <label className="field" style={{ width: 200 }}><span>Default period</span>
          <select value={s.period.kind} onChange={e => set({ period: { ...s.period, kind: e.target.value as PlannerSettings["period"]["kind"] } })}>
            <option value="year">This calendar year</option><option value="quarter">This quarter</option><option value="last12">Last 12 months</option><option value="next12">Next 12 months</option><option value="custom">Custom</option></select></label>
        {s.period.kind === "custom" && <>
          <label className="field" style={{ width: 120 }}><span>From (YYYY-MM)</span><input value={s.period.from ?? ""} onChange={e => set({ period: { ...s.period, from: e.target.value } })} /></label>
          <label className="field" style={{ width: 120 }}><span>To (YYYY-MM)</span><input value={s.period.to ?? ""} onChange={e => set({ period: { ...s.period, to: e.target.value } })} /></label></>}
        {(["spare", "healthy", "full"] as const).map(k => (
          <label className="field" key={k} style={{ width: 130 }}><span>{{ spare: "Spare below %", healthy: "Healthy up to %", full: "Nearly full up to %" }[k]}</span>
            <input type="number" value={s.thresholds[k]} onChange={e => set({ thresholds: { ...s.thresholds, [k]: Number(e.target.value) } })} /></label>))}
        <label className="field" style={{ width: 180 }}><span>Colours</span>
          <select value={s.colourMode} onChange={e => set({ colourMode: e.target.value as "rag" | "shades" })}><option value="rag">Traffic light</option><option value="shades">Shades</option></select></label>
      </div>

      <h3>Access and filters</h3>
      <div className="help">Teams allowed to open the planner (none = every project member). This is a display rule, not access control.</div>
      <Chips all={teams} value={s.accessTeams} onChange={v => set({ accessTeams: v })} />
      <label className="field"><span>Extra Epic fields offered as filters (reference names, comma separated)</span>
        <input defaultValue={s.extraFilterFields.join(", ")} onBlur={e => set({ extraFilterFields: e.target.value.split(",").map(x => x.trim()).filter(Boolean) })} /></label>
    </div>
  );
}
