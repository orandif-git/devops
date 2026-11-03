import * as React from "react";
import { normProgress, ProgressSettings } from "../core/progress";
import { normalizeSettings } from "../../planner/src/core/settings";
import { StageSettings } from "../../planner/src/core/stages";
import { isDateType } from "../../planner/src/core/fieldTypes";
import { FieldPick } from "../../planner/src/hub/FieldPick";
import { StagesEditor } from "../../planner/src/hub/StagesEditor";
import { addGroup, contributionId, detailsSlot, findGroup, findProcess, findType, getLayout, ProcessInfo, ProcessLayoutError, realRest, removeGroup, Rest } from "../shared/processLayout";
import { Ctx } from "./ui";
import "./progress-tab.css";

const MANUAL = "Organization settings › Process › your process › the work item type › Layout › New group, named as below › add the “Delivery progress” control › drag the group to the top of the first column.";
type Info = { state: "loading" } | { state: "error"; text: string; kind?: ProcessLayoutError["kind"] } | { state: "ok"; process: ProcessInfo; typeRef: string; inLayout: boolean; position?: number };

/**
 * Settings of the Delivery progress control: one switch that adds or removes the whole group in the Epic layout (so it is either there with its content or not there at all),
 * and the stage and date setup, which is the same as the Executive Dashboard’s.
 */
