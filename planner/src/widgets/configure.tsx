import * as React from "react";
import * as ReactDOM from "react-dom";
import * as SDK from "azure-devops-extension-sdk";
import { IWidgetConfiguration, IWidgetConfigurationContext, WidgetSettings } from "azure-devops-extension-api/Dashboard";
import { ConfigurationEvent } from "azure-devops-extension-api/Dashboard/WidgetConfigHelpers";
import { WidgetConfigurationSave, WidgetStatusHelper } from "azure-devops-extension-api/Dashboard/WidgetHelpers";
import "../../../src/shared/styles.css";
import "../hub/planner.css";
import "./widgets.css";
import { getProject } from "../../../src/shared/ado";
import { defaultWidgetConfig, parseWidgetConfig, WidgetConfig } from "../core/widgets";
import { loadSettings } from "../data/settingsStore";
import { listSavedQueries, SavedQuery } from "../data/queries";

function Form(p: { initial: WidgetConfig; teams: string[]; queries: SavedQuery[]; onChange: (c: WidgetConfig) => void }) {
  const [c, setC] = React.useState(p.initial);
  const set = (patch: Partial<WidgetConfig>) => { const n = { ...c, ...patch }; setC(n); p.onChange(n); };
  const custom = !["current", "next"].includes(c.month);
  return (
    <div style={{ padding: 8, display: "grid", gap: 10 }}>
      <label className="field"><span>Month</span>
        <select value={custom ? "custom" : c.month} onChange={e => set({ month: e.target.value === "custom" ? new Date().toISOString().slice(0, 7) : e.target.value })}>
          <option value="current">Current month</option><option value="next">Next month</option><option value="custom">A fixed month…</option>
        </select></label>
      {custom && <label className="field"><span>Fixed month</span><input type="month" value={c.month} onChange={e => /^\d{4}-\d{2}$/.test(e.target.value) && set({ month: e.target.value })} /></label>}
      <label className="field"><span>Team</span>
        <select value={c.team} onChange={e => set({ team: e.target.value })}><option value="">All teams</option>{p.teams.map(t => <option key={t}>{t}</option>)}</select></label>
      <label className="field"><span>Epics (saved query)</span>
        <select value={c.queryId} onChange={e => set({ queryId: e.target.value })}><option value="">All Epics</option>{p.queries.map(q => <option key={q.id} value={q.id}>{q.path}</option>)}</select></label>
      <label className="field"><span>Rows in the over-capacity list</span>
        <input type="number" min={1} max={50} value={c.top} onChange={e => set({ top: Math.max(1, Math.min(50, Math.floor(+e.target.value) || 10)) })} /></label>
    </div>
  );
}

export async function startConfiguration() {
  await SDK.init({ loaded: false, applyTheme: true });
  let current = defaultWidgetConfig();
  const config: IWidgetConfiguration = {
    async load(s: WidgetSettings, ctx: IWidgetConfigurationContext) {
      try {
        current = parseWidgetConfig(s.customSettings?.data);
        const project = await getProject();
        const [{ settings }, queries] = await Promise.all([loadSettings(project.id), listSavedQueries(project.name).catch(() => [] as SavedQuery[])]);
        const notify = (c: WidgetConfig) => { current = c; void ctx.notify(ConfigurationEvent.ConfigurationChange, ConfigurationEvent.Args({ data: JSON.stringify(c) })); };
        ReactDOM.render(<Form initial={current} teams={settings.capacityTeams.map(t => t.name)} queries={queries} onChange={notify} />, document.getElementById("root"));
        return WidgetStatusHelper.Success();
      } catch (e) { return WidgetStatusHelper.Failure((e as Error).message); }
    },
    onSave: () => WidgetConfigurationSave.Valid({ data: JSON.stringify(current) }),
  };
  SDK.register(SDK.getContributionId(), () => config);
  await SDK.notifyLoadSucceeded();
}
