import * as React from "react";
import { validateExec } from "../core/settings";
import { PlannerSettings } from "../core/types";
import { LoadProgress } from "../data/epics";
import { Loaded } from "../data/loadAll";
import { SavedQuery } from "../data/queries";
import { ago } from "./ago";
import { ExecDashboard } from "./ExecDashboard";

const AUTO_REFRESH_MS = 10 * 60 * 1000;

/** The Executive Dashboard page: a live header, the set-up check, a refresh that also runs by itself, and the dashboard. */
export function ExecPage(p: {
  project: { id: string; name: string }; settings: PlannerSettings; loaded?: Loaded; busy: boolean; progress?: LoadProgress; error: string;
  queries: SavedQuery[]; queryId: string; onQuery(id: string): void; onReload(force: boolean): void;
  full?: boolean; onFull?(on: boolean): void; link?: { pv?: string; full: boolean };
}) {
  const problems = validateExec(p.settings);
  // the label re-reads the clock every 30 s; a light refresh (changed Epics only) runs every 10 minutes while this page is open and visible
  const [, tick] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => { const t = window.setInterval(tick, 30000); return () => window.clearInterval(t); }, []);
  const busyRef = React.useRef(p.busy); busyRef.current = p.busy;
  const reloadRef = React.useRef(p.onReload); reloadRef.current = p.onReload;
  React.useEffect(() => {
    if (problems.length) return;
    const t = window.setInterval(() => { if (!document.hidden && !busyRef.current) reloadRef.current(false); }, AUTO_REFRESH_MS);
    return () => window.clearInterval(t);
  }, [problems.length]);
  const L = p.loaded;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>Executive Dashboard</h3>
        {L ? <span className="muted" title={`Read from Azure DevOps at ${new Date(L.at).toLocaleString()} · ${L.epics.length} Epics in ${(L.load.ms / 1000).toFixed(1)} s. Refreshes by itself every 10 minutes.`}>
          <span style={{ color: p.busy ? "#fab219" : "#0ca30c" }} aria-hidden="true">●</span> {p.busy ? "Refreshing…" : "Live"} · refreshed {ago(Date.parse(L.at))}</span>
          : <span className="muted">Epics, status and go-live risk at a glance. Read-only.</span>}
      </div>
      {problems.length ? <div className="card" style={{ marginTop: 12 }}><b>The Executive Dashboard is not set up yet.</b><ul className="err">{problems.map(e => <li key={e}>{e}</li>)}</ul>
        <div className="muted">A project administrator sets this up under Settings › Executive dashboard.</div></div>
        : <ExecDashboard {...p} />}
    </div>
  );
}
