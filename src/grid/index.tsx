import * as React from "react";
import * as ReactDOM from "react-dom";
import * as SDK from "azure-devops-extension-sdk";
import "../shared/styles.css";
import "./grid.css";
import { Grid } from "./Grid";
import { DerivedGrid } from "./DerivedGrid";
import { emitFormEvent } from "./formWriter";
import { GridConfig, GridRow, LookupTable } from "../core/types";
import { applySharedLookups } from "../core/sharedLookups";
import { mappedTotals, parseStored, serialize, validateConfig, validateRows } from "../core/gridModel";
import { downloadFile, getFormService, getProject, init, loadConfig, witClient } from "../shared/ado";
import { exportCsv, exportXlsx, importFile } from "../shared/excel";

interface Inputs { GridName?: string; DataField?: string; ConfigJson?: string }

interface Resolved { cfg: GridConfig; derived: { name: string; cfg: GridConfig }[]; notice?: string }

async function resolveConfig(inputs: Inputs, projectId: string): Promise<Resolved> {
  let cfg: GridConfig | undefined;
  let derived: Resolved["derived"] = [];
  let lookups: Record<string, LookupTable> = {};
  if (inputs.ConfigJson && inputs.ConfigJson.trim()) {
    try { cfg = JSON.parse(inputs.ConfigJson); } catch { throw new Error("The 'Grid configuration (JSON)' input is not valid JSON."); }
  } else if (inputs.GridName) {
    const project = await loadConfig(projectId);
    lookups = project.lookups ?? {};
    const name = inputs.GridName.trim();
    cfg = project.grids[name];
    derived = Object.entries(project.grids).filter(([n, g]) => g.derived?.source === name && n !== name).map(([n, g]) => ({ name: n, cfg: applySharedLookups(g, lookups) }));
    if (!cfg) throw new Error(`No grid named '${inputs.GridName}' is defined. Create it in Project settings → Grid & Rules.`);
  } else {
    throw new Error("Set the 'Grid name' (or 'Grid configuration (JSON)') input on this control in the process layout.");
  }
  if (!cfg || !Array.isArray(cfg.columns) || !cfg.columns.length) throw new Error("The grid has no columns.");
  if (cfg.columns.some(c => c.lookup?.table) && !Object.keys(lookups).length) lookups = (await loadConfig(projectId)).lookups ?? {};
  cfg = applySharedLookups(cfg, lookups);
  let notice: string | undefined;
  if (inputs.DataField && cfg.dataField && inputs.DataField !== cfg.dataField)
    notice = `This control stores its rows in ${inputs.DataField}, but the grid is set to ${cfg.dataField} in Project settings → Grid & Rules. Calculations read the settings value, so they will not see these rows. Clear the control's “Data field” input in the layout (recommended), or change the grid's data field in the settings to ${inputs.DataField}.`;
  if (inputs.DataField) cfg = { ...cfg, dataField: inputs.DataField };
  if (!cfg.dataField) throw new Error("No data field set. Pick a long-text field in the 'Data field' input.");
  const problems = validateConfig(cfg);
  if (problems.length) throw new Error("Invalid grid configuration: " + problems.join("; "));
  return { cfg, derived, notice };
}

