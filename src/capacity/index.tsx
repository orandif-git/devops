import * as React from "react";
import * as ReactDOM from "react-dom";
import * as SDK from "azure-devops-extension-sdk";
import "../shared/styles.css";
import "./capacity.css";
import { getProject, init } from "../shared/ado";
import { loadLiveAllocations } from "../shared/allocationStore";
import { checkCanEdit, CapacitySettings, defaultSettings, deleteRecord, loadCapacityRecords, loadRegister, loadSettings, saveRecord } from "../shared/capacityStore";
import { CapacityEditor } from "./CapacityEditor";
import { Overview } from "./Overview";

function Page(p: { projectId: string; projectName: string }) {
  const [tab, setTab] = React.useState<"register" | "overview">("register");
  const [settings, setSettings] = React.useState<CapacitySettings>();
  const [access, setAccess] = React.useState<{ canEdit: boolean; reason: string }>();
  const fromTeams = settings?.source === "teams";

  const api = React.useMemo(() => ({
    list: async () => (await loadCapacityRecords(p.projectId, settings ?? defaultSettings())).records,
    save: (r: Parameters<typeof saveRecord>[1]) => saveRecord(p.projectId, r),
    remove: (k: string) => deleteRecord(p.projectId, k),
  }), [p.projectId, settings]);

  const load = React.useCallback(async () => {
    const [{ records }, register, live] = await Promise.all([loadCapacityRecords(p.projectId), loadRegister(p.projectId), loadLiveAllocations(p.projectId)]);
    return { records, register, docs: live.docs };
  }, [p.projectId]);

  React.useEffect(() => {
    loadSettings(p.projectId).then(async s => { setSettings(s); setAccess(await checkCanEdit(p.projectId, s)); })
      .catch(e => setAccess({ canEdit: false, reason: "Could not check permissions: " + e.message }));
  }, [p.projectId]);

  return (
    <div style={{ padding: "12px 20px 40px", maxWidth: 1400 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>Capacity</h2>
      <div className="muted" style={{ marginBottom: 8 }}>Available hours per person and month for project “{p.projectName}” – maintained once, used by every Epic.</div>
      <div className="capacity"><div className="subtabs">
        <button className={"subtab" + (tab === "register" ? " on" : "")} onClick={() => setTab("register")}>{fromTeams ? "People and capacity" : "Capacity register"}</button>
        <button className={"subtab" + (tab === "overview" ? " on" : "")} onClick={() => setTab("overview")}>Utilization overview (all Epics)</button>
      </div></div>
      {tab === "overview" ? <Overview load={load} />
        : settings && access
          ? <CapacityEditor api={api} canEdit={access.canEdit && !fromTeams} projectId={p.projectId} actor={SDK.getUser().displayName}
              reason={fromTeams ? "Read-only: capacity is kept in Azure DevOps team capacity (Boards → Sprints → Capacity, in the yearly capacity iteration). Change hours per day and days off there." : access.reason} />
          : <div className="muted">Checking permissions…</div>}
    </div>
  );
}

async function main() {
  await init(true);
  const project = await getProject();
  ReactDOM.render(<Page projectId={project.id} projectName={project.name} />, document.getElementById("root"));
}
main();
