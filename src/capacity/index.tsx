import * as React from "react";
import * as ReactDOM from "react-dom";
import * as SDK from "azure-devops-extension-sdk";
import "../shared/styles.css";
import "./capacity.css";
import { getProject, init } from "../shared/ado";
import { checkCanEdit, deleteRecord, listRecords, loadSettings, saveRecord } from "../shared/capacityStore";
import { CapacityEditor } from "./CapacityEditor";
import { Overview } from "./Overview";
import { loadLiveAllocations } from "../shared/allocationStore";
import { loadRegister } from "../shared/capacityStore";
import { listRecords as listCapacityRecords } from "../shared/capacityStore";

function Page(p: { projectId: string; projectName: string }) {
  const [tab, setTab] = React.useState<"register" | "overview">("register");
  const [access, setAccess] = React.useState<{ canEdit: boolean; reason: string }>();
  const api = React.useMemo(() => ({
    list: () => listRecords(p.projectId), save: (r: Parameters<typeof saveRecord>[1]) => saveRecord(p.projectId, r), remove: (k: string) => deleteRecord(p.projectId, k),
  }), [p.projectId]);
  const load = React.useCallback(async () => {
    const [records, register, live] = await Promise.all([listCapacityRecords(p.projectId), loadRegister(p.projectId), loadLiveAllocations(p.projectId)]);
    return { records, register, docs: live.docs };
  }, [p.projectId]);
  React.useEffect(() => { loadSettings(p.projectId).then(s => checkCanEdit(p.projectId, s)).then(setAccess).catch(e => setAccess({ canEdit: false, reason: "Could not check permissions: " + e.message })); }, [p.projectId]);
  return (
    <div style={{ padding: "12px 20px 40px", maxWidth: 1400 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>Capacity</h2>
      <div className="muted" style={{ marginBottom: 8 }}>Available hours per person and month for project “{p.projectName}” – entered once, used by every Epic.</div>
      <div className="capacity"><div className="subtabs">
        <button className={"subtab" + (tab === "register" ? " on" : "")} onClick={() => setTab("register")}>Capacity register</button>
        <button className={"subtab" + (tab === "overview" ? " on" : "")} onClick={() => setTab("overview")}>Utilization overview (all Epics)</button>
      </div></div>
      {tab === "overview" ? <Overview load={load} />
        : access ? <CapacityEditor api={api} canEdit={access.canEdit} reason={access.reason} actor={SDK.getUser().displayName} projectId={p.projectId} /> : <div className="muted">Checking permissions…</div>}
    </div>
  );
}

async function main() {
  await init(true);
  const project = await getProject();
  ReactDOM.render(<Page projectId={project.id} projectName={project.name} />, document.getElementById("root"));
}
main();
