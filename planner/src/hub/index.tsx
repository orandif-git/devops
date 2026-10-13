import * as React from "react";
import * as ReactDOM from "react-dom";
import * as SDK from "azure-devops-extension-sdk";
import "../../../src/shared/styles.css";
import "./planner.css";
import { getProject, init } from "../../../src/shared/ado";
import { restGet, restPost } from "../rest";
import { DataTab } from "./DataTab";
import { SettingsTab } from "./SettingsTab";
import { validateSettings } from "../core/settings";
import { PlannerSettings } from "../core/types";
import { loadSettings, saveSettings, SettingsConflictError } from "../data/settingsStore";

interface Check { title: string; ok: boolean; detail: string; ms: number }
const run = async (title: string, fn: () => Promise<string>): Promise<Check> => {
  const t0 = Date.now();
  try { return { title, ok: true, detail: await fn(), ms: Date.now() - t0 }; } catch (e) { return { title, ok: false, detail: (e as Error).message, ms: Date.now() - t0 }; }
};

/** Phase 0: an empty page that proves the extension loads on this server and that the read calls the planner will use work. */
function Checks(p: { projectId: string; projectName: string }) {
  const [checks, setChecks] = React.useState<Check[]>([]);
  const [id, setId] = React.useState("");
  const [field, setField] = React.useState("");
  const [probe, setProbe] = React.useState("");
  React.useEffect(() => {
    (async () => {
      const out: Check[] = [];
      out.push(await run("Connection", async () => { const h = SDK.getHost(); return `${h.name ?? "?"} (${h.isHosted ? "Azure DevOps Services" : "Azure DevOps Server"}) · project ${p.projectName} · ${SDK.getUser().displayName}`; }));
      out.push(await run("Read teams", async () => `${(await restGet<{ value: unknown[] }>(`projects/${encodeURIComponent(p.projectId)}/teams`, { $top: 200 })).value.length} team(s)`));
      out.push(await run("Query Epics (WIQL)", async () => {
        const r = await restPost<{ workItems?: { id: number }[] }>("wit/wiql", { query: "SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = 'Epic' AND [System.TeamProject] = @project" }, { project: p.projectName });
        return `${(r.workItems ?? []).length} Epic(s) found`;
      }));
      setChecks(out);
    })();
  }, [p.projectId, p.projectName]);
  const readOne = async () => {
    setProbe("Reading…");
    try {
      const r = await restPost<{ value: { id: number; fields: Record<string, unknown> }[] }>("wit/workitemsbatch", { ids: [Number(id)], fields: ["System.Title", field].filter(Boolean) });
      const w = r.value[0]; const v = field ? w?.fields?.[field] : undefined;
      setProbe(w ? `Epic ${w.id}: “${String(w.fields["System.Title"])}”${field ? ` · field ${field}: ${v === undefined ? "not returned (empty or not on this type)" : `${String(v).length} characters read; starts: ${String(v).slice(0, 80).replace(/\s+/g, " ")}`}` : ""}` : "No such work item.");
    } catch (e) { setProbe("Failed: " + (e as Error).message); }
  };
  return (
    <div>
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

function App(p: { projectId: string; projectName: string }) {
  const [tab, setTab] = React.useState<"data" | "settings" | "checks">("settings");
  const [saved, setSaved] = React.useState<PlannerSettings>();
  const [cur, setCur] = React.useState<PlannerSettings>();
  const etag = React.useRef(-1);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState("");
  React.useEffect(() => { loadSettings(p.projectId).then(r => { setSaved(r.settings); setCur(r.settings); etag.current = r.etag; if (!validateSettings(r.settings).length) setTab("data"); }).catch(e => setMsg("Could not load the settings: " + e.message)); }, [p.projectId]);
  const save = async () => {
    if (!cur) return;
    setBusy(true);
    try { etag.current = await saveSettings(p.projectId, cur, etag.current); setSaved(cur); setMsg("Saved."); }
    catch (e) { setMsg(e instanceof SettingsConflictError ? "Not saved: someone else saved the settings in the meantime. Reload the page to see their version." : "Save failed: " + (e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div style={{ padding: "16px 22px", maxWidth: 1100 }}>
      <h2 style={{ margin: 0 }}>Resource Planner &amp; Heatmap</h2>
      <div className="muted" style={{ marginBottom: 8 }}>Work in progress · phase 1: settings, reading the Epics and adding up the hours. The heatmap, timeline and Gantt come next.</div>
      <div className="tabs" role="tablist" style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--line)", margin: "8px 0 12px" }}>
        {([["data", "Data check"], ["settings", "Settings"], ["checks", "Connection"]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={"tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}
          style={{ background: "none", border: 0, borderBottom: "2px solid " + (tab === k ? "var(--accent)" : "transparent"), padding: "8px 14px", cursor: "pointer", fontWeight: tab === k ? 600 : 400, color: "inherit" }}>{l}</button>)}
      </div>
      {!cur ? <div className="muted">{msg || "Loading…"}</div> : tab === "settings" ? <SettingsTab projectId={p.projectId} projectName={p.projectName} value={cur} saved={saved!} busy={busy} msg={msg} onChange={setCur} onSave={save} onDiscard={() => setCur(saved)} />
        : tab === "data" ? <DataTab project={{ id: p.projectId, name: p.projectName }} settings={saved!} valid={!validateSettings(saved!).length} />
        : <Checks projectId={p.projectId} projectName={p.projectName} />}
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
