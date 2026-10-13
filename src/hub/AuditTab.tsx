import * as React from "react";
import { AREA_LABEL, AuditEntry, auditCsv, olderThan } from "../core/audit";
import { formatStamp, localTimeZone } from "../core/time";
import { appendAudit, auditStorageCheck, deleteAudit, listAudit, loadRetention, saveRetention } from "../shared/auditStore";
import { describeChange, rowOf } from "../core/auditText";
import { useReason } from "./ReasonDialog";

const download = (name: string, text: string) => {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv" })); a.download = name; a.click();
};

/** `version` changes after every save of the settings, so a list that is already open reloads and shows the new entry. */
/** "Grid “SDLC Timesheet” › Column “test” (checkbox)": the names are shown bold. */
function Where(p: { text: string }) {
  return <span className="path">{p.text.split(" › ").map((seg, i) => {
    const m = /^(.*?)“([^”]*)”(.*)$/s.exec(seg);
    return <React.Fragment key={i}>{i > 0 && " › "}{m ? <>{m[1]}<b>{m[2]}</b>{m[3]}</> : seg}</React.Fragment>;
  })}</span>;
}

export function AuditTab(p: { projectId: string; version?: string }) {
  const [entries, setEntries] = React.useState<AuditEntry[]>();
  const [months, setMonths] = React.useState(24);
  const [filter, setFilter] = React.useState("");
    const [tech, setTech] = React.useState<Set<string>>(new Set());
  const [msg, setMsg] = React.useState("");
  const [check, setCheck] = React.useState<string[]>();
  const { ask, dialog } = useReason();
  const tz = React.useMemo(localTimeZone, []);
  const when = (iso: string) => formatStamp(new Date(iso), tz);

  const reload = React.useCallback(() => {
    Promise.all([listAudit(p.projectId), loadRetention(p.projectId)]).then(([e, m]) => { setEntries(e); setMonths(m); }).catch(e => setMsg("Could not load the audit log: " + e.message));
  }, [p.projectId]);
  React.useEffect(reload, [reload, p.version]);

  if (!entries) return <div className="muted">{msg || "Loading…"}</div>;
  const q = filter.trim().toLowerCase();
  const shown = q ? entries.filter(e => [e.userName, e.userId, e.reason, e.comment, AREA_LABEL[e.area], when(e.at), ...e.changes.flatMap(c => [describeChange(c, e.area).text, c.path, c.before, c.after])].join("\n").toLowerCase().includes(q)) : entries;
  const old = olderThan(entries, months);

  const exportAll = () => download(`audit-log-${new Date().toISOString().slice(0, 10)}.csv`, auditCsv(shown, when));
  const changeRetention = async (m: number) => {
    if (!Number.isInteger(m) || m < 1 || m > 120 || m === months) return;
    const why = await ask("Why are you changing the audit retention?", `From ${months} to ${m} months.`);
    if (!why) { setMsg("Not changed: a reason is required."); return; }
    try {
      await saveRetention(p.projectId, m); setMonths(m);
      await appendAudit(p.projectId, { area: "audit-settings", reason: why.reason, comment: why.comment, before: { retentionMonths: months }, after: { retentionMonths: m } });
      setMsg("Retention saved."); reload();
    } catch (e) { setMsg("Could not save: " + (e as Error).message); }
  };
  const clearOld = async (exportFirst: boolean) => {
    if (!old.length) return;
    if (exportFirst) download(`audit-log-before-${new Date().toISOString().slice(0, 10)}.csv`, auditCsv(old, when));
    const why = await ask(`Clear ${old.length} entr${old.length === 1 ? "y" : "ies"} older than ${months} months?`, exportFirst ? "They were exported to a CSV file first." : "They have NOT been exported. This cannot be undone.");
    if (!why) { setMsg("Nothing was cleared."); return; }
    try {
      await deleteAudit(p.projectId, old.map(e => e.id));
      await appendAudit(p.projectId, { area: "audit-settings", reason: why.reason, comment: why.comment, before: { entries: entries.length }, after: { entries: entries.length - old.length, clearedOlderThanMonths: months, exported: exportFirst } });
      setMsg(`${old.length} old entr${old.length === 1 ? "y" : "ies"} cleared.`); reload();
    } catch (e) { setMsg("Could not clear: " + (e as Error).message); }
  };

  return (
    <div>
      {dialog}
      <div className="toolbar">
        <input type="search" placeholder="Search user, setting, value, reason…" value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 300 }} />
        <button className="btn" onClick={exportAll} disabled={!shown.length}>Export CSV{q ? " (filtered)" : ""}</button>
        <label className="fixed">Keep entries for <input type="number" min={1} max={120} style={{ width: 60 }} defaultValue={months} key={months} onBlur={e => changeRetention(parseInt(e.target.value, 10))} /> months</label>
        <button className="btn" onClick={reload}>Refresh</button>
        <button className="btn" title="Writes and removes a few test records to see whether this server stores and lists them. The real log is not touched." onClick={() => { setCheck(["Checking…"]); auditStorageCheck(p.projectId).then(setCheck).catch(e => setCheck(["✖ " + (e as Error).message])); }}>Check storage</button>
        <span className="muted">{shown.length} of {entries.length} entries · times in {tz}</span>
      </div>
      {entries[0] && (
        <div className="last" role="status">
          <b>Last change:</b> {entries[0].userName} · {when(entries[0].at)} · {AREA_LABEL[entries[0].area] ?? entries[0].area}
          <span className="muted"> · “{entries[0].reason}”</span>
        </div>
      )}
      {old.length > 0 && (
        <div className="card">
          <b>{old.length} entr{old.length === 1 ? "y is" : "ies are"} older than {months} months.</b> Export them before clearing.
          <div className="toolbar"><button className="btn primary" onClick={() => clearOld(true)}>Export and clear</button>
            <button className="btn danger" onClick={() => clearOld(false)}>Clear without exporting</button></div>
        </div>
      )}
      {check && <div className="card" role="status">{check.map((l, i) => <div key={i} className={l.startsWith("✖") ? "err" : ""}>{l}</div>)}</div>}
      {msg && <div className="muted" role="status">{msg}</div>}
      <table className="audit">
        <thead><tr><th style={{ width: 150 }}>When</th><th style={{ width: 100 }}>By</th><th>What changed</th><th style={{ width: 210 }}>Before</th><th style={{ width: 250 }}>After</th><th style={{ width: 240 }}>Reason &amp; comments</th></tr></thead>
        <tbody>
          {shown.map(e => {
            const rows = e.changes.length ? e.changes.map(c => rowOf(c, e.area)) : [undefined];
            const span = rows.length + (e.omitted ? 1 : 0) + (tech.has(e.id) ? 1 : 0);
            const [day, time] = when(e.at).split(" ");
            return (
              <React.Fragment key={e.id}>
                {rows.map((r, i) => (
                  <tr key={i} className={(i === 0 ? "first " : "") + (i === rows.length - 1 && !e.omitted && !tech.has(e.id) ? "grp-end" : "")}>
                    {i === 0 && <td className="when" rowSpan={span}>{day}<br /><span className="muted">{time} {when(e.at).split(" ").slice(2).join(" ")}</span></td>}
                    {i === 0 && <td className="who" rowSpan={span} title={e.userId}>{e.userName}</td>}
                    {r ? (
                      <>
                        <td className="chg"><span className={"tag " + r.kind}>{r.kind === "reordered" ? "Reordered" : r.kind[0].toUpperCase() + r.kind.slice(1)}</span><Where text={r.where} /></td>
                        <td className={"val" + (r.before === "—" ? " none" : "")}>{r.before}</td>
                        <td className={"val" + (r.after === "—" ? " none" : "")}>{r.after}</td>
                      </>
                    ) : <td colSpan={3} className="muted">No value changes were recorded.</td>}
                    {i === 0 && (
                      <td className="reason" rowSpan={span}>
                        <div><b>{e.reason}</b></div><div>{e.comment}</div>
                        <span className="area">{AREA_LABEL[e.area] ?? e.area}</span>{" "}
                        <button className="link" onClick={() => setTech(c => { const n = new Set(c); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n; })}>{tech.has(e.id) ? "Hide" : "Show"} technical detail</button>
                      </td>
                    )}
                  </tr>
                ))}
                {e.omitted ? <tr className={tech.has(e.id) ? "" : "grp-end"}><td colSpan={3} className="muted">{e.omitted} more change(s) were not kept.</td></tr> : null}
                {tech.has(e.id) && (
                  <tr className="grp-end"><td colSpan={3}>
                    <table className="raw"><thead><tr><th>Setting</th><th>Previous value</th><th>New value</th></tr></thead>
                      <tbody>{e.changes.map((c, i) => <tr key={i}><td>{c.path}</td><td>{c.before}</td><td>{c.after}</td></tr>)}</tbody></table>
                  </td></tr>
                )}
              </React.Fragment>
            );
          })}
          {!shown.length && <tr><td colSpan={6} className="muted">{entries.length ? "No entries match." : "No changes recorded yet. Every saved change to the settings appears here."}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
