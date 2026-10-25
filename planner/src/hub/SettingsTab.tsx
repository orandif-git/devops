import * as React from "react";
import { listTeams, TeamRef } from "../../../src/shared/capacityStore";
import { autoMap, Slot } from "../core/detect";
import { isDateType, isLongTextType } from "../core/fieldTypes";
import { validateSettings } from "../core/settings";
import { GridSource, PlannerSettings } from "../core/types";
import { FieldInfo, hasField, listTypeFields } from "../data/fields";
import { GridSample, sampleGrid } from "../data/sample";
import { ExecSettings } from "./ExecSettings";

const SLOTS: [Slot, string, boolean][] = [["resource", "Resource (person)", true], ["start", "Start date", false], ["end", "End date", false], ["effort", "Effort (hours)", false], ["allocation", "Allocation %", false], ["status", "Review status", false], ["task", "Task / activity", false]];

function Chips(p: { all: TeamRef[]; value: TeamRef[]; onChange(v: TeamRef[]): void }) {
  const on = (t: TeamRef) => p.value.some(x => x.id === t.id);
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "4px 0" }}>
      {p.all.map(t => <button key={t.id} className={"chip" + (on(t) ? " on" : "")} onClick={() => p.onChange(on(t) ? p.value.filter(x => x.id !== t.id) : [...p.value, t])}>{t.name}</button>)}
      {!p.all.length && <span className="muted">Loading teams…</span>}
    </div>
  );
}

/** A field picked from a list (falls back to typing when the list could not be read). */
export function FieldPick(p: { label: string; value: string; fields: FieldInfo[]; accept(f: FieldInfo): boolean; placeholder?: string; onChange(v: string): void; flex?: number }) {
  const known = p.fields.length > 0;
  const options = p.fields.filter(f => p.accept(f) || (f.type === "" && !isDateType(f.type)));
  const missing = p.value && !hasField(p.fields, p.value);
  return (
    <label className="field" style={{ flex: p.flex ?? 1 }}><span>{p.label}</span>
      {known ? (
        <select value={p.value} onChange={e => p.onChange(e.target.value)}>
          <option value="">(none)</option>
          {p.value && !options.some(f => f.referenceName.toLowerCase() === p.value.toLowerCase()) && <option value={p.value}>{p.value} (not in the list)</option>}
          {options.map(f => <option key={f.referenceName} value={f.referenceName}>{f.name} · {f.referenceName}</option>)}
        </select>
      ) : <input value={p.value} placeholder={p.placeholder} onChange={e => p.onChange(e.target.value.trim())} />}
      {missing && <span className="err">Not a field of this work item type.</span>}
    </label>
  );
}

