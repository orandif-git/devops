import * as React from "react";
import * as ReactDOM from "react-dom";
import * as SDK from "azure-devops-extension-sdk";
import "../shared/styles.css";
import "./hub.css";
import { emptyConfig, ProjectConfig } from "../core/types";
import { normalizeProject } from "../core/normalize";
import { FieldInfo, getProject, init, listFields, listWorkItemTypes } from "../shared/ado";
import { ConfigConflictError, loadConfigDoc, saveConfig } from "../shared/configStore";
import { CalculationsTab } from "./CalculationsTab";
import { CapacityTab } from "./CapacityTab";
import { CascadesTab } from "./CascadesTab";
import { GridsTab } from "./GridsTab";
import { MappingsTab } from "./MappingsTab";
import { ReadOnlyTab } from "./ReadOnlyTab";
import { RulesTab } from "./RulesTab";
import { Ctx } from "./ui";
import { writtenFields } from "../core/written";
import { makeCatalog, validateProject } from "./validate";
import { issueTarget, nextStep, Tab, TAB_INTRO } from "./sections";
import { AuditTab } from "./AuditTab";
import { CommentOnlyTab } from "./CommentOnlyTab";
import { BackupTab } from "./BackupTab";
import { DiagnosticsTab } from "./DiagnosticsTab";
import { SecurityTab } from "./SecurityTab";
import { useReason } from "./ReasonDialog";
import { projectAdminStatus } from "../shared/presetAccess";
import { appendAudit } from "../shared/auditStore";
import { diffSettings } from "../core/audit";


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
      p.onApply(normalizeProject({ ...emptyConfig(), ...c, version: 1 })); setErr("");
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
  const [tab, setTab] = React.useState<Tab>("grids");
  const [focus, setFocus] = React.useState<{ n: number; grid?: string; section?: string; create?: boolean }>({ n: 0 });
  const [focusDone, setFocusDone] = React.useState(0);
  const [types, setTypes] = React.useState<string[]>([]);
  const [fields, setFields] = React.useState<FieldInfo[]>([]);
  const [byType, setByType] = React.useState<Record<string, FieldInfo[]>>({});
  const [msg, setMsg] = React.useState("");
  const [loadErrors, setLoadErrors] = React.useState<string[]>([]);
  const [attempt, setAttempt] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const etagRef = React.useRef(-1);                         // the version of the settings this page was opened at
  const [conflict, setConflict] = React.useState(false);
  const [admin, setAdmin] = React.useState<"yes" | "no" | "unknown">();
  const { ask, dialog } = useReason();
  React.useEffect(() => { projectAdminStatus(props.projectId).then(setAdmin); }, [props.projectId]);

  React.useEffect(() => {
    setLoadErrors([]);
    const fail = (e: Error) => setLoadErrors(list => (list.includes(e.message) ? list : [...list, e.message]));
    loadConfigDoc(props.projectId).then(d => { setConfig(d.config); setSaved(JSON.stringify(d.config)); etagRef.current = d.etag; setConflict(false); }).catch(e => setMsg("Could not load configuration: " + e.message));
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

  if (admin === "no") return <div className="hub"><h2>Grid &amp; Rules</h2><div className="help" role="alert">Only project administrators can open these settings. Ask a project administrator of “{props.projectName}” to make the change.</div></div>;
  if (!config || !admin) return <div className="hub">{msg || "Loading…"}</div>;

  const save = async (overwrite = false) => {
    setSaving(true);
    try {
      // presets may have been saved from work items since this page was opened: keep those unless this page changed the grid's presets
      const base = JSON.parse(saved) as ProjectConfig;
      let out = config;
      let useEtag: number | undefined = overwrite ? undefined : etagRef.current;
      try {
        const latest = await loadConfigDoc(props.projectId);
        const withoutPresets = (c: ProjectConfig) => JSON.stringify({ ...c, grids: Object.fromEntries(Object.entries(c.grids).map(([n, g]) => [n, { ...g, presets: undefined }])) });
        if (!overwrite && latest.etag !== etagRef.current) {
          // somebody saved since this page was opened: only a changed preset (saved from a work item) can be merged automatically
          if (withoutPresets(latest.config) !== withoutPresets(base)) { setConflict(true); setMsg("Not saved: the settings were changed by someone else."); return; }
          useEtag = latest.etag;
        }
        out = { ...config, grids: Object.fromEntries(Object.entries(config.grids).map(([n, g]) => {
          const untouched = JSON.stringify(g.presets ?? null) === JSON.stringify(base.grids[n]?.presets ?? null);
          const theirs = latest.config.grids[n]?.presets;
          return [n, untouched && theirs ? { ...g, presets: theirs } : g];
        })) };
      } catch { /* could not re-read: save what is on screen (a clash is still detected when saving) */ }
      const diff = diffSettings(base, out);
      const why = diff.changes.length ? await ask("Why are you changing the settings?", `${diff.changes.length + diff.omitted} value(s) will change. Examples: ${diff.changes.slice(0, 3).map(c => c.path).join(", ")}${diff.changes.length > 3 ? "…" : ""}`) : { reason: "", comment: "" };
      if (!why) { setMsg("Not saved: a reason is required."); return; }
      etagRef.current = await saveConfig(props.projectId, out, useEtag); setConfig(out); setSaved(JSON.stringify(out)); setConflict(false);
      try { if (diff.changes.length) await appendAudit(props.projectId, { area: "configuration", reason: why.reason + (overwrite ? " (overwrote changes saved by someone else)" : ""), comment: why.comment, before: base, after: out }); setMsg("Saved. Open work items pick up changes on next load."); }
      catch (e) { setMsg("Saved, but the audit log entry could not be written: " + (e as Error).message); }
    }
    catch (e) {
      if (e instanceof ConfigConflictError) { setConflict(true); setMsg("Not saved: the settings were changed by someone else."); }
      else setMsg("Save failed: " + (e as Error).message);
    } finally { setSaving(false); }
  };

  return (
    <Ctx.Provider value={{ projectName: props.projectName, types, fields: pickerFields, loadError: loadErrors[0], lookups: config.lookups ?? {}, setLookups: lookups => setConfig({ ...config, lookups }) }}>
      <div className="hub">
        {dialog}
        {admin === "unknown" && <div className="help" role="status">Your permissions could not be checked, so the settings are shown. Only project administrators should change them.</div>}
        <h2>Grid &amp; Rules</h2>
        <div className="muted">Project “{props.projectName}” · conditional rules, dependent dropdowns and smart grids</div>
        <div className="savebar">
          <button className="btn primary" disabled={!dirty || saving} onClick={() => save()}>{saving ? "Saving…" : "Save"}</button>
          <button className="btn" disabled={!dirty} onClick={() => setConfig(JSON.parse(saved))}>Discard</button>
          <span className={errors.length ? "err" : warns.length ? "muted" : "ok"}>
            {errors.length ? `${errors.length} error(s)` : "No errors"}{warns.length ? ` · ${warns.length} warning(s)` : ""}
          </span>
          {dirty && <span className="badge">unsaved</span>}
          <span className="spacer" style={{ flex: 1 }} /><span className={/audit|failed|Not saved/i.test(msg) ? "err" : "muted"} role="status">{msg}</span>
        </div>
        {conflict && (
          <div className="err" role="alert" style={{ border: "1px solid var(--err)", padding: "6px 10px", margin: "8px 0" }}>
            <strong>Someone else saved the settings while you were editing.</strong> Saving now would replace their changes.
            <div className="toolbar">
              <button className="btn" onClick={() => setAttempt(n => n + 1)}>Load their version (discards my unsaved changes)</button>
              <button className="btn danger" onClick={() => save(true)}>Overwrite with my version</button>
            </div>
          </div>
        )}
        {loadErrors.length > 0 && (
          <div className="err" style={{ border: "1px solid var(--err)", padding: "6px 10px", margin: "8px 0" }}>
            <strong>Could not read your process from Azure DevOps.</strong> Field suggestions, work item type choices and live checks need it.
            <ul style={{ margin: "4px 0 4px 18px" }}>{loadErrors.map(e => <li key={e}>{e}</li>)}</ul>
            <button className="btn" onClick={() => setAttempt(a => a + 1)}>Retry</button>
          </div>
        )}
        {(() => {
          const ns = nextStep(config, issues, dirty);
          const go = (a: NonNullable<typeof ns.action>) => { setTab(a.tab); setFocus(f => ({ n: f.n + 1, grid: a.grid, section: a.section, create: a.create })); };
          return (
            <div className={"nextbar " + ns.kind} role="status">
              <div className="t"><div className="k">{ns.kind === "done" ? "All good" : "Next step"}</div><b>{ns.text}</b>{ns.detail && <div className="muted">{ns.detail}</div>}</div>
              {ns.action && <button className="btn primary" onClick={() => go(ns.action!)}>{ns.action.label}</button>}
            </div>
          );
        })()}
        <div className="tabs" role="tablist">
          {([["grids", `Grids (${Object.keys(config.grids).length})`], ["calcs", `Calculations (${(config.calculations ?? []).length})`], ["capacity", "Capacity"], ["rules", `Rules (${config.rules.length})`], ["cascades", `Dependent dropdowns (${config.cascades.length})`], ["mappings", `Mappings (${Object.keys(config.lookups ?? {}).length})`], ["readonly", `Read-only fields (${writtenFields(config).length})`], ["controls", `Controls${(config.controls ?? []).some(r => r.enabled) ? ` (${(config.controls ?? []).filter(r => r.enabled).length} on)` : ""}`], ["backup", "Backup & restore"], ["audit", "Audit log"], ["security", "Security"], ["diagnostics", "Diagnostics"], ["json", "JSON"]] as [Tab, string][])
            .map(([t, l]) => {
              const m = /^(.*?)\s*\((.+)\)$/.exec(l);             // "Grids (2)" → name + small count badge
              return <button key={t} role="tab" aria-selected={tab === t} className={"tab" + (tab === t ? " on" : "")} onClick={() => setTab(t)}>{m ? m[1] : l}{m && <span className="tc">{m[2]}</span>}</button>;
            })}
        </div>
        <div className="tabintro">{TAB_INTRO[tab]}</div>
        {tab === "rules" && <RulesTab rules={config.rules} issues={issues} onChange={rules => setConfig({ ...config, rules })} />}
        {tab === "cascades" && <CascadesTab cascades={config.cascades} issues={issues} onChange={cascades => setConfig({ ...config, cascades })} />}
        {tab === "grids" && <GridsTab focus={focus.n !== focusDone ? focus : undefined} onFocusHandled={setFocusDone} grids={config.grids} issues={issues} onChange={grids => setConfig({ ...config, grids })} />}
        {tab === "mappings" && <MappingsTab config={config} issues={issues} onChange={(lookups, grids) => setConfig({ ...config, lookups, ...(grids ? { grids } : {}) })} />}
        {tab === "calcs" && <CalculationsTab calcs={config.calculations ?? []} grids={config.grids} onUseDataField={(grid, field) => setConfig({ ...config, grids: { ...config.grids, [grid]: { ...config.grids[grid], dataField: field } } })} issues={issues} onChange={calculations => setConfig({ ...config, calculations })} />}
        {tab === "readonly" && <ReadOnlyTab config={config} />}
        {tab === "capacity" && <CapacityTab projectId={props.projectId} />}
        {tab === "controls" && <CommentOnlyTab value={config.controls} onChange={controls => setConfig({ ...config, controls })} />}
        {tab === "backup" && <BackupTab projectId={props.projectId} projectName={props.projectName} dirty={dirty} onRestored={() => setAttempt(a => a + 1)} />}
        {tab === "security" && <SecurityTab />}
        {tab === "diagnostics" && <DiagnosticsTab />}
        {tab === "audit" && <AuditTab projectId={props.projectId} version={saved} />}
        {tab === "json" && <JsonTab key={saved + JSON.stringify(config).length} config={config} onApply={setConfig} />}
        {issues.length > 0 && (
          <>
            <h3>Checks against your process</h3>
            <div className="issues">{issues.map((x, i) => { const t = issueTarget(x); return <div key={i} className={"issue " + x.level}><b>{x.where}:</b> {x.message}{t && <button className="btn go" onClick={() => { setTab(t.tab); setFocus(f => ({ n: f.n + 1, grid: t.grid, section: t.section })); window.scrollTo(0, 0); }}>Go to it</button>}</div>; })}</div>
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
