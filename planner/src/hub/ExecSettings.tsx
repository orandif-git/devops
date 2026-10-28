import * as React from "react";
import { isCategoryType, isDateType, isNumberType } from "../core/fieldTypes";
import { validateExec } from "../core/settings";
import { ExecSettings as Exec, GridSource, PlannerSettings, ProgressSource } from "../core/types";
import { FieldInfo } from "../data/fields";
import { sampleGrid } from "../data/sample";
import { ColumnGuess } from "../core/detect";
import { FieldPick } from "./SettingsTab";
import { ExecQueries } from "./ExecQueries";

const KINDS: [ProgressSource["kind"], string][] = [["percentField", "A percent-complete field"], ["ratioFields", "Completed ÷ total (two number fields)"], ["gridDone", "Ticked rows of a grid"]];
const csv = (s: string) => s.split(",").map(x => x.trim()).filter(Boolean);

function GridDonePick(p: { src?: GridSource; sources: GridSource[]; project: string; type: string; value: ProgressSource; onChange(v: ProgressSource): void; onSource(s: GridSource): void }) {
  const [cols, setCols] = React.useState<ColumnGuess[]>([]);
  const [msg, setMsg] = React.useState("");
  const find = async () => {
    if (!p.src?.dataField) return;
    setMsg("Looking at a sample Epic…");
    try { const s = await sampleGrid(p.project, p.type, p.src.dataField); if (!s) { setMsg("No Epic has rows in this grid yet. Type the column id."); return; } setCols(s.columns); setMsg(`Found ${s.rows} row(s) in Epic ${s.epicId}. Tick-box columns are listed first.`); }
    catch (e) { setMsg("Could not read the grid: " + (e as Error).message); }
  };
  const tick = (c: ColumnGuess) => c.values.length > 0 && c.values.every(v => /^(true|false|yes|no|y|n|0|1|x|✓)$/i.test(v));
  const sorted = [...cols].sort((a, b) => Number(tick(b)) - Number(tick(a)));
  return (
    <>
      <label className="field" style={{ width: 220 }}><span>Grid</span>
        <select value={p.value.sourceId ?? ""} onChange={e => p.onChange({ ...p.value, sourceId: e.target.value || undefined })}><option value="">(choose)</option>{p.sources.map(g => <option key={g.id} value={g.id}>{g.name || g.dataField || g.id}</option>)}</select></label>
      {p.src && <label className="field" style={{ width: 240 }}><span>Done (tick box) column</span>
        {cols.length ? <select value={p.src.columns.done ?? ""} onChange={e => p.onSource({ ...p.src!, columns: { ...p.src!.columns, done: e.target.value || undefined } })}><option value="">(choose)</option>{sorted.map(c => <option key={c.key} value={c.key}>{c.key}{tick(c) ? " · tick box" : ` · ${c.kind}`}</option>)}</select>
          : <input value={p.src.columns.done ?? ""} placeholder="column id" onChange={e => p.onSource({ ...p.src!, columns: { ...p.src!.columns, done: e.target.value.trim() || undefined } })} />}</label>}
      {p.src && <button className="btn" onClick={find}>Find columns</button>}
      {msg && <span className="muted" role="status">{msg}</span>}
    </>
  );
}

