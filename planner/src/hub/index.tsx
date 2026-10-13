import * as React from "react";
import * as ReactDOM from "react-dom";
import * as SDK from "azure-devops-extension-sdk";
import "../../../src/shared/styles.css";
import { getProject, init } from "../../../src/shared/ado";
import { rest } from "../rest";

interface Check { title: string; ok: boolean; detail: string; ms: number }
const run = async (title: string, fn: () => Promise<string>): Promise<Check> => {
  const t0 = Date.now();
  try { return { title, ok: true, detail: await fn(), ms: Date.now() - t0 }; } catch (e) { return { title, ok: false, detail: (e as Error).message, ms: Date.now() - t0 }; }
};

/** Phase 0: an empty page that proves the extension loads on this server and that the read calls the planner will use work. */
function App(p: { projectId: string; projectName: string }) {
  const [checks, setChecks] = React.useState<Check[]>([]);
  const [id, setId] = React.useState("");
  const [field, setField] = React.useState("");
  const [probe, setProbe] = React.useState("");
  React.useEffect(() => {
    (async () => {
      const out: Check[] = [];
      out.push(await run("Connection", async () => { const h = SDK.getHost(); return `${h.name ?? "?"} (${h.isHosted ? "Azure DevOps Services" : "Azure DevOps Server"}) · project ${p.projectName} · ${SDK.getUser().displayName}`; }));
      out.push(await run("Read teams", async () => `${(await rest<{ value: unknown[] }>("GET", `projects/${encodeURIComponent(p.projectId)}/teams`, { query: { $top: 200 } })).value.length} team(s)`));
      out.push(await run("Query Epics (WIQL)", async () => {
        const r = await rest<{ workItems?: { id: number }[] }>("POST", "wit/wiql", { project: p.projectName, body: { query: "SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = 'Epic' AND [System.TeamProject] = @project" } });
        return `${(r.workItems ?? []).length} Epic(s) found`;
      }));
      setChecks(out);
    })();
  }, [p.projectId, p.projectName]);
  const readOne = async () => {
    setProbe("Reading…");
    try {
      const r = await rest<{ value: { id: number; fields: Record<string, unknown> }[] }>("POST", "wit/workitemsbatch", { body: { ids: [Number(id)], fields: ["System.Title", field].filter(Boolean) } });
      const w = r.value[0]; const v = field ? w?.fields?.[field] : undefined;
      setProbe(w ? `Epic ${w.id}: “${String(w.fields["System.Title"])}”${field ? ` · field ${field}: ${v === undefined ? "not returned (empty or not on this type)" : `${String(v).length} characters read; starts: ${String(v).slice(0, 80).replace(/\s+/g, " ")}`}` : ""}` : "No such work item.");
    } catch (e) { setProbe("Failed: " + (e as Error).message); }
  };
  return (
    <div style={{ padding: "16px 22px", maxWidth: 900 }}>
      <h2 style={{ margin: 0 }}>Resource Planner &amp; Heatmap</h2>
      <div className="muted" style={{ marginBottom: 12 }}>Work in progress · phase 0: the page loads and the read calls work.</div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}><tbody>
        {checks.map((c, i) => <tr key={i}><td style={{ width: 24 }} className={c.ok ? "ok" : "err"}>{c.ok ? "✔" : "✖"}</td><td style={{ width: 200 }}><b>{c.title}</b></td><td>{c.detail}</td><td className="muted" style={{ width: 70 }}>{c.ms} ms</td></tr>)}
        {!checks.length && <tr><td className="muted">Checking…</td></tr>}
      </tbody></table>
      <h3>Read one Epic's field</h3>
      <div className="muted">Checks that a long text field (such as a grid's data field) comes back complete from the batch read.</div>
      <div style={{ display: "flex", gap: 8, margin: "8px 0", flexWrap: "wrap" }}>
        <input placeholder="Epic id" value={id} onChange={e => setId(e.target.value)} style={{ width: 90 }} />
        <input placeholder="Field reference name, e.g. Custom.ResourceGrid" value={field} onChange={e => setField(e.target.value)} style={{ width: 340 }} />
        <button className="btn" disabled={!/^\d+$/.test(id)} onClick={readOne}>Read</button>
      </div>
      <div role="status">{probe}</div>
    </div>
  );
}

async function main() {
  await init(true);
  const project = await getProject();
  ReactDOM.render(<App projectId={project.id} projectName={project.name} />, document.getElementById("root"));
  SDK.resize();
}
main();
