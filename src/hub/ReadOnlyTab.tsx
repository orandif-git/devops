import * as React from "react";
import { ProjectConfig } from "../core/types";
import { writtenFields } from "../core/written";

/** Lists every field the extension writes, so they can be made read-only for users. */
export function ReadOnlyTab(p: { config: ProjectConfig }) {
  const fields = React.useMemo(() => writtenFields(p.config), [p.config]);
  const [copied, setCopied] = React.useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(fields.map(f => f.field).join("\n")); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ } };
  return (
    <div>
      <div className="help">These fields are written by the extension (calculation results, grid totals and grouped totals). The extension recalculates them, so a value typed by a user would be overwritten. Lock them with <b>either</b> or both of the options below.</div>
      <div className="card">
        <table className="cols">
          <thead><tr><th>Field</th><th>Written by</th></tr></thead>
          <tbody>
            {fields.map(f => <tr key={f.field}><td><code>{f.field}</code></td><td>{f.by.join(" · ")}{f.by.length > 1 && <span className="err"> – written by more than one source!</span>}</td></tr>)}
            {!fields.length && <tr><td colSpan={2} className="muted">No calculations or grid totals write to a field yet.</td></tr>}
          </tbody>
        </table>
        {fields.length > 0 && <div className="toolbar"><button className="btn" onClick={copy}>Copy field names</button><span className="muted">{copied ? "Copied" : ""}</span></div>}
      </div>
      <h3>Option A – Read-only Value control (on the form)</h3>
      <ol>
        <li>Organization settings → Process → your process → work item type (e.g. Epic) → <b>Layout</b>.</li>
        <li>For each field above: open the field's <b>⋯ → Edit</b> → <b>Options</b> → <b>Custom control</b> (or add a custom control on the field) and choose <b>Read-only Value</b>, with the field selected.</li>
        <li>Users now see the value with a lock and cannot type in it. It updates by itself when the calculation changes.</li>
      </ol>
      <h3>Option B – Process rule (blocks every edit, including bulk edit and the API)</h3>
      <ol>
        <li>Organization settings → Process → your process → work item type → <b>Rules</b> → <b>New rule</b>.</li>
        <li>Name it e.g. “Calculated fields are read-only”. Leave <b>Conditions</b> empty (applies always).</li>
        <li>Action: <b>Make read-only</b> → choose the field → repeat for each field. Save.</li>
        <li>The extension can still fill the field: read-only rules stop people, not the extension.</li>
      </ol>
      <div className="help">Use A for a clear display, B for real enforcement. Using both is fine. Note: neither can stop an organization administrator from changing a field through the process settings.</div>
    </div>
  );
}