function SourceEditor(p: { s: GridSource; fields: FieldInfo[]; project: string; type: string; onChange(s: GridSource): void; onRemove(): void }) {
  const { s } = p;
  const [state, setState] = React.useState<{ busy?: boolean; msg?: string; sample?: GridSample }>({});
  const set = (patch: Partial<GridSource>) => p.onChange({ ...s, ...patch });
  const detect = async (field: string, base: GridSource) => {
    if (!field) return;
    setState({ busy: true, msg: "Looking for an Epic with rows in this grid…" });
    try {
      const sample = await sampleGrid(p.project, p.type, field);
      if (!sample) { setState({ msg: `No Epic has rows in ${field} yet (the 200 most recently changed were checked). Fill a grid in one Epic and try again, or type the column ids.` }); return; }
      const m = autoMap(sample.columns);
      p.onChange({ ...base, dataField: field, columns: { resource: m.resource ?? "", start: m.start, end: m.end, effort: m.effort, allocation: m.allocation, status: m.status, task: m.task }, excludedStatuses: [] });
      setState({ sample, msg: `Found ${sample.rows} row(s) in Epic ${sample.epicId} (“${sample.title}”). The columns below were chosen for you: check them.` });
    } catch (e) { setState({ msg: "Could not read the grid: " + (e as Error).message }); }
  };
  const cols = state.sample?.columns ?? [];
  const statusValues = cols.find(c => c.key === s.columns.status)?.values ?? [];
  const setCol = (slot: Slot, key: string) => set({ columns: { ...s.columns, [slot]: key || (slot === "resource" ? "" : undefined) }, ...(slot === "status" ? { excludedStatuses: [] } : {}) });
  return (
    <div className="card">
      <div className="row">
        <label className="field" style={{ flex: 1 }}><span>Name</span><input value={s.name} placeholder="SDLC Timesheet" onChange={e => set({ name: e.target.value })} /></label>
        <FieldPick label="Grid's data field (the long-text field that holds its rows)" value={s.dataField} fields={p.fields} accept={f => isLongTextType(f.type)} placeholder="Custom.ResourceGrid" flex={2}
          onChange={v => { const nm = s.name || p.fields.find(f => f.referenceName === v)?.name || ""; set({ dataField: v, name: nm }); void detect(v, { ...s, dataField: v, name: nm }); }} />
        <button className="btn danger" onClick={p.onRemove}>Remove</button>
      </div>
      {state.msg && <div className={state.sample ? "ok" : "muted"} role="status">{state.busy ? "⏳ " : ""}{state.msg}</div>}
      <div className="row" style={{ flexWrap: "wrap" }}>
        {SLOTS.map(([slot, label, req]) => (
          <label className="field" key={slot} style={{ width: 210 }}><span>{label}{req ? " *" : ""}</span>
            {cols.length ? (
              <select value={s.columns[slot] ?? ""} onChange={e => setCol(slot, e.target.value)}>
                <option value="">{req ? "(choose)" : "(not used)"}</option>
                {s.columns[slot] && !cols.some(c => c.key === s.columns[slot]) && <option value={s.columns[slot]}>{s.columns[slot]}</option>}
                {cols.map(c => <option key={c.key} value={c.key}>{c.key} · {c.kind}{c.sample ? ` · e.g. ${c.sample.slice(0, 22)}` : ""}</option>)}
              </select>
            ) : <input value={s.columns[slot] ?? ""} placeholder="column id" onChange={e => setCol(slot, e.target.value.trim())} />}
          </label>
        ))}
      </div>
      {s.columns.status && (
        <div>
          <div className="help">Leave out rows whose review status is (optional):</div>
          {statusValues.length ? (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {statusValues.map(v => <label key={v}><input type="checkbox" checked={s.excludedStatuses.includes(v)} onChange={e => set({ excludedStatuses: e.target.checked ? [...s.excludedStatuses, v] : s.excludedStatuses.filter(x => x !== v) })} /> {v}</label>)}
            </div>
          ) : <input defaultValue={s.excludedStatuses.join(", ")} placeholder="e.g. Rejected" onBlur={e => set({ excludedStatuses: e.target.value.split(",").map(x => x.trim()).filter(Boolean) })} />}
        </div>
      )}
      {s.dataField && <div className="row"><button className="btn" disabled={state.busy} onClick={() => detect(s.dataField, s)}>Detect the columns again</button></div>}
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
  React.useEffect(() => {
    setFieldsMsg("");
    listTypeFields(p.projectName, s.workItemType).then(setFields).catch(e => { setFields([]); setFieldsMsg("The fields of this work item type could not be listed (" + (e as Error).message + "). You can still type reference names."); });
  }, [p.projectName, s.workItemType]);
  const set = (patch: Partial<PlannerSettings>) => p.onChange({ ...s, ...patch });
  // preselect the Epic date fields when exactly one date field is named like a start / target date
  React.useEffect(() => {
    const dates = fields.filter(f => isDateType(f.type));
    const one = (re: RegExp) => { const m = dates.filter(f => re.test(f.name) || re.test(f.referenceName)); return m.length === 1 ? m[0].referenceName : ""; };
    const patch: Partial<PlannerSettings> = {};
    if (!s.epicStartField && one(/start/i)) patch.epicStartField = one(/start/i);
    if (!s.epicTargetField && one(/target|finish|end|due/i)) patch.epicTargetField = one(/target|finish|end|due/i);
    if (Object.keys(patch).length) p.onChange({ ...s, ...patch });
  }, [fields]);   // eslint-disable-line react-hooks/exhaustive-deps
  const errors = validateSettings(s);
  const dirty = JSON.stringify(s) !== JSON.stringify(p.saved);
  const isDate = (f: FieldInfo) => isDateType(f.type);
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
        <FieldPick label="Epic start-date field" value={s.epicStartField} fields={fields} accept={isDate} placeholder="Custom.StartDate" onChange={v => set({ epicStartField: v })} />
        <FieldPick label="Epic target-date field" value={s.epicTargetField} fields={fields} accept={isDate} placeholder="Custom.TargetDate" onChange={v => set({ epicTargetField: v })} />
        <FieldPick label="Gantt: field shown at the end of each bar" value={s.ganttLabelField} fields={fields} accept={() => true} placeholder="Custom.DeliveryStatus" onChange={v => set({ ganttLabelField: v })} />
      </div>
      {fieldsMsg && <div className="muted">{fieldsMsg}</div>}

      <h3>Hours sources (grids)</h3>
      <div className="help">Add a grid and pick its data field: the planner reads a sample Epic and chooses the columns for you. Hours from all grids are added per person and month.</div>
      {s.sources.map((g, i) => <SourceEditor key={g.id} s={g} fields={fields} project={p.projectName} type={s.workItemType} onChange={n => set({ sources: s.sources.map((x, j) => (j === i ? n : x)) })} onRemove={() => set({ sources: s.sources.filter((_, j) => j !== i) })} />)}
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
        <label className="field" style={{ width: 200 }}><span>Planner opens in</span>
          <select value={s.plan.view} onChange={e => set({ plan: { ...s.plan, view: e.target.value as PlannerSettings["plan"]["view"] } })}><option value="heat">Heatmap</option><option value="time">Timeline</option><option value="gantt">Epic Gantt</option></select></label>
        <label className="field" style={{ width: 220 }}><span>Group the plan by</span>
          <select value={s.plan.groupBy} onChange={e => set({ plan: { ...s.plan, groupBy: e.target.value as PlannerSettings["plan"]["groupBy"] } })}><option value="team">Team › Person › Epic</option><option value="epic">Epic › Team › Person</option><option value="person">Person › Epic</option></select></label>
        <label className="field" style={{ width: 160 }}><span>Show figures as</span>
          <select value={s.plan.units} onChange={e => set({ plan: { ...s.plan, units: e.target.value as PlannerSettings["plan"]["units"] } })}><option value="h">Hours</option><option value="p">% of capacity</option><option value="f">FTE</option></select></label>
      </div>

      <ExecSettings s={s} fields={fields} project={p.projectName} onChange={p.onChange} />

      <h3>Access and filters</h3>
      <div className="help">Teams allowed to open the planner (none = every project member). This is a display rule, not access control.</div>
      <Chips all={teams} value={s.accessTeams} onChange={v => set({ accessTeams: v })} />
      <label className="field"><span>Extra Epic fields offered as filters (reference names, comma separated)</span>
        <input defaultValue={s.extraFilterFields.join(", ")} onBlur={e => set({ extraFilterFields: e.target.value.split(",").map(x => x.trim()).filter(Boolean) })} /></label>
    </div>
  );
}
