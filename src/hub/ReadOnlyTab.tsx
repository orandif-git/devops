import * as React from "react";
import { ProjectConfig } from "../core/types";
import { READONLY_CONTROL_TYPES, writtenFields } from "../core/written";
import { Ctx } from "./ui";

/** Lists every field the extension writes, so they can be made read-only for users. */
export function ReadOnlyTab(p: { config: ProjectConfig }) {
  const fields = React.useMemo(() => writtenFields(p.config), [p.config]);
  const info = React.useContext(Ctx).fields;
  const typeOf = (ref: string) => info.find(f => f.referenceName === ref)?.type;
  const [copied, setCopied] = React.useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(fields.map(f => f.field).join("\n")); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ } };
  return (
    <div>
      <div className="help">These fields are written by the extension (calculation results, grid totals and grouped totals). The extension recalculates them, so a value typed by a user would be overwritten. Lock them with <b>either</b> or both of the options below.</div>
      <div className="card">
        <table className="cols">
          <thead><tr><th>Field</th><th>Type</th><th>Written by</th></tr></thead>
          <tbody>
            {fields.map(f => <tr key={f.field}><td><code>{f.field}</code></td><td>{typeOf(f.field) ?? <span className="muted">unknown</span>}{typeOf(f.field) && !READONLY_CONTROL_TYPES.includes(typeOf(f.field)!.toLowerCase()) && <span className="err"> – the Read-only Value control cannot show this type</span>}</td><td>{f.by.join(" · ")}{f.by.length > 1 && <span className="err"> – written by more than one source!</span>}</td></tr>)}
            {!fields.length && <tr><td colSpan={3} className="muted">No calculations or grid totals write to a field yet.</td></tr>}
          </tbody>
        </table>
        {fields.length > 0 && <div className="toolbar"><button className="btn" onClick={copy}>Copy field names</button><span className="muted">{copied ? "Copied" : ""}</span></div>}
      </div>
      <h3>Recommended – Read-only Value control (on the form)</h3>
      <ol>
        <li>Organization settings → Process → your process → work item type (e.g. Epic) → <b>Layout</b>.</li>
        <li>For each field above: open the field's <b>⋯ → Edit</b> → <b>Options</b> → <b>Custom control</b> (or add a custom control on the field) and choose <b>Read-only Value</b>, with the field selected.</li>
        <li>Users now see the value with a lock and cannot type in it. It updates by itself when the calculation changes.</li>
      </ol>
      <div className="help"><b>Keep these fields writable in the process rules.</b> The extension fills them through the work item form, and a “Make read-only” rule makes the form refuse that write (the grid then shows “Totals not saved”). The Read-only Value control is what stops people typing. When a work item with rows is opened, the extension also corrects any of these fields that was changed by hand or by another tool.</div>
      <h3>Option B – Process rule (not recommended for these fields)</h3>
      <ol>
        <li>Organization settings → Process → your process → work item type → <b>Rules</b> → <b>New rule</b>.</li>
        <li>Name it e.g. “Calculated fields are read-only”. Leave <b>Conditions</b> empty (applies always).</li>
        <li>Action: <b>Make read-only</b> → choose the field → repeat for each field. Save.</li>
        <li><b>Test it once:</b> edit a grid on a work item and check the field still fills. A read-only rule stops everyone, including this extension: if the field stays empty after the rule is on, remove the rule from that field and use the Read-only Value control.</li>
      </ol>
      <div className="help">The control stops edits on the work item form only; Excel, query edits and the API can still write the field, and the correction on open repairs it. Note: neither can stop an organization administrator from changing a field through the process settings.</div>
    </div>
  );
}
