import * as React from "react";
import { activate } from "./ui";
import * as SDK from "azure-devops-extension-sdk";
import { CapacityEditor } from "../capacity/CapacityEditor";
import { Overview } from "../capacity/Overview";
import "../capacity/capacity.css";
import { NativeReport } from "../core/nativeCapacity";
import { loadLiveAllocations } from "../shared/allocationStore";
import {
  CapacitySettings, defaultSettings, deleteRecord, listTeams, loadCapacityRecords, loadRegister, loadSettings, readNativeCapacity,
  saveRecord, saveSettings, TeamRef,
} from "../shared/capacityStore";

const WEEK: [number, string][] = [[0, "Sun"], [1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"]];

/**
 * Admin view of capacity: choose WHERE capacity is maintained (this register, or Azure DevOps team capacity),
 * who may edit the register (teams), the project default, and see the overview and the people.
 */
export function CapacityTab(p: { projectId: string }) {
  const [settings, setSettings] = React.useState<CapacitySettings>(defaultSettings());
  const [saved, setSaved] = React.useState("");
  const [teams, setTeams] = React.useState<TeamRef[]>([]);
  const [msg, setMsg] = React.useState("");
  const [report, setReport] = React.useState<NativeReport[] | string>();
  const [version, setVersion] = React.useState(0);

  const savedSettings = React.useMemo<CapacitySettings>(() => (saved ? { ...defaultSettings(), ...JSON.parse(saved) } : defaultSettings()), [saved]);
  const fromTeams = savedSettings.source === "teams";

  const api = React.useMemo(() => ({
    list: async () => (await loadCapacityRecords(p.projectId, savedSettings)).records,
    save: (r: Parameters<typeof saveRecord>[1]) => saveRecord(p.projectId, r),
    remove: (k: string) => deleteRecord(p.projectId, k),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [p.projectId, savedSettings, version]);

  const load = React.useCallback(async () => {
    const [{ records }, register, live] = await Promise.all([loadCapacityRecords(p.projectId), loadRegister(p.projectId), loadLiveAllocations(p.projectId)]);
    return { records, register, docs: live.docs };
  }, [p.projectId]);

  React.useEffect(() => {
    loadSettings(p.projectId).then(s => { setSettings(s); setSaved(JSON.stringify(s)); }).catch(e => setMsg("Could not load settings: " + e.message));
    listTeams(p.projectId).then(setTeams).catch(e => setMsg("Could not list teams: " + e.message));
  }, [p.projectId]);

  const dirty = JSON.stringify(settings) !== saved;
  const toggle = (key: "editorTeams" | "capacityTeams", t: TeamRef) =>
    setSettings(s => ({ ...s, [key]: s[key].some(x => x.id === t.id) ? s[key].filter(x => x.id !== t.id) : [...s[key], t] }));
  const save = async () => {
    if (settings.source === "register" && !settings.calendar.workingDays.length) { setMsg("Tick at least one working day in the calendar."); return; }
    const clean = { ...settings, calendar: { ...settings.calendar, holidays: settings.calendar.holidays.filter(h => h.start && (!h.end || h.end >= h.start)) } };
    try { await saveSettings(p.projectId, clean); setSettings(clean); setSaved(JSON.stringify(clean)); setMsg(clean.calendar.holidays.length === settings.calendar.holidays.length ? "Capacity settings saved." : "Capacity settings saved (holidays without a valid date were dropped)."); setReport(undefined); setVersion(v => v + 1); }
    catch (e) { setMsg("Save failed: " + (e as Error).message); }
  };
  const check = async () => {
    setReport("Reading Azure DevOps team capacity…");
    try { setReport((await readNativeCapacity(settings.capacityTeams, true)).report); setVersion(v => v + 1); }
    catch (e) { setReport("Could not read team capacity: " + (e as Error).message); }
  };
  const chips = (key: "editorTeams" | "capacityTeams") => (
    <div className="chips" style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "6px 0" }}>
      {teams.map(t => <span role="button" tabIndex={0} onKeyDown={activate} key={t.id} className={"chip" + (settings[key].some(x => x.id === t.id) ? " on" : "")} onClick={() => toggle(key, t)}>{t.name}</span>)}
      {!teams.length && <span className="muted">Loading teams…</span>}
    </div>
  );

  return (
    <div>
      <div className="card" style={{ marginTop: 0 }}>
        <h3 style={{ margin: "0 0 4px" }}>Where is capacity maintained?</h3>
        <label style={{ display: "block", margin: "4px 0" }}><input type="radio" checked={settings.source === "register"} onChange={() => setSettings(s => ({ ...s, source: "register" }))} />{" "}
          <b>This extension's Capacity register</b> – default hours per person and month plus exceptions, edited on the Capacity page.</label>
        <label style={{ display: "block", margin: "4px 0" }}><input type="radio" checked={settings.source === "teams"} onChange={() => setSettings(s => ({ ...s, source: "teams" }))} />{" "}
          <b>Azure DevOps team capacity</b> – managers keep hours per day and days off in Boards → Sprints → Capacity; this extension only reads it.</label>
        {settings.source === "teams" && (
          <div style={{ marginLeft: 22 }}>
            <ol className="help">
              <li>Project settings → Project configuration → <b>Iterations</b>: create one iteration for the year, e.g. <b>Capacity 2026</b> (1 Jan – 31 Dec).</li>
              <li>Project settings → <b>Team configuration</b> → Iterations: add it to the team(s) that hold your people.</li>
              <li>Boards → Sprints → <b>Capacity</b>: for each person enter <b>hours per day</b> and their <b>days off</b> (leave). Team days off (holidays) and the team's working days are respected.</li>
              <li>Tick those teams here. Each January, repeat step 1–3 for the new year.</li>
            </ol>
            <div className="help"><b>Teams that hold the capacity:</b></div>
            {chips("capacityTeams")}
            <div className="help">Available hours per month = working days − team days off − the person's days off, × hours per day. A person in several ticked teams gets the sum, so enter each person in one team only. Anyone in the team can edit Azure DevOps capacity – it is not limited to managers.</div>
            <button className="btn" onClick={check} disabled={!settings.capacityTeams.length}>Check what is read</button>
            {typeof report === "string" && <div className="muted" style={{ marginTop: 6 }}>{report}</div>}
            {Array.isArray(report) && report.map(r => (
              <div key={r.team} style={{ marginTop: 6 }}><b>{r.team}</b>: {r.iterations} iteration(s), {r.members} person(s) with capacity
                {r.messages.length === 0 ? <span className="ok"> – OK</span> : <ul style={{ margin: "2px 0 0 18px" }}>{r.messages.map((m, i) => <li key={i} className="err">{m}</li>)}</ul>}</div>
            ))}
          </div>
        )}
        <div className="row" style={{ marginTop: 8 }}>
          <label>Default hours per month for people without their own default{" "}
            <input style={{ width: 80 }} placeholder="e.g. 160" value={settings.defaultHours ?? ""} onChange={e => { const v = parseFloat(e.target.value); setSettings(s => ({ ...s, defaultHours: Number.isFinite(v) && v >= 0 ? v : null })); }} /></label>
          <button className="btn primary" disabled={!dirty} onClick={save}>Save settings</button><span className="muted">{msg}</span>
        </div>
      </div>

      {settings.source === "register" && (
        <div className="card">
          <h3 style={{ margin: "0 0 4px" }}>Calendar (used when users enter a start date and effort)</h3>
          <div className="help">The effort fills a person's working days in turn, so the end date and the hours per month follow the working week, holidays, the person's hours per day and their leave. With Azure DevOps team capacity this comes from the team settings instead.</div>
          <div className="row">
            <span className="fixed">Working week:</span>
            {WEEK.map(([n, label]) => (
              <label key={n} className="fixed"><input type="checkbox" checked={settings.calendar.workingDays.includes(n)}
                onChange={e => setSettings(s => ({ ...s, calendar: { ...s.calendar, workingDays: e.target.checked ? [...s.calendar.workingDays, n].sort() : s.calendar.workingDays.filter(d => d !== n) } }))} /> {label}</label>
            ))}
            <label className="fixed">Default hours per day <input style={{ width: 60 }} value={settings.calendar.hoursPerDay} onChange={e => { const v = parseFloat(e.target.value); setSettings(s => ({ ...s, calendar: { ...s.calendar, hoursPerDay: Number.isFinite(v) && v >= 0 && v <= 24 ? v : s.calendar.hoursPerDay } })); }} /></label>
          </div>
          <div className="help"><b>Holidays</b> (days nobody works)</div>
          {settings.calendar.holidays.map((h, i) => (
            <div className="row" key={i}>
              <input type="date" value={h.start} onChange={e => setSettings(s => ({ ...s, calendar: { ...s.calendar, holidays: s.calendar.holidays.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)) } }))} />
              <span className="fixed">to</span>
              <input type="date" value={h.end ?? ""} onChange={e => setSettings(s => ({ ...s, calendar: { ...s.calendar, holidays: s.calendar.holidays.map((x, j) => (j === i ? { ...x, end: e.target.value || undefined } : x)) } }))} />
              <input placeholder="Name (optional)" value={h.name ?? ""} onChange={e => setSettings(s => ({ ...s, calendar: { ...s.calendar, holidays: s.calendar.holidays.map((x, j) => (j === i ? { ...x, name: e.target.value || undefined } : x)) } }))} />
              <button className="btn icon danger fixed" onClick={() => setSettings(s => ({ ...s, calendar: { ...s.calendar, holidays: s.calendar.holidays.filter((_, j) => j !== i) } }))}>✕</button>
            </div>
          ))}
          <button className="btn" onClick={() => setSettings(s => ({ ...s, calendar: { ...s.calendar, holidays: [...s.calendar.holidays, { start: "" }] } }))}>+ Add holiday</button>
          <div className="help">Hours per day and leave of a person are set in the register below (select a person with ⓘ).</div>
        </div>
      )}

      {settings.source === "register" && (
        <div className="card">
          <h3 style={{ margin: "0 0 4px" }}>Who may edit the register</h3>
          <div className="help">Members of the selected Azure DevOps <b>teams</b> can edit the Capacity page; everyone else sees it read-only. Leave all unselected to let any project member edit. Project administrators (you, on this page) can always edit. Add people directly to the team – members that come only through a nested group may not be recognised. This controls the extension's pages; it is not a security boundary of Azure DevOps.</div>
          {chips("editorTeams")}
        </div>
      )}

      <h3>Utilization overview (all Epics)</h3>
      <Overview load={load} key={"ov" + version} />
      <h3>{fromTeams ? "People and capacity read from Azure DevOps" : "Capacity register"}</h3>
      <CapacityEditor api={api} canEdit={!fromTeams} projectId={p.projectId} actor={SDK.getUser().displayName} key={"ed" + version}
        reason={fromTeams ? "Read-only: capacity comes from Azure DevOps team capacity (Boards → Sprints → Capacity). Change it there." : "You are a project administrator, so you can always edit."} />
    </div>
  );
}
