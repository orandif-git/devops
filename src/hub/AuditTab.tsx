import * as React from "react";
import { AREA_LABEL, AuditEntry, auditCsv, olderThan } from "../core/audit";
import { formatStamp, localTimeZone } from "../core/time";
import { appendAudit, deleteAudit, listAudit, loadRetention, saveRetention } from "../shared/auditStore";
import { useReason } from "./ReasonDialog";

const download = (name: string, text: string) => {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv" })); a.download = name; a.click();
};

export function AuditTab(p: { projectId: string }) {
  const [entries, setEntries] = React.useState<AuditEntry[]>();
  const [months, setMonths] = React.useState(24);
  const [filter, setFilter] = React.useState("");
  const [open, setOpen] = React.useState<string>();
  const [msg, setMsg] = React.useState("");
  const { ask, dialog } = useReason();
  const tz = React.useMemo(localTimeZone, []);
  const when = (iso: string) => formatStamp(new Date(iso), tz);

  const reload = React.useCallback(() => {
    Promise.all([listAudit(p.projectId), loadRetention(p.projectId)]).then(([e, m]) => { setEntries(e); setMonths(m); }).catch(e => setMsg("Could not load the audit log: " + e.message));
  }, [p.projectId]);
  React.useEffect(reload, [reload]);

  if (!entries) return <div className="muted">{msg || "Loading…"}</div>;
  const q = filter.trim().toLowerCase();
  const shown = q ? entries.filter(e => [e.userName, e.userId, e.reason, e.comment, AREA_LABEL[e.area], when(e.at), ...e.changes.flatMap(c => [c.path, c.before, c.after])].join("\n").toLowerCase().includes(q)) : entries;
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
        <span className="muted">{shown.length} of {entries.length} entries · times in {tz}</span>
      </div>
      {old.length > 0 && (
        <div className="card">
          <b>{old.length} entr{old.length === 1 ? "y is" : "ies are"} older than {months} months.</b> Export them before clearing.
          <div className="toolbar"><button className="btn primary" onClick={() => clearOld(true)}>Export and clear</button>
            <button className="btn danger" onClick={() => clearOld(false)}>Clear without exporting</button></div>
        </div>
      )}
      {msg && <div className="muted" role="status">{msg}</div>}
      <table className="grid" style={{ width: "100%" }}>
        <thead><tr><th>When</th><th>User</th><th>What</th><th>Reason</th><th>Comments</th><th>Changes</th></tr></thead>
        <tbody>
          {shown.map(e => (
            <React.Fragment key={e.id}>
              <tr>
                <td>{when(e.at)}</td><td title={e.userId}>{e.userName}</td><td>{AREA_LABEL[e.area] ?? e.area}</td><td>{e.reason}</td><td>{e.comment}</td>
                <td><button className="btn" aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? undefined : e.id)}>{e.changes.length}{e.omitted ? `+${e.omitted}` : ""} value(s)</button></td>
              </tr>
              {open === e.id && (
                <tr><td colSpan={6}>
                  <table className="grid" style={{ width: "100%" }}>
                    <thead><tr><th>Setting</th><th>Previous value</th><th>New value</th></tr></thead>
                    <tbody>{e.changes.map((c, i) => <tr key={i}><td>{c.path}</td><td>{c.before}</td><td>{c.after}</td></tr>)}</tbody>
                  </table>
                  {e.omitted ? <div className="muted">{e.omitted} more change(s) were not kept.</div> : null}
                </td></tr>
              )}
            </React.Fragment>
          ))}
          {!shown.length && <tr><td colSpan={6} className="muted">{entries.length ? "No entries match." : "No changes recorded yet. Every saved change to the settings appears here."}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
