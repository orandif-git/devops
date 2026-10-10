import * as React from "react";
import * as SDK from "azure-devops-extension-sdk";
import { CapacityEditor } from "../capacity/CapacityEditor";
import { Overview } from "../capacity/Overview";
import { loadLiveAllocations } from "../shared/allocationStore";
import { listRecords as listCapacityRecords, loadRegister } from "../shared/capacityStore";
import "../capacity/capacity.css";
import { CapacitySettings, defaultSettings, deleteRecord, listRecords, listTeams, loadSettings, saveRecord, saveSettings, TeamRef } from "../shared/capacityStore";

/** Admin view of the Capacity register: who may edit (Azure DevOps teams), the project default, and the register itself. */
export function CapacityTab(p: { projectId: string }) {
  const [settings, setSettings] = React.useState<CapacitySettings>(defaultSettings());
  const [saved, setSaved] = React.useState("");
  const [teams, setTeams] = React.useState<TeamRef[]>([]);
  const [msg, setMsg] = React.useState("");
  const api = React.useMemo(() => ({
    list: () => listRecords(p.projectId), save: (r: Parameters<typeof saveRecord>[1]) => saveRecord(p.projectId, r), remove: (k: string) => deleteRecord(p.projectId, k),
  }), [p.projectId]);

  React.useEffect(() => {
    loadSettings(p.projectId).then(s => { setSettings(s); setSaved(JSON.stringify(s)); }).catch(e => setMsg("Could not load settings: " + e.message));
    listTeams(p.projectId).then(setTeams).catch(e => setMsg("Could not list teams: " + e.message));
  }, [p.projectId]);

  const load = React.useCallback(async () => {
    const [records, register, docs] = await Promise.all([listCapacityRecords(p.projectId), loadRegister(p.projectId), loadLiveAllocations(p.projectId)]);
    return { records, register, docs };
  }, [p.projectId]);
  const dirty = JSON.stringify(settings) !== saved;
  const toggle = (t: TeamRef) => setSettings(s => ({ ...s, editorTeams: s.editorTeams.some(x => x.id === t.id) ? s.editorTeams.filter(x => x.id !== t.id) : [...s.editorTeams, t] }));
  const save = async () => { try { await saveSettings(p.projectId, settings); setSaved(JSON.stringify(settings)); setMsg("Capacity settings saved."); } catch (e) { setMsg("Save failed: " + (e as Error).message); } };

  return (
    <div>
      <div className="card" style={{ marginTop: 0 }}>
        <h3 style={{ margin: "0 0 4px" }}>Who may edit capacity</h3>
        <div className="help">Members of the selected Azure DevOps <b>teams</b> can edit the Capacity page; everyone else sees it read-only. Leave all unselected to let any project member edit. Project administrators (you, on this page) can always edit. Add people directly to the team – members that come only through a nested group may not be recognised. This controls the extension's pages; it is not a security boundary of Azure DevOps.</div>
        <div className="chips" style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "6px 0" }}>
          {teams.map(t => <span key={t.id} className={"chip" + (settings.editorTeams.some(x => x.id === t.id) ? " on" : "")} onClick={() => toggle(t)}>{t.name}</span>)}
          {!teams.length && <span className="muted">Loading teams…</span>}
        </div>
        <div className="row">
          <label>Default hours per month for people without their own default{" "}
            <input style={{ width: 80 }} placeholder="e.g. 160" value={settings.defaultHours ?? ""} onChange={e => { const v = parseFloat(e.target.value); setSettings(s => ({ ...s, defaultHours: Number.isFinite(v) && v >= 0 ? v : null })); }} /></label>
          <button className="btn primary" disabled={!dirty} onClick={save}>Save settings</button><span className="muted">{msg}</span>
        </div>
      </div>
      <h3>Utilization overview (all Epics)</h3>
      <Overview load={load} />
      <h3>Capacity register</h3>
      <CapacityEditor api={api} canEdit projectId={p.projectId} actor={SDK.getUser().displayName} reason="You are a project administrator, so you can always edit." />
    </div>
  );
}
