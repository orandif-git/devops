import * as React from "react";
import { Check, checksText, runDiagnostics } from "../shared/diagnostics";
import { getProject } from "../shared/ado";
import { migrateAllocationIds } from "../shared/allocationStore";
import { migrateRecordIds } from "../shared/capacityStore";

const ICON = { ok: "✔", warn: "⚠", fail: "✖", info: "ℹ" } as const;

/** One page that checks everything the extension depends on and can be copied to the developer. */
export function DiagnosticsTab() {
  const [checks, setChecks] = React.useState<Check[]>();
  const [running, setRunning] = React.useState(false);
  const [note, setNote] = React.useState("");
  const run = React.useCallback(async () => {
    setRunning(true); setNote("");
    try { setChecks(await runDiagnostics()); } catch (e) { setChecks([{ title: "Diagnostics", level: "fail", detail: (e as Error).message }]); }
    finally { setRunning(false); }
  }, []);
  const copy = async () => { try { await navigator.clipboard.writeText(checksText(checks ?? [])); setNote("Copied."); } catch { setNote("Could not copy: select the text and copy it."); } };
  const migrate = async () => {
    setRunning(true);
    try { const pid = (await getProject()).id; const [a, b] = [await migrateRecordIds(pid), await migrateAllocationIds(pid)]; setNote(`Moved ${a} capacity record(s) and ${b} allocation(s) to short ids.`); await run(); }
    catch (e) { setNote("Migration failed: " + (e as Error).message); setRunning(false); }
  };
  return (
    <div>
      <div className="help">Checks that this server stores the extension's data correctly, that Azure DevOps can be read, and that your settings are consistent. Nothing is changed except short-lived test records, which are removed again. Send the copied result to the developer if something is wrong.</div>
      <div className="toolbar">
        <button className="btn primary" disabled={running} onClick={run}>{running ? "Running…" : checks ? "Run again" : "Run checks"}</button>
        <button className="btn" disabled={!checks || running} onClick={copy}>Copy results</button>
        {checks?.some(c => c.detail.includes("Move to short ids")) && <button className="btn" disabled={running} onClick={migrate}>Move to short ids</button>}
        <span className="muted" role="status">{note}</span>
      </div>
      {checks && (
        <table className="audit" style={{ marginTop: 8 }}>
          <thead><tr><th style={{ width: 28 }} /><th style={{ width: 260 }}>Check</th><th>Result</th><th style={{ width: 70 }}>Time</th></tr></thead>
          <tbody>{checks.map((c, i) => (
            <tr key={i} className="grp-end">
              <td className={c.level === "ok" ? "ok" : c.level === "fail" ? "err" : c.level === "warn" ? "warnc" : "muted"} aria-label={c.level}>{ICON[c.level]}</td>
              <td><b>{c.title}</b></td><td style={{ wordBreak: "break-word" }}>{c.detail}</td><td className="muted">{c.ms !== undefined ? `${c.ms} ms` : ""}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}
