import * as React from "react";
import { IconClose, IconDown, IconPlus, IconSearch, IconTrash, IconUp } from "./icons";
import { isCategoryType, isDateType, isNumberType } from "../core/fieldTypes";
import { validateExec } from "../core/settings";
import { ExecSettings as Exec, GridSource, PlannerSettings, ProgressSource, TeamRef, ThresholdRule } from "../core/types";
import { FieldInfo } from "../data/fields";
import { sampleGrid } from "../data/sample";
import { ColumnGuess } from "../core/detect";
import { Chips, FieldPick } from "./SettingsTab";
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
      {p.src && <button className="btn" onClick={find}><IconSearch /> Find columns</button>}
      {msg && <span className="muted" role="status">{msg}</span>}
    </>
  );
}

/** The Executive Dashboard part of the settings: category fields, go-live date, where progress comes from, states and thresholds. */
export function ExecSettings(p: { s: PlannerSettings; fields: FieldInfo[]; teams: TeamRef[]; project: string; onChange(s: PlannerSettings): void }) {
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
      <div className="help">Off by default. When it is off the board only says it is not enabled and the settings below are hidden.</div>
      {!x.enabled ? null : <>
      {problems.length > 0 && <ul className="err" style={{ margin: "4px 0 8px 18px" }}>{problems.map(e => <li key={e}>{e}</li>)}</ul>}
      <section className="set-sec">
        <h4><span className="num">1</span> Dashboard</h4>
        <div className="why">Turn the board on, choose the layout it opens in and who can open it.</div>
      <label className="field" style={{ width: 240 }}><span>Layout the dashboard opens in</span>
        <select value={x.layout} onChange={ev => setX({ layout: ev.target.value as Exec["layout"] })}><option value="report">Report (charts and table)</option><option value="map">Portfolio map</option><option value="roadmap">Roadmap</option></select></label>
      <div className="help">Everyone can switch layout on the dashboard; the last layout a person used is remembered for them in their saved views.</div>
      <div className="help" style={{ marginTop: 10 }}><b>Who can open the Executive Dashboard</b>: members of these teams and project administrators. Leave empty to use the same people as the Resource Planner’s Access teams (Settings › General). This is a display rule, not access control: Azure DevOps still trims the Epics each person can read.</div>
      <Chips all={p.teams} value={x.accessTeams} onChange={v => setX({ accessTeams: v })} />
      </section>
      <section className="set-sec">
        <h4><span className="num">2</span> Epics, grouping and dates</h4>
        <div className="why">Which fields group the Epics, which date is the go-live, and what each state means.</div>
      <div className="help"><b>Category fields</b>: Epic fields that classify an Epic, for example project type or regulatory. They become filters, the “by category” panel and words you can use when asking questions. None chosen = the area path is used.</div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "4px 0" }}>
        {x.categoryFields.map(f => <span key={f} className="chip on">{name(f)} <button className="btn icon" aria-label={`Remove ${f}`} onClick={() => setX({ categoryFields: x.categoryFields.filter(y => y !== f) })}><IconClose size={12} /></button></span>)}
        {!x.categoryFields.length && <span className="muted">None (area path is used).</span>}
      </div>
      <div className="row"><FieldPick label="Add a category field" value="" fields={p.fields} accept={f => isCategoryType(f.type)} placeholder="Custom.ProjectType" onChange={v => { if (v && !x.categoryFields.includes(v)) setX({ categoryFields: [...x.categoryFields, v] }); }} />
        <FieldPick label="Go-live date field (empty = the Epic target-date field)" value={x.goLiveField} fields={p.fields} accept={f => isDateType(f.type)} placeholder="Custom.GoLiveDate" onChange={v => setX({ goLiveField: v })} /></div>
      <div className="help" style={{ marginTop: 10 }}><b>States</b> (comma separated, as they appear on the Epic)</div>
      <div className="row">
        {([["doneStates", "Done states"], ["holdStates", "On-hold states"], ["notStartedStates", "Not-started states"], ["ignoreStates", "Left out (for example Removed)"]] as const).map(([k, l]) => (
          <label className="field" key={k} style={{ flex: 1, minWidth: 200 }}><span>{l}</span><input defaultValue={x[k].join(", ")} key={x[k].join("|")} onBlur={e => setX({ [k]: csv(e.target.value) } as Partial<Exec>)} /></label>))}
      </div>
      </section>
      <section className="set-sec">
        <h4><span className="num">3</span> Progress</h4>
        <div className="why">Where an Epic’s percent complete comes from.</div>
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
            <button className="btn icon" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><IconUp /></button><button className="btn icon" aria-label="Move down" disabled={i === x.progress.length - 1} onClick={() => move(i, 1)}><IconDown /></button>
            <button className="btn danger" onClick={() => setX({ progress: x.progress.filter((_, j) => j !== i) })}><IconTrash /> Remove</button>
          </div>
          {g.kind === "gridDone" && <div className="help">The share of rows ticked done; weighted by the effort column when every row has one. Add the tick-box column to the grid first.</div>}
        </div>))}
      <button className="btn" onClick={() => setX({ progress: [...x.progress, { id: "pg" + Date.now().toString(36), kind: "percentField" }] })}><IconPlus /> Add a progress source</button>
      </section>
      <section className="set-sec">
        <h4><span className="num">4</span> Declared status (owner’s RAG)</h4>
        <div className="why">The status the Epic owner enters in a custom field (RAG, Delivery Status). Recommended: it is the status shown, and the data in the next section only checks it.</div>
      <div className="row">
        <FieldPick label="Declared status field (for example Delivery Status or RAG)" value={x.declaredField} fields={p.fields} accept={f => isCategoryType(f.type)} placeholder="Custom.DeliveryStatus" onChange={v => setX({ declaredField: v })} />
      </div>
      {x.declaredField && <>
        <div className="row">
          <label className="field" style={{ width: 340 }}><span>Where the status shown comes from</span>
            <select value={x.statusSource} onChange={e => setX({ statusSource: e.target.value as Exec["statusSource"] })}>
              <option value="data">Data decides</option>
              <option value="rag">Owner’s RAG decides</option>
              <option value="rag-check">Owner’s RAG decides, data checks it</option></select></label>
        </div>
        <div className="help">{x.statusSource === "rag" ? "The owner's RAG is the status. Epics without a recognised value show as Not assessed. Done and Not started Epics keep their own state." : x.statusSource === "rag-check" ? "The owner's RAG is the status. The status from the data stays in the Epic panel, and Epics where the RAG looks better than the data get a “Check this” warning (filter and card). Epics without a value use the data status." : "The status is worked out from the data (section 5). The owner's RAG is only shown next to it, with a RAG check filter."}</div>
        <div className="help"><b>Which to choose</b> (this is the view people see when the dashboard opens; unless it is “Owner’s RAG decides”, they can switch between Owner’s RAG, Data and Variance on the dashboard)
          <ul style={{ margin: "4px 0 0 18px" }}>
            <li><b>Data decides</b>: if you don’t trust people to keep the RAG up to date, or you have no RAG field.</li>
            <li><b>Owner’s RAG decides</b>: if the RAG is the official statement and you want the dashboard to show it exactly.</li>
            <li><b>Owner’s RAG decides, data checks it</b>: the RAG is the official status, and the data tells you which RAGs to question.</li></ul></div>
        <div className="help"><b>Which values mean what</b> (comma separated; leave empty to recognise words such as green, on track, amber, yellow, red, at risk, delayed)</div>
        <div className="row">
          {([["ragGreen", "Green values"], ["ragAmber", "Amber values"], ["ragRed", "Red values"], ["ragNone", "No RAG yet (for example Not Started, N/A)"]] as const).map(([k, l]) => <label className="field" key={k} style={{ flex: 1, minWidth: 200 }}><span>{l}</span><input defaultValue={x[k].join(", ")} key={x[k].join("|")} onBlur={e => setX({ [k]: csv(e.target.value) } as Partial<Exec>)} /></label>)}
        </div></>}
      </section>
      <section className="set-sec">
        <h4><span className="num">5</span> Status from the data (On track · Needs attention · At risk)</h4>
        <div className="why">Used when an Epic has no RAG, and as the check on the RAG. At risk = the go-live date has passed and the Epic is not done. Needs attention = progress is behind the time used.</div>
      <div className="row">
        {num("gapAmberPts", "Needs attention when progress is behind the time used by more than (points)", 380)}
      </div>
      <div className="help">Example: 60% of the time has passed and 40% is done = 20 points behind.</div>
      <div className="help" style={{ marginTop: 10 }}><b>More signals</b> (optional): an Epic not updated for a while, or flagged as blocked, needs attention.</div>
      <div className="row">
        {num("staleDays", "Not updated for days = attention (0 = off)", 240)}
      </div>
      <div className="row">
        <FieldPick label="Blocker or risk flag field" value={x.blockerField} fields={p.fields} accept={f => isCategoryType(f.type) || f.type === "boolean"} placeholder="Custom.Blocked" onChange={v => setX({ blockerField: v })} />
        <label className="field" style={{ flex: 1, minWidth: 240 }}><span>Counts as flagged (comma separated; empty = any value except empty, No, False, None, 0)</span><input defaultValue={x.blockerValues.join(", ")} key={x.blockerValues.join("|")} onBlur={e => setX({ blockerValues: csv(e.target.value) })} /></label>
      </div>
      <details className="adv" open={x.advanced}><summary>Advanced rules: forecast days late, limits per Epic field or per category</summary>
        <label style={{ display: "block", margin: "6px 0" }}><input type="checkbox" checked={x.advanced} onChange={e => setX({ advanced: e.target.checked })} /> <b>Use the advanced rules</b> (off = only the simple rules above)</label>
      <div className="help"><b>When is an Epic at risk?</b> Needs attention = above the first limit; at risk = above the second.</div>
      <div className="row">
        {num("slipAmberDays", "Forecast days late: attention")}{num("slipRedDays", "Forecast days late: at risk")}{num("gapAmberPts", "Progress behind time (points): attention", 200)}{num("gapRedPts", "Progress behind time (points): at risk", 200)}
        {num("minElapsedPct", "Forecast only after % of time used", 200)}{num("likelyPct", "Likely to deliver at confidence %", 200)}
      </div>
      <div className="help" style={{ marginTop: 10 }}><b>Limits that follow the Epic</b>. For each Epic the most specific limit wins: the Epic's own field, then the first matching rule below, then the limits above. The Epic panel says which one was used.</div>
      <div className="row">
        <FieldPick label="Epic's own limit: attention days (number field)" value={x.tolSlipAmberField} fields={p.fields} accept={f => isNumberType(f.type)} placeholder="Custom.SlipTolerance" onChange={v => setX({ tolSlipAmberField: v })} />
        <FieldPick label="at-risk days" value={x.tolSlipRedField} fields={p.fields} accept={f => isNumberType(f.type)} placeholder="Custom.SlipLimit" onChange={v => setX({ tolSlipRedField: v })} />
        <FieldPick label="attention points" value={x.tolGapAmberField} fields={p.fields} accept={f => isNumberType(f.type)} placeholder="Custom.GapTolerance" onChange={v => setX({ tolGapAmberField: v })} />
        <FieldPick label="at-risk points" value={x.tolGapRedField} fields={p.fields} accept={f => isNumberType(f.type)} placeholder="Custom.GapLimit" onChange={v => setX({ tolGapRedField: v })} />
      </div>
      {x.rules.map((q, i) => {
        const setQ = (patch: Partial<ThresholdRule>) => setX({ rules: x.rules.map((y, j) => (j === i ? { ...y, ...patch } : y)) });
        const nm = (k: "slipAmberDays" | "slipRedDays" | "gapAmberPts" | "gapRedPts", label: string) => <label className="field" style={{ width: 120 }}><span>{label}</span><input type="number" min={0} value={q[k] ?? ""} placeholder={String(x[k])} onChange={e => setQ({ [k]: e.target.value === "" ? undefined : Number(e.target.value) } as Partial<ThresholdRule>)} /></label>;
        return (
          <div className="card" key={q.id}><div className="row">
            <span className="badge">{i + 1}</span>
            <FieldPick label="When this field" value={q.field} fields={p.fields} accept={f => isCategoryType(f.type) || f.referenceName === "System.AreaPath"} placeholder="Custom.Type" onChange={v => setQ({ field: v })} />
            <label className="field" style={{ width: 180 }}><span>equals</span><input defaultValue={q.value} key={q.id + q.value} placeholder="Regulatory" onBlur={e => setQ({ value: e.target.value.trim() })} /></label>
            {nm("slipAmberDays", "Attention days")}{nm("slipRedDays", "At-risk days")}{nm("gapAmberPts", "Attention points")}{nm("gapRedPts", "At-risk points")}
            <span style={{ flex: 1 }} />
            <button className="btn icon" aria-label="Move up" disabled={i === 0} onClick={() => { const a = [...x.rules]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; setX({ rules: a }); }}><IconUp /></button>
            <button className="btn icon" aria-label="Move down" disabled={i === x.rules.length - 1} onClick={() => { const a = [...x.rules]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; setX({ rules: a }); }}><IconDown /></button>
            <button className="btn danger" onClick={() => setX({ rules: x.rules.filter((_, j) => j !== i) })}><IconTrash /> Remove</button>
          </div><div className="help">Leave a limit empty to keep the global one (shown in grey). The first matching rule that sets a limit is used.</div></div>);
      })}
      <button className="btn" onClick={() => setX({ rules: [...x.rules, { id: "r" + Date.now().toString(36), field: "", value: "" }] })}><IconPlus /> Add a rule</button>
      </details>
      </section>
      <section className="set-sec">
        <h4><span className="num">6</span> Portfolio map and resources</h4>
        <div className="why">What the size of a block on the Portfolio map means, and whether team, hours and capacity are shown.</div>
      <div className="row">
        <FieldPick label="Map block size (number field; empty = one per Epic)" value={x.sizeField} fields={p.fields} accept={f => isNumberType(f.type)} placeholder="Custom.Budget" onChange={v => setX({ sizeField: v })} />
      </div>
      <label style={{ display: "block", margin: "8px 0" }}><input type="checkbox" checked={x.resources} onChange={e => setX({ resources: e.target.checked })} /> Show resource information (team, hours booked, and “over capacity” counts towards attention). Off = a pure portfolio view.</label>
      </section>
      <section className="set-sec">
        <h4><span className="num">7</span> Calculated fields and saved filters</h4>
        <div className="why">Extra columns worked out with formulas, and named filters offered on the dashboard.</div>
      <ExecQueries s={s} onChange={p.onChange} />
      </section>
      </>}
    </div>
  );
}