export function ProgressTab(p: { projectId: string; progress: ProgressSettings; onChange(v: ProgressSettings): void; rest?: Rest }) {
  const { projectName, types, fields } = React.useContext(Ctx), rest = p.rest ?? realRest, s = p.progress;
  const [info, setInfo] = React.useState<Info>({ state: "loading" }), [ask, setAsk] = React.useState<"" | "on" | "off">(""), [ack, setAck] = React.useState(false), [busy, setBusy] = React.useState(false), [msg, setMsg] = React.useState("");
  const set = (patch: Partial<ProgressSettings>) => p.onChange(normProgress({ ...s, ...patch }));
  const cid = React.useMemo(() => { try { return contributionId(); } catch { return "delivery-progress"; } }, []);

  const load = React.useCallback(async () => {
    setInfo({ state: "loading" });
    try {
      const process = await findProcess(rest, p.projectId), typeRef = await findType(rest, process.id, s.workItemType), layout = await getLayout(rest, process.id, typeRef), g = findGroup(layout, cid, s.groupLabel);
      detailsSlot(layout);
      setInfo({ state: "ok", process, typeRef, inLayout: !!g, position: g?.position });
    } catch (e) { setInfo({ state: "error", text: (e as Error).message, kind: (e as ProcessLayoutError).kind }); }
  }, [p.projectId, s.workItemType, s.groupLabel, rest, cid]);
  React.useEffect(() => { void load(); }, [load]);

  const inherited = info.state === "ok" && info.process.kind === "inherited", others = info.state === "ok" ? info.process.projects : [];
  const apply = async (on: boolean) => {
    if (info.state !== "ok") return;
    setBusy(true); setMsg("");
    try {
      if (on) {
        const r = await addGroup(rest, { processId: info.process.id, typeRef: info.typeRef, label: s.groupLabel, contributionId: cid, height: 46 });
        set({ enabled: true, layout: { processId: info.process.id, processName: info.process.name, groupId: r.groupId, at: new Date().toISOString() } });
        setMsg(`Added to the ${s.workItemType} layout${r.position ? `. It is in position ${r.position + 1}: drag it to the top of the first column in the layout editor` : ""}. Save the settings to keep the switch.`);
      } else {
        await removeGroup(rest, { processId: info.process.id, typeRef: info.typeRef, label: s.groupLabel, contributionId: cid });
        set({ enabled: false, layout: undefined }); setMsg(`Removed from the ${s.workItemType} layout. Your settings are kept. Save the settings to keep the switch.`);
      }
      setAsk(""); setAck(false); await load();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  const mapped: ReturnType<typeof normalizeSettings> = React.useMemo(() => normalizeSettings({ workItemType: s.workItemType, executive: { stages: s.stages } }), [s.workItemType, s.stages]);
  const pf = React.useMemo(() => fields.map(f => ({ referenceName: f.referenceName, name: f.name, type: f.type })), [fields]);

  return (
    <div className="ptab">
      <div className="help">A delivery bar for the stages (for example Development, SIT, UAT, Deployment, Live): a marker shows the stage the work item is in, a speech bubble says whether it is on track (green), needs attention (amber) or is at risk (red), and the go-live date and the days left are under it. It is the first group on the work item form and only reads the form, so it never makes the work item “unsaved”. The heading above it is the <b>group name</b> below, which Azure DevOps draws.</div>
      <div className="card">
        <label className="swrow"><input type="checkbox" role="switch" checked={s.enabled} disabled={busy || info.state !== "ok" || !inherited} onChange={e => { setAsk(e.target.checked ? "on" : "off"); setAck(false); setMsg(""); }} /> <b>Show Delivery progress on the {s.workItemType} form</b></label>
        <div className="help">On: the extension adds the group to the top of the first column of the {s.workItemType}’s Details page. Off: it removes the group, so nothing is shown (no heading, no message).</div>
        <div className="pstat">
          {info.state === "loading" && <span className="muted">Reading the process…</span>}
          {info.state === "error" && <div className="err" role="alert">{info.text}<div className="muted">You can still add it by hand: {MANUAL}</div></div>}
          {info.state === "ok" && <>
            <div><span>Process</span><b>{info.process.name}</b><small>{inherited ? "inherited process" : "a system or XML process"}</small></div>
            <div><span>Projects using this process</span><b>{others.length}</b><small>{others.map(x => x.name).join(", ")}</small></div>
            <div><span>Layout now</span><b className={info.inLayout ? "ok" : ""}>{info.inLayout ? "Group is in the layout" : "Group is not in the layout"}</b><small>{info.inLayout ? (info.position === 0 || info.position === undefined ? "Details page · first column · first group" : `position ${info.position + 1} in the first column`) : `${s.workItemType} · Details page`}</small></div>
          </>}
        </div>
        {info.state === "ok" && !inherited && <div className="err" role="alert">This project uses a system or XML process. The extension can change inherited processes only: create an inherited process for the project, or add the group by hand. {MANUAL}</div>}
        {s.enabled && info.state === "ok" && !info.inLayout && inherited && <div className="pwarn" role="status">The switch is on but the group is not in the layout (it may have been removed there). <button className="btn" disabled={busy} onClick={() => { setAsk("on"); setAck(false); }}>Add it again…</button></div>}
        {ask && info.state === "ok" && (
          <div className="pdlg" role="dialog" aria-label={ask === "on" ? "Add to the layout" : "Remove from the layout"}>
            <h4>{ask === "on" ? "Add to the layout" : "Remove from the layout"}</h4>
            <p>This will {ask === "on" ? "add" : "remove"} the group <b>“{s.groupLabel}”</b> {ask === "on" ? "to" : "from"} the <b>{s.workItemType}</b> layout of the process <b>{info.process.name}</b>.</p>
            <p className="pwarn">The process is shared. The layout changes for all <b>{others.length} project{others.length === 1 ? "" : "s"}</b> that use it{others.length ? `: ${others.map(x => x.name).join(", ")}` : ""}.{ask === "off" ? " Your settings are kept, so you can turn it on again." : " Nothing else in the layout changes."}</p>
            <label><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} /> I understand this changes the layout for all {others.length} project{others.length === 1 ? "" : "s"}</label>
            <div className="toolbar"><button className="btn" disabled={busy} onClick={() => { setAsk(""); setAck(false); }}>Cancel</button><button className={"btn " + (ask === "on" ? "primary" : "danger")} disabled={!ack || busy} onClick={() => apply(ask === "on")}>{busy ? "Working…" : ask === "on" ? "Add to the layout" : "Remove from the layout"}</button></div>
          </div>)}
        {msg && <div className={/^(Added|Removed)/.test(msg) ? "ok" : "err"} role="status" style={{ marginTop: 6 }}>{msg}</div>}
        <div className="help">If you cannot change the layout, add the group yourself: {MANUAL}</div>
      </div>
      <div className="card">
        <div className="row popts">
          <label className="field" style={{ width: 200 }}><span>Work item type</span><select aria-label="Work item type" value={s.workItemType} onChange={e => set({ workItemType: e.target.value })}>{Array.from(new Set([s.workItemType, ...types])).map(t => <option key={t} value={t}>{t}</option>)}</select></label>
          <label className="field" style={{ width: 240 }}><span>Group name (the heading people see)</span><input aria-label="Group name" value={s.groupLabel} onChange={e => set({ groupLabel: e.target.value })} /></label>
          <label className="field" style={{ flex: 1 }}><span>States that mean delivered (comma separated)</span><input aria-label="Delivered states" key={s.doneStates.join("|")} defaultValue={s.doneStates.join(", ")} onBlur={e => set({ doneStates: e.target.value.split(",").map(x => x.trim()).filter(Boolean) })} /></label>
        </div>
        <div className="row"><FieldPick label="Go-live date field (the finish line)" value={s.goLiveField} fields={pf} accept={f => isDateType(f.type)} placeholder="Microsoft.VSTS.Scheduling.TargetDate" onChange={v => set({ goLiveField: v })} /></div>
        <div className="help">The date the work item should go live: it is the flag at the end of the bar and gives “days left”. Leave it empty to show no finish line.</div>
        <div className="help">Changing the group name later does not rename a group that is already in the layout: rename it there, or remove it and add it again.</div>
        <label style={{ display: "block", margin: "6px 0" }}><input type="checkbox" checked={s.showTime} onChange={e => set({ showTime: e.target.checked })} /> Show the days in the current stage (“In Development since 27 Oct (7 days)”)</label>
        <label style={{ display: "block", margin: "6px 0" }}><input type="checkbox" checked={s.flags} onChange={e => set({ flags: e.target.checked })} /> Flag stage dates that do not fit (a start date missing, out of order, a skipped stage)</label>
      </div>
      <div className="card"><h3 style={{ marginTop: 0 }}>Stages and dates</h3>
        <div className="help">The same setup as in the Executive Dashboard (Resource Planner &amp; Heatmap), so one {s.workItemType} gets the same answer in both. Choose where the stage comes from, the stages in order, which value is which stage, and the date fields.</div>
        <StagesEditor s={mapped} fields={pf} project={projectName} onChange={(st: StageSettings) => set({ stages: st })} />
      </div>
    </div>
  );
}