/** The Executive Dashboard part of the settings: category fields, go-live date, where progress comes from, states and thresholds. */
export function ExecSettings(p: { s: PlannerSettings; fields: FieldInfo[]; project: string; onChange(s: PlannerSettings): void }) {
  const { s } = p, x = s.executive;
  const setX = (patch: Partial<Exec>) => p.onChange({ ...s, executive: { ...x, ...patch } });
  const setProg = (i: number, v: ProgressSource) => setX({ progress: x.progress.map((q, j) => (j === i ? v : q)) });
  const move = (i: number, d: number) => { const a = [...x.progress]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setX({ progress: a }); };
  const problems = validateExec(s);
  const name = (f: string) => p.fields.find(y => y.referenceName.toLowerCase() === f.toLowerCase())?.name ?? f;
  const num = (k: keyof Exec, label: string, w = 150) => <label className="field" key={k} style={{ width: w }}><span>{label}</span><input type="number" value={x[k] as number} onChange={e => setX({ [k]: Number(e.target.value) } as Partial<Exec>)} /></label>;
  return (
    <div>
      <h3>Executive dashboard</h3>
      <label style={{ display: "block", margin: "4px 0" }}><input type="checkbox" checked={x.enabled} onChange={e => setX({ enabled: e.target.checked })} /> <b>Enable the Executive Dashboard</b> (the “Executive Dashboard” board under Boards shows it; until this is ticked it only shows a “not enabled” message)</label>
      <div className="help">Off by default. When it is off the tab does not appear and the settings below are hidden.</div>
      {!x.enabled ? null : <>
      {problems.length > 0 && <ul className="err" style={{ margin: "4px 0 8px 18px" }}>{problems.map(e => <li key={e}>{e}</li>)}</ul>}

      <div className="help"><b>Category fields</b>: Epic fields that classify an Epic, for example project type or regulatory. They become filters, the “by category” panel and words you can use when asking questions. None chosen = the area path is used.</div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "4px 0" }}>
        {x.categoryFields.map(f => <span key={f} className="chip on">{name(f)} <button className="btn icon" aria-label={`Remove ${f}`} onClick={() => setX({ categoryFields: x.categoryFields.filter(y => y !== f) })}>×</button></span>)}
        {!x.categoryFields.length && <span className="muted">None (area path is used).</span>}
      </div>
      <div className="row"><FieldPick label="Add a category field" value="" fields={p.fields} accept={f => isCategoryType(f.type)} placeholder="Custom.ProjectType" onChange={v => { if (v && !x.categoryFields.includes(v)) setX({ categoryFields: [...x.categoryFields, v] }); }} />
        <FieldPick label="Go-live date field (empty = the Epic target-date field)" value={x.goLiveField} fields={p.fields} accept={f => isDateType(f.type)} placeholder="Custom.GoLiveDate" onChange={v => setX({ goLiveField: v })} /></div>

      <div className="help" style={{ marginTop: 10 }}><b>Where progress comes from</b>. Sources are tried in order; the first one that has a value for an Epic is used.</div>
      {x.progress.map((g, i) => (
        <div className="card" key={g.id}>
          <div className="row">
            <span className="badge">{i + 1}</span>
            <label className="field" style={{ width: 280 }}><span>Kind</span><select value={g.kind} onChange={e => setProg(i, { id: g.id, kind: e.target.value as ProgressSource["kind"] })}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            {g.kind === "percentField" && <FieldPick label="Percent-complete field (0–100)" value={g.field ?? ""} fields={p.fields} accept={f => isNumberType(f.type)} placeholder="Custom.PercentComplete" onChange={v => setProg(i, { ...g, field: v || undefined })} />}
            {g.kind === "ratioFields" && <>
              <FieldPick label="Completed (number field)" value={g.doneField ?? ""} fields={p.fields} accept={f => isNumberType(f.type)} placeholder="Microsoft.VSTS.Scheduling.CompletedWork" onChange={v => setProg(i, { ...g, doneField: v || undefined })} />
              <FieldPick label="Total (number field)" value={g.totalField ?? ""} fields={p.fields} accept={f => isNumberType(f.type)} placeholder="Microsoft.VSTS.Scheduling.OriginalEstimate" onChange={v => setProg(i, { ...g, totalField: v || undefined })} /></>}
            {g.kind === "gridDone" && <GridDonePick src={s.sources.find(q => q.id === g.sourceId)} sources={s.sources} project={p.project} type={s.workItemType} value={g} onChange={v => setProg(i, v)} onSource={n => p.onChange({ ...s, sources: s.sources.map(q => (q.id === n.id ? n : q)) })} />}
            <span style={{ flex: 1 }} />
            <button className="btn icon" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button><button className="btn icon" aria-label="Move down" disabled={i === x.progress.length - 1} onClick={() => move(i, 1)}>↓</button>
            <button className="btn danger" onClick={() => setX({ progress: x.progress.filter((_, j) => j !== i) })}>Remove</button>
          </div>
          {g.kind === "gridDone" && <div className="help">The share of rows ticked done; weighted by the effort column when every row has one. Add the tick-box column to the grid first.</div>}
        </div>))}
      <button className="btn" onClick={() => setX({ progress: [...x.progress, { id: "pg" + Date.now().toString(36), kind: "percentField" }] })}>+ Add a progress source</button>

      <div className="help" style={{ marginTop: 10 }}><b>States</b> (comma separated, as they appear on the Epic)</div>
      <div className="row">
        {([["doneStates", "Done states"], ["holdStates", "On-hold states"], ["notStartedStates", "Not-started states"], ["ignoreStates", "Left out (for example Removed)"]] as const).map(([k, l]) => (
          <label className="field" key={k} style={{ flex: 1, minWidth: 200 }}><span>{l}</span><input defaultValue={x[k].join(", ")} key={x[k].join("|")} onBlur={e => setX({ [k]: csv(e.target.value) } as Partial<Exec>)} /></label>))}
      </div>
      <div className="help"><b>When is an Epic at risk?</b> Needs attention = above the first limit; at risk = above the second.</div>
      <div className="row">
        {num("slipAmberDays", "Forecast days late: attention")}{num("slipRedDays", "Forecast days late: at risk")}{num("gapAmberPts", "Progress behind time (points): attention", 200)}{num("gapRedPts", "Progress behind time (points): at risk", 200)}
        {num("minElapsedPct", "Forecast only after % of time used", 200)}{num("likelyPct", "Likely to deliver at confidence %", 200)}
      </div>
      <ExecQueries s={s} onChange={p.onChange} />
      </>}
    </div>
  );
}
