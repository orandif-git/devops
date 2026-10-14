import * as React from "react";
import * as ReactDOM from "react-dom";
import "../../../src/shared/styles.css";
import "../hub/planner.css";
import "./exec.css";
import { getProject, init } from "../../../src/shared/ado";
import { validateExec } from "../core/settings";
import { PlannerSettings } from "../core/types";
import { LoadProgress } from "../data/epics";
import { Loaded, loadAll } from "../data/loadAll";
import { listSavedQueries, SavedQuery } from "../data/queries";
import { loadSettings } from "../data/settingsStore";
import { ExecDashboard } from "./ExecDashboard";

function App(p: { projectId: string; projectName: string }) {
  const [settings, setSettings] = React.useState<PlannerSettings>();
  const [loaded, setLoaded] = React.useState<Loaded>();
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<LoadProgress>();
  const [error, setError] = React.useState("");
  const [queries, setQueries] = React.useState<SavedQuery[]>([]);
  const [queryId, setQueryId] = React.useState("");
  const reload = React.useCallback(async (force: boolean, qid = queryId, s = settings) => {
    if (!s) return;
    setBusy(true); setError("");
    try { setLoaded(await loadAll({ id: p.projectId, name: p.projectName }, s, { queryId: qid || undefined, force, progress: setProgress })); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); setProgress(undefined); }
  }, [settings, queryId, p.projectId, p.projectName]);
  React.useEffect(() => { loadSettings(p.projectId).then(r => { setSettings(r.settings); if (!validateExec(r.settings).length) void reload(false, "", r.settings); }).catch(e => setError("Could not load the settings: " + e.message)); }, [p.projectId]);   // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { listSavedQueries(p.projectName).then(setQueries).catch(() => undefined); }, [p.projectName]);
  const problems = settings ? validateExec(settings) : [];
  return (
    <div style={{ padding: "16px 22px", maxWidth: 1500 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Executive Dashboard</h2>
        <span className="muted">{loaded ? `As of ${new Date(loaded.at).toLocaleString()} · ${loaded.epics.length} Epics read in ${(loaded.load.ms / 1000).toFixed(1)} s` : "Epics, status and go-live risk at a glance. Read-only."}</span>
      </div>
      {!settings ? <div className="muted" style={{ marginTop: 12 }}>{error || "Loading…"}</div>
        : problems.length ? <div className="card" style={{ marginTop: 12 }}><b>The Executive Dashboard is not set up yet.</b><ul className="err">{problems.map(e => <li key={e}>{e}</li>)}</ul>
          <div className="muted">A planner administrator sets this up under Boards › Resource Planner › Settings › Executive dashboard.</div></div>
        : <ExecDashboard project={{ id: p.projectId, name: p.projectName }} settings={settings} loaded={loaded} busy={busy} progress={progress} error={error} onReload={f => void reload(f)}
            toolbar={<>
              <select aria-label="Epics from" value={queryId} onChange={e => { setQueryId(e.target.value); void reload(false, e.target.value); }}><option value="">All {settings.workItemType}s</option>{queries.map(q => <option key={q.id} value={q.id}>Query: {q.path}</option>)}</select>
              <button className="btn" disabled={busy} onClick={() => void reload(false)}>{busy ? "Refreshing…" : "⟳ Refresh"}</button></>} />}
    </div>
  );
}

async function main() {
  await init(true);
  const project = await getProject();
  ReactDOM.render(<App projectId={project.id} projectName={project.name} />, document.getElementById("root"));
}
main();