function App(props: { cfg: GridConfig; derived: Resolved["derived"]; notice?: string; projectId: string; projectName: string }) {
  const { cfg } = props;
  const [rows, setRows] = React.useState<GridRow[]>([]);
  const [ready, setReady] = React.useState(false);
  const [status, setStatus] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [warn, setWarn] = React.useState(props.notice ?? "");
  const knownFields = React.useRef<Set<string>>();
  const rowsRef = React.useRef<GridRow[]>([]);
  const lastWritten = React.useRef<string | null>(null);
  const timer = React.useRef<number>();
  const rootRef = React.useRef<HTMLDivElement>(null);

  const flash = (m: string) => { setStatus(m); window.setTimeout(() => setStatus(s => (s === m ? "" : s)), 6000); };

  const writeNow = React.useCallback(async (next: GridRow[]) => {
    const svc = await getFormService();
    const text = serialize(next);
    lastWritten.current = text;
    // 1) the rows themselves – always written on their own so a bad total mapping can never lose them
    await svc.setFieldValue(cfg.dataField!, text);
    // 2) mapped totals, one by one; skip fields this work item type does not have and report them
    const wanted = mappedTotals(next, cfg);
    if (!Object.keys(wanted).length) { setWarn(""); return; }
    if (!knownFields.current) knownFields.current = new Set((await svc.getFields()).map(f => f.referenceName));
    const problems: string[] = [];
    for (const [field, value] of Object.entries(wanted)) {
      if (!knownFields.current.has(field)) { problems.push(`${field} (not on this work item type)`); continue; }
      try { await svc.setFieldValue(field, value); } catch (e) { problems.push(`${field} (${(e as Error).message || "rejected"})`); }
    }
    setWarn(problems.length ? `Totals not saved to: ${problems.join("; ")}. The grid rows were saved. Add these fields to this work item type or fix the mapping in Project settings → Grid & Rules.` : "");
  }, [cfg]);

  const readField = React.useCallback(async () => {
    const svc = await getFormService();
    const raw = await svc.getFieldValue(cfg.dataField!);
    if (raw !== null && lastWritten.current !== null && String(raw) === lastWritten.current) return;
    const parsed = parseStored(raw, cfg);
    const rawText = raw === null || raw === undefined ? "" : String(raw).trim();
    if (!parsed.length && rowsRef.current.length && lastWritten.current !== null) {
      // the form handed back an empty / unreadable value although we wrote rows: keep what the user sees and write it again
      setWarn(rawText ? "The stored grid value could not be read back; your rows are kept and will be re-saved." : "The grid value was empty after the form refreshed; your rows are kept and re-applied. If this repeats, check the Data field is a long-text field on this work item type.");
      writeNow(rowsRef.current).catch(() => undefined);
      return;
    }
    if (!parsed.length && rawText) setWarn(`The data field contains text this grid cannot read (not valid grid JSON). Starts with: ${rawText.replace(/\s+/g, " ").slice(0, 140)}${rawText.length > 140 ? "…" : ""}  – If this field is rich text, recreate it as plain text (multiple lines), or clear it and re-enter the rows.`);
    rowsRef.current = parsed; setRows(parsed);
  }, [cfg, writeNow]);

  const commit = React.useCallback((next: GridRow[]) => {
    rowsRef.current = next; setRows(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { writeNow(rowsRef.current).catch(e => setWarn(`Could not store the rows in ${cfg.dataField}: ${(e as Error).message}. Is it a long-text field that is on this work item type?`)); }, 250);
  }, [writeNow, cfg.dataField]);

  // register with the work item form
  React.useEffect(() => {
    SDK.register(SDK.getContributionId(), () => ({
      onLoaded: () => { readField().then(() => setReady(true)); emitFormEvent({ type: "loaded" }); },
      onFieldChanged: (a: { changedFields: Record<string, unknown> }) => { if (a.changedFields && cfg.dataField! in a.changedFields) readField(); emitFormEvent({ type: "changed", changed: a.changedFields }); },
      onSaved: () => { readField(); emitFormEvent({ type: "saved" }); },
      onReset: () => { lastWritten.current = null; readField(); emitFormEvent({ type: "reset" }); },
      onRefreshed: () => { readField(); emitFormEvent({ type: "refreshed" }); },
    }));
    readField().then(() => setReady(true)).catch(e => flash(e.message));
    // block save while rows are invalid
    return () => window.clearTimeout(timer.current);
  }, [cfg, readField]);

  // keep the iframe height in sync with the content
  React.useEffect(() => {
    if (!rootRef.current) return;
    const ro = new ResizeObserver(() => SDK.resize(undefined, Math.min(rootRef.current!.scrollHeight + 8, 1100)));
    ro.observe(rootRef.current);
    return () => ro.disconnect();
  }, []);

  // optional strict mode: surface validation problems on the form, which blocks saving
  React.useEffect(() => {
    if (!ready || !cfg.blockSave) return;
    const errs = validateRows(rows, cfg);
    getFormService().then(s => (errs.length ? s.setError(`Grid: ${errs[0].message}${errs.length > 1 ? ` (+${errs.length - 1} more)` : ""}`) : s.clearError())).catch(() => undefined);
  }, [rows, ready, cfg]);

  const createChildren = async (ids: string[]) => {
    const child = cfg.child!;
    setBusy(true);
    try {
      const svc = await getFormService();
      if (await svc.isNew()) { flash("Save the work item first, then create child items."); return; }
      const parentUrl = await svc.getWorkItemResourceUrl(await svc.getId());
      const inherit = await svc.getFieldValues(["System.AreaPath", "System.IterationPath"]);
      const client = await witClient();
      let next = [...rowsRef.current], made = 0;
      for (const id of ids) {
        const row = next.find(r => r._id === id);
        if (!row || row._childId) continue;
        const title = String(row[child.titleColumn] ?? "").trim();
        if (!title) { flash("A row has no title – skipped."); continue; }
        const doc: { op: string; path: string; value: unknown }[] = [
          { op: "add", path: "/fields/System.Title", value: title },
          { op: "add", path: "/fields/System.AreaPath", value: inherit["System.AreaPath"] },
          { op: "add", path: "/fields/System.IterationPath", value: inherit["System.IterationPath"] },
        ];
        for (const [col, ref] of Object.entries(child.fieldMap ?? {})) {
          const v = row[col];
          if (ref && ref !== "System.Title" && v !== "" && v !== null && v !== undefined) doc.push({ op: "add", path: `/fields/${ref}`, value: v });
        }
        doc.push({ op: "add", path: "/relations/-", value: { rel: "System.LinkTypes.Hierarchy-Reverse", url: parentUrl } });
        const wi = await client.createWorkItem(doc as never, props.projectName, child.workItemType);
        next = next.map(r => (r._id === id ? { ...r, _childId: wi.id } : r));
        made++;
      }
      commit(next);
      if (made) flash(`Created ${made} ${child.workItemType}${made > 1 ? "s" : ""}. Save the work item to keep the links in the grid.`);
    } catch (e) {
      flash("Create failed: " + (e as Error).message);
    } finally { setBusy(false); }
  };

  const onImport = async (file: File) => {
    try {
      const { rows: imported, unmatched } = await importFile(file, cfg);
      if (!imported.length) { flash("Nothing to import – is the first row a header row?"); return; }
      commit([...rowsRef.current, ...imported]);
      flash(`Imported ${imported.length} row(s)` + (unmatched.length ? `; no matching header for: ${unmatched.join(", ")}` : ""));
    } catch (e) { flash("Import failed: " + (e as Error).message); }
  };

  const onExport = async (kind: "csv" | "xlsx") => {
    try {
      if (kind === "csv") downloadFile("grid.csv", "﻿" + exportCsv(rowsRef.current, cfg), "text/csv;charset=utf-8");
      else downloadFile("grid.xlsx", await exportXlsx(rowsRef.current, cfg));
    } catch (e) { flash("Export failed: " + (e as Error).message); }
  };

  return (
    <div ref={rootRef}>
      {warn && <div className="err" style={{ padding: "4px 8px", border: "1px solid var(--err)", margin: "4px 8px" }}>{warn}</div>}
      <Grid cfg={cfg} rows={rows} readOnly={!!cfg.readOnly} projectId={props.projectId} busyChildren={busy} status={status}
        onChange={commit} onImport={onImport} onExport={onExport}
        onCreateChild={id => createChildren([id])}
        onCreateAllChildren={() => createChildren(rowsRef.current.filter(r => !r._childId).map(r => r._id))} />
      {props.derived.map(d => <DerivedGrid key={d.name} name={d.name} cfg={d.cfg} sourceRows={rows} sourceReady={ready} projectId={props.projectId} />)}
    </div>
  );
}

async function main() {
  await init(false);
  const root = document.getElementById("root")!;
  try {
    const inputs = (SDK.getConfiguration().witInputs ?? {}) as Inputs;
    const project = await getProject();
    const { cfg, derived, notice } = await resolveConfig(inputs, project.id);
    ReactDOM.render(<App cfg={cfg} derived={derived} notice={notice} projectId={project.id} projectName={project.name} />, root);
  } catch (e) {
    root.innerHTML = `<div style="padding:8px" class="err">${String((e as Error).message).replace(/</g, "&lt;")}</div>`;
    SDK.resize(undefined, 80);
  }
  await SDK.notifyLoadSucceeded();
}
main();
