import * as React from "react";
import * as ReactDOM from "react-dom";
import * as SDK from "azure-devops-extension-sdk";
import "../../../src/shared/styles.css";
import "../hub/planner.css";
import { getProject, init } from "../../../src/shared/ado";
import { validateSettings } from "../core/settings";
import { PlannerSettings } from "../core/types";
import { LoadProgress } from "../data/epics";
import { Loaded, loadAll } from "../data/loadAll";
import { listSavedQueries, SavedQuery } from "../data/queries";
import { loadSettings } from "../data/settingsStore";
import { Access, checkAccess, execAccessTeams, NO_EXEC_ACCESS } from "../data/access";
import { ExecPage } from "./ExecPage";
import { readLink, setHostFullScreen } from "../data/share";

/** The Executive Dashboard board: its own page under Boards, read-only, shown only when it is switched on in the Resource Planner settings. */
function App(p: { projectId: string; projectName: string }) {
  const [settings, setSettings] = React.useState<PlannerSettings>();
  const [access, setAccess] = React.useState<Access>();
  const [loaded, setLoaded] = React.useState<Loaded>();
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState<LoadProgress>();
  const [error, setError] = React.useState("");
  const [queries, setQueries] = React.useState<SavedQuery[]>([]);
  const [queryId, setQueryId] = React.useState("");
  const [msg, setMsg] = React.useState("");
  const [full, setFull] = React.useState(false);
  const [link, setLink] = React.useState<{ pv?: string; full: boolean }>();
  React.useEffect(() => { readLink().then(setLink); }, []);
  const goFull = React.useCallback((on: boolean) => { setFull(on); void setHostFullScreen(on); }, []);

  React.useEffect(() => { loadSettings(p.projectId).then(r => { setSettings(r.settings); checkAccess(p.projectId, execAccessTeams(r.settings)).then(setAccess); }).catch(e => setMsg("Could not load the settings: " + e.message)); }, [p.projectId]);
  React.useEffect(() => { listSavedQueries(p.projectName).then(setQueries).catch(() => undefined); }, [p.projectName]);
  const on = !!settings?.executive.enabled, valid = !!settings && !validateSettings(settings).length;
  const reload = React.useCallback(async (force: boolean, qid = queryId) => {
    if (!settings) return;
    setBusy(true); setError("");
    try { setLoaded(await loadAll({ id: p.projectId, name: p.projectName }, settings, { queryId: qid || undefined, force, progress: setProgress })); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); setProgress(undefined); }
  }, [settings, queryId, p.projectId, p.projectName]);
  React.useEffect(() => { if (on && valid && access?.mayOpen && !loaded && !busy && !error) void reload(false); }, [on, valid, access]);   // eslint-disable-line react-hooks/exhaustive-deps

  const head = <><h2 style={{ margin: 0 }}>Executive Dashboard</h2><div className="muted" style={{ marginBottom: 12 }}>Read-only: every Epic with its status, reasons and forecast. Nothing is edited from here.</div></>;
  const box = (body: React.ReactNode, bare = false) => <div style={{ padding: bare ? "8px 12px" : "16px 22px" }}>{!bare && head}{body}</div>;
  if (!settings) return box(<div className="muted">{msg || "Loading…"}</div>);
  if (!access) return box(<div className="muted">Checking access…</div>);
  if (!access.mayOpen) return box(<div className="err" role="alert">{NO_EXEC_ACCESS}</div>);
  if (!on) return box(<div className="card" role="status">The Executive Dashboard is not enabled for this project. A project administrator can switch it on in <b>Resource Planner › Settings › Executive dashboard</b>.</div>);
  if (!valid) return box(<div className="err">Complete the Resource Planner settings first (Boards › Resource Planner › Settings).</div>);
  if (!link) return box(<div className="muted">Loading…</div>);
  return box(<ExecPage project={{ id: p.projectId, name: p.projectName }} settings={settings} loaded={loaded} busy={busy} progress={progress} error={error} queries={queries}
    queryId={queryId} onQuery={q => { setQueryId(q); void reload(false, q); }} onReload={f => void reload(f)} full={full} onFull={goFull} link={link} />, true);
}

async function main() {
  await init(true);
  const project = await getProject();
  ReactDOM.render(<App projectId={project.id} projectName={project.name} />, document.getElementById("root"));
  SDK.resize();
}
main();
