import * as React from "react";
import * as ReactDOM from "react-dom";
import * as SDK from "azure-devops-extension-sdk";
import "../shared/styles.css";
import "./hub.css";
import { emptyConfig, ProjectConfig } from "../core/types";
import { FieldInfo, getProject, init, listFields, listWorkItemTypes, loadConfig, saveConfig } from "../shared/ado";
import { CalculationsTab } from "./CalculationsTab";
import { CapacityTab } from "./CapacityTab";
import { CascadesTab } from "./CascadesTab";
import { GridsTab } from "./GridsTab";
import { MappingsTab } from "./MappingsTab";
import { RulesTab } from "./RulesTab";
import { Ctx } from "./ui";
import { makeCatalog, validateProject } from "./validate";

type Tab = "rules" | "cascades" | "grids" | "mappings" | "calcs" | "capacity" | "json";

function JsonTab(p: { config: ProjectConfig; onApply(c: ProjectConfig): void }) {
  const [text, setText] = React.useState(() => JSON.stringify(p.config, null, 2));
  const [err, setErr] = React.useState("");
  const apply = () => {
    try {
      const c = JSON.parse(text);
      if (typeof c !== "object" || !c) throw new Error("Root must be an object");
      if (c.rules && !Array.isArray(c.rules)) throw new Error("'rules' must be an array");
      if (c.cascades && !Array.isArray(c.cascades)) throw new Error("'cascades' must be an array");
      if (c.lookups && (typeof c.lookups !== "object" || Array.isArray(c.lookups))) throw new Error("'lookups' must be an object");
      if (c.calculations && !Array.isArray(c.calculations)) throw new Error("'calculations' must be an array");
      for (const k of c.calculations ?? []) if (!k.formula || !Array.isArray(k.inputs)) throw new Error(`Calculation '${k.name ?? "?"}' needs 'formula' and 'inputs'`);
      if (c.grids && (typeof c.grids !== "object" || Array.isArray(c.grids))) throw new Error("'grids' must be an object");
      for (const r of c.rules ?? []) if (!r.when || !Array.isArray(r.when.conditions) || !Array.isArray(r.then)) throw new Error(`Rule '${r.name ?? "?"}' needs 'when.conditions' and 'then'`);
      for (const [n, g] of Object.entries<{ columns?: unknown }>(c.grids ?? {})) if (!Array.isArray(g.columns)) throw new Error(`Grid '${n}' needs a 'columns' array`);
      p.onApply({ ...emptyConfig(), ...c, version: 1 }); setErr("");
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <div>
      <div className="help">Advanced: edit the whole configuration as JSON. Changes apply to the visual editors when you press Apply; remember to Save.</div>
      <textarea style={{ width: "100%", minHeight: 420 }} spellCheck={false} value={text} onChange={e => setText(e.target.value)} />
      <div className="toolbar"><button className="btn primary" onClick={apply}>Apply</button>
        <button className="btn" onClick={() => setText(JSON.stringify(p.config, null, 2))}>Reset from editors</button><span className="err">{err}</span></div>
    </div>
  );
}

function Hub(props: { projectId: string; projectName: string }) {
  const [config, setConfig] = React.useState<ProjectConfig>();
  const [saved, setSaved] = React.useState("");
  const [tab, setTab] = React.useState<Tab>("rules");
  const [types, setTypes] = React.useState<string[]>([]);
  const [fields, setFields] = React.useState<FieldInfo[]>([]);
  const [byType, setByType] = React.useState<Record<string, FieldInfo[]>>({});
  const [msg, setMsg] = React.useState("");
  const [loadErrors, setLoadErrors] = React.useState<string[]>([]);
  const [attempt, setAttempt] = React.useState(0);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setLoadErrors([]);
    const fail = (e: Error) => setLoadErrors(list => (list.includes(e.message) ? list : [...list, e.message]));
    loadConfig(props.projectId).then(c => { setConfig(c); setSaved(JSON.stringify(c)); }).catch(e => setMsg("Could not load configuration: " + e.message));
    listWorkItemTypes(props.projectName).then(setTypes).catch(fail);
    listFields(props.projectName).then(setFields).catch(fail);
  }, [props.projectId, props.projectName, attempt]);

  // load real per-type fields (incl. allowed values) for every type the config refers to
  const usedTypes = React.useMemo(() => {
    const s = new Set<string>();
    config?.rules.forEach(r => r.workItemTypes.forEach(t => s.add(t)));
    config?.cascades.forEach(c => c.workItemTypes.forEach(t => s.add(t)));
    config?.calculations?.forEach(c => c.workItemTypes.forEach(t => s.add(t)));
    Object.values(config?.grids ?? {}).forEach(g => g.child?.workItemType && s.add(g.child.workItemType));
    return Array.from(s).filter(t => types.includes(t)).sort();
  }, [config, types]);
  React.useEffect(() => {
    usedTypes.filter(t => !byType[t]).forEach(t => listFields(props.projectName, t).then(f => setByType(b => ({ ...b, [t]: f }))).catch(() => setByType(b => ({ ...b, [t]: [] }))));
  }, [usedTypes, byType, props.projectName]);

  // fields shown in pickers: merge allowed values from per-type loads so dropdown values are suggested
  const pickerFields = React.useMemo(() => {
    const m = new Map(fields.map(f => [f.referenceName, f]));
    for (const list of Object.values(byType)) for (const f of list) {
      const cur = m.get(f.referenceName);
      if (cur && f.allowedValues) m.set(f.referenceName, { ...cur, allowedValues: Array.from(new Set([...(cur.allowedValues ?? []), ...f.allowedValues])) });
    }
    return Array.from(m.values());
  }, [fields, byType]);

  const issues = React.useMemo(() => config ? validateProject(config, makeCatalog(pickerFields, types, byType)) : [], [config, pickerFields, types, byType]);
  const errors = issues.filter(i => i.level === "error"), warns = issues.filter(i => i.level === "warn");
  const dirty = !!config && JSON.stringify(config) !== saved;

  React.useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  if (!config) return <div className="hub">{msg || "Loading…"}</div>;

  const save = async () => {
    setSaving(true);
    try { await saveConfig(props.projectId, config); setSaved(JSON.stringify(config)); setMsg("Saved. Open work items pick up changes on next load."); }
    catch (e) { setMsg("Save failed: " + (e as Error).message); } finally { setSaving(false); }
  };

  return (
    <Ctx.Provider value={{ projectName: props.projectName, types, fields: pickerFields, loadError: loadErrors[0], lookups: config.lookups ?? {}, setLookups: lookups => setConfig({ ...config, lookups }) }}>
      <div className="hub">
        <h2>Grid &amp; Rules</h2>
        <div className="muted">Project “{props.projectName}” · conditional rules, dependent dropdowns and smart grids</div>
        <div className="savebar">
          <button className="btn primary" disabled={!dirty || saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
          <button className="btn" disabled={!dirty} onClick={() => setConfig(JSON.parse(saved))}>Discard</button>
          <span className={errors.length ? "err" : warns.length ? "muted" : "ok"}>
            {errors.length ? `${errors.length} error(s)` : "No errors"}{warns.length ? ` · ${warns.length} warning(s)` : ""}
          </span>
          {dirty && <span className="badge">unsaved</span>}
          <span className="spacer" style={{ flex: 1 }} /><span className="muted">{msg}</span>
        </div>
        {loadErrors.length > 0 && (
          <div className="err" style={{ border: "1px solid var(--err)", padding: "6px 10px", margin: "8px 0" }}>
            <strong>Could not read your process from Azure DevOps.</strong> Field suggestions, work item type choices and live checks need it.
            <ul style={{ margin: "4px 0 4px 18px" }}>{loadErrors.map(e => <li key={e}>{e}</li>)}</ul>
            <button className="btn" onClick={() => setAttempt(a => a + 1)}>Retry</button>
          </div>
        )}
        <div className="tabs">
          {([["rules", `Rules (${config.rules.length})`], ["cascades", `Dependent dropdowns (${config.cascades.length})`], ["grids", `Grids (${Object.keys(config.grids).length})`], ["mappings", `Mappings (${Object.keys(config.lookups ?? {}).length})`], ["calcs", `Calculations (${(config.calculations ?? []).length})`], ["capacity", "Capacity"], ["json", "JSON"]] as [Tab, string][])
            .map(([t, l]) => <button key={t} className={"tab" + (tab === t ? " on" : "")} onClick={() => setTab(t)}>{l}</button>)}
        </div>
        {tab === "rules" && <RulesTab rules={config.rules} issues={issues} onChange={rules => setConfig({ ...config, rules })} />}
        {tab === "cascades" && <CascadesTab cascades={config.cascades} issues={issues} onChange={cascades => setConfig({ ...config, cascades })} />}
        {tab === "grids" && <GridsTab grids={config.grids} issues={issues} onChange={grids => setConfig({ ...config, grids })} />}
        {tab === "mappings" && <MappingsTab config={config} issues={issues} onChange={(lookups, grids) => setConfig({ ...config, lookups, ...(grids ? { grids } : {}) })} />}
        {tab === "calcs" && <CalculationsTab calcs={config.calculations ?? []} grids={config.grids} issues={issues} onChange={calculations => setConfig({ ...config, calculations })} />}
        {tab === "capacity" && <CapacityTab projectId={props.projectId} />}
        {tab === "json" && <JsonTab key={saved + JSON.stringify(config).length} config={config} onApply={setConfig} />}
        {issues.length > 0 && (
          <>
            <h3>Validation against your process fields</h3>
            <div className="issues">{issues.map((x, i) => <div key={i} className={"issue " + x.level}><b>{x.where}:</b> {x.message}</div>)}</div>
          </>
        )}
      </div>
    </Ctx.Provider>
  );
}

async function main() {
  await init(true);
  const project = await getProject();
  ReactDOM.render(<Hub projectId={project.id} projectName={project.name} />, document.getElementById("root"));
  SDK.resize();
}
main();
