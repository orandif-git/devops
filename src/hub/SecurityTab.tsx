import * as React from "react";
import { HARDENING_STEPS, LEVEL_LABEL, SECURITY_ROWS } from "./securityInfo";

/** A plain statement of what is and is not enforced, so nobody mistakes a guard for access control. */
export function SecurityTab() {
  return (
    <div>
      <div className="help"><b>The extension adds guards inside its own pages and the work item form. It is not an access-control system.</b> Anyone who can call the Azure DevOps REST API, edit in Excel or use a board card is not stopped by a guard. Use Azure DevOps process rules and permissions where real enforcement is needed; the last column says how.</div>
      <table className="audit" style={{ marginTop: 8 }}>
        <thead><tr><th style={{ width: 170 }}>Feature</th><th style={{ width: 190 }}>Level</th><th>What it does</th><th>What it does not stop</th><th>To make it enforced</th></tr></thead>
        <tbody>{SECURITY_ROWS.map(r => (
          <tr key={r.feature} className="grp-end">
            <td><b>{r.feature}</b></td>
            <td><span className={"tag lvl-" + r.level}>{LEVEL_LABEL[r.level]}</span></td>
            <td>{r.what}</td><td>{r.bypass}</td><td>{r.harden}</td>
          </tr>
        ))}</tbody>
      </table>
      <h3>How to harden</h3>
      <ol>{HARDENING_STEPS.map((s, i) => <li key={i} style={{ margin: "4px 0" }}>{s}</li>)}</ol>
    </div>
  );
}
