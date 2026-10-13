import { commentOnlyHere } from "../shared/commentOnlyAccess";
import { staleOutputs } from "../core/written";
import * as React from "react";
import * as ReactDOM from "react-dom";
import * as SDK from "azure-devops-extension-sdk";
import "../shared/styles.css";
import "./grid.css";
import { Grid } from "./Grid";
import { DerivedGrid } from "./DerivedGrid";
import { emitFormEvent } from "./formWriter";
import { applyCalculations, resetCalcRunner } from "../shared/calcRunner";
import { GridConfig, GridPreset, GridRow, LookupTable } from "../core/types";
import { defaultPresetColumns, mergePreset, presetApplies, presetFromRows, upsertPreset } from "../core/presets";
import { canSavePresets } from "../shared/presetAccess";
import { loadActor } from "../shared/reviewAccess";
import { Actor, freshReview, overallValue } from "../core/review";
import { normalizeGrid } from "../core/normalize";
import { applyDecisions, decideSecure, emptyReviewDoc, parseReviewDoc, serializeReviewDoc, staleCount } from "../core/reviewDoc";
import { applySharedLookups } from "../core/sharedLookups";
import { mappedTotals, parseStored, recomputeAll, serialize, validateConfig, validateRows } from "../core/gridModel";
import { loadCalendarBook } from "../shared/capacityStore";
import { setCalendarBook } from "../core/schedule";
import { setTeamBooks, TeamBook } from "../core/teamBook";
import { loadTeamBook } from "../shared/teamMembership";
import { downloadFile, getFormService, getProject, init, loadConfig, saveConfig, witClient } from "../shared/ado";
import { exportCsv, exportXlsx, importFile } from "../shared/excel";

interface Inputs { GridName?: string; DataField?: string; ConfigJson?: string }

interface Resolved { cfg: GridConfig; derived: { name: string; cfg: GridConfig }[]; notice?: string; gridName?: string }

async function resolveConfig(inputs: Inputs, projectId: string): Promise<Resolved> {
  let cfg: GridConfig | undefined;
  let derived: Resolved["derived"] = [];
  let lookups: Record<string, LookupTable> = {};
  if (inputs.ConfigJson && inputs.ConfigJson.trim()) {
    try { cfg = normalizeGrid(JSON.parse(inputs.ConfigJson)); } catch { throw new Error("The 'Grid configuration (JSON)' input is not valid JSON."); }
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
  return { cfg, derived, notice, gridName: inputs.GridName?.trim() || undefined };
}

function App(props: { cfg: GridConfig; derived: Resolved["derived"]; notice?: string; gridName?: string; projectId: string; projectName: string }) {
  const { cfg } = props;
  const [rows, setRows] = React.useState<GridRow[]>([]);
  const [ready, setReady] = React.useState(false);
  const [commentOnly, setCommentOnly] = React.useState(false);
  const commentOnlyP = React.useMemo(() => commentOnlyHere(props.projectId).then(r => { setCommentOnly(r); return r; }), [props.projectId]);
  const [status, setStatus] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [warn, setWarn] = React.useState(props.notice ?? "");
  // the overall review status field follows the decisions even when nothing was typed (for example an approval that went stale on opening)
  React.useEffect(() => {
    if (!ready) return;
    const o = overallValue(rows, cfg);
    if (!o || o.value === lastOverall.current) return;
    lastOverall.current = o.value;
    getFormService().then(async svc => {
      if (!knownFields.current) knownFields.current = new Set((await svc.getFields()).map(f => f.referenceName));
      if (!knownFields.current.has(o.field)) return;
      const cur = await svc.getFieldValue(o.field);
      if (String(cur ?? "") !== o.value) await svc.setFieldValue(o.field, o.value);
    }).catch(() => undefined);
  }, [ready, rows, cfg]);

  // approvals: who is looking at the grid (until known, approved rows stay locked and nobody sees the Approve / Reject buttons)
  React.useEffect(() => {
    if (!props.cfg.review) return;
    loadActor(props.projectId, props.cfg.review).then(setActor).catch(e => setWarn(`Could not work out who may approve: ${(e as Error).message}`));
  }, [props.cfg.review, props.projectId]);
  const changedRef = React.useRef<string[]>([]);
  const refreshRef = React.useRef<() => Promise<void>>();
  const [presets, setPresets] = React.useState<GridPreset[]>(props.cfg.presets ?? []);
  const [presetList, setPresetList] = React.useState<GridPreset[]>([]);
  const [canSave, setCanSave] = React.useState(false);
  const [actor, setActor] = React.useState<Actor>();
  // secure approvals: decisions live in their own protected field; rows show (and totals use) only decisions that still match the row
  const secField = props.cfg.review?.secure?.dataField;
  const docRef = React.useRef(emptyReviewDoc());
  const [reviewNote, setReviewNote] = React.useState("");
  const overlay = React.useCallback((r: GridRow[]) => {
    if (!secField || !props.cfg.review) return r;
    const n = staleCount(r, props.cfg, docRef.current);
    setReviewNote(n ? `${n} row${n === 1 ? " was" : "s were"} changed after ${n === 1 ? "it was" : "they were"} approved or rejected and ${n === 1 ? "is" : "are"} pending review again.` : "");
    return applyDecisions(r, props.cfg, docRef.current);
  }, [secField, props.cfg]);
  const [calVersion, setCalVersion] = React.useState(0);
  const [calError, setCalError] = React.useState("");
  const knownFields = React.useRef<Set<string>>();
  const rowsRef = React.useRef<GridRow[]>([]);
  const lastOverall = React.useRef<string | undefined>(undefined);
  const syncedOnOpen = React.useRef(false);
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
    const wanted: Record<string, number | string> = { ...mappedTotals(next, cfg) };
    const overall = overallValue(next, cfg);                  // e.g. "Partially approved", written to the field chosen in the Approval settings
    if (overall) { wanted[overall.field] = overall.value; lastOverall.current = overall.value; }
    if (!Object.keys(wanted).length) { setWarn(""); return; }
    if (!knownFields.current) knownFields.current = new Set((await svc.getFields()).map(f => f.referenceName));
    const problems: string[] = [];
    for (const [field, value] of Object.entries(wanted)) {
      if (!knownFields.current.has(field)) { problems.push(`${field} (not on this work item type)`); continue; }
      try { await svc.setFieldValue(field, value); } catch (e) { problems.push(`${field} (${(e as Error).message || "rejected"})`); }
    }
    setWarn(problems.length ? `Totals not saved to: ${problems.join("; ")}. The grid rows were saved. Add these fields to this work item type or fix the mapping in Project settings → Grid & Rules.` : "");
  }, [cfg]);

  /** Totals and statuses are calculated: when the work item is opened, correct any output field that was changed by hand or by another tool. */
  const syncOutputs = React.useCallback(async (next: GridRow[]) => {
    if (!next.length || await commentOnlyP) return;
    const wanted: Record<string, number | string> = { ...mappedTotals(next, cfg) };
    const overall = overallValue(next, cfg);
    if (overall) wanted[overall.field] = overall.value;
    if (!Object.keys(wanted).length) return;
    const svc = await getFormService();
    if (!knownFields.current) knownFields.current = new Set((await svc.getFields()).map(f => f.referenceName));
    const current: Record<string, unknown> = {};
    for (const f of Object.keys(wanted)) { if (!knownFields.current.has(f)) { delete wanted[f]; continue; } try { current[f] = await svc.getFieldValue(f); } catch { delete wanted[f]; } }
    for (const f of staleOutputs(wanted, current)) { try { await svc.setFieldValue(f, wanted[f]); } catch { /* the field may be locked by a process rule: reported when the grid is next edited */ } }
  }, [cfg, commentOnlyP]);

  const readField = React.useCallback(async () => {
    const svc = await getFormService();
    if (secField) {
      try { docRef.current = parseReviewDoc(await svc.getFieldValue(secField)); }
      catch { setWarn(`The approvals field ${secField} is not on this work item type, so every row counts as pending review. Add it to the type (Project settings → Process).`); docRef.current = emptyReviewDoc(); }
    }
    const raw = await svc.getFieldValue(cfg.dataField!);
    if (raw !== null && lastWritten.current !== null && String(raw) === lastWritten.current) {
      if (secField) { rowsRef.current = overlay(rowsRef.current); setRows(rowsRef.current); }        // the decisions may have changed
      return;
    }
    const parsed = parseStored(raw, cfg);
    const rawText = raw === null || raw === undefined ? "" : String(raw).trim();
    if (!parsed.length && rowsRef.current.length && lastWritten.current !== null) {
      // the form handed back an empty / unreadable value although we wrote rows: keep what the user sees and write it again
      setWarn(rawText ? "The stored grid value could not be read back; your rows are kept and will be re-saved." : "The grid value was empty after the form refreshed; your rows are kept and re-applied. If this repeats, check the Data field is a long-text field on this work item type.");
      writeNow(rowsRef.current).catch(() => undefined);
      return;
    }
    if (!parsed.length && rawText) setWarn(`The data field contains text this grid cannot read (not valid grid JSON). Starts with: ${rawText.replace(/\s+/g, " ").slice(0, 140)}${rawText.length > 140 ? "…" : ""}  – If this field is rich text, recreate it as plain text (multiple lines), or clear it and re-enter the rows.`);
    rowsRef.current = overlay(parsed); setRows(rowsRef.current);
    if (!syncedOnOpen.current && parsed.length && !cfg.readOnly) { syncedOnOpen.current = true; syncOutputs(rowsRef.current).catch(() => undefined); }
  }, [cfg, writeNow, secField, overlay, syncOutputs]);

  const commit = React.useCallback((raw: GridRow[]) => {
    const next = overlay(raw);                                       // a row changed after its approval shows as pending at once
    rowsRef.current = next; setRows(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      writeNow(rowsRef.current).then(() => applyCalculations())
        .catch(e => setWarn(`Could not store the rows in ${cfg.dataField}: ${(e as Error).message}. Is it a long-text field that is on this work item type?`));
    }, 250);
  }, [writeNow, cfg.dataField, overlay]);

  // register with the work item form
  React.useEffect(() => {
    SDK.register(SDK.getContributionId(), () => ({
      onLoaded: () => { resetCalcRunner(); readField().then(() => { setReady(true); applyCalculations(); }); emitFormEvent({ type: "loaded" }); },
      onFieldChanged: (a: { changedFields: Record<string, unknown> }) => { if (a.changedFields && changedRef.current.some(f => f in a.changedFields)) refreshRef.current?.().catch(() => undefined); if (a.changedFields && (cfg.dataField! in a.changedFields || (secField && secField in a.changedFields))) readField(); emitFormEvent({ type: "changed", changed: a.changedFields }); },
      onSaved: () => { readField(); emitFormEvent({ type: "saved" }); },
      onReset: () => { lastWritten.current = null; readField(); emitFormEvent({ type: "reset" }); },
      onRefreshed: () => { readField(); emitFormEvent({ type: "refreshed" }); },
    }));
    readField().then(() => { setReady(true); applyCalculations(); }).catch(e => flash(e.message));
    // block save while rows are invalid
    return () => window.clearTimeout(timer.current);
  }, [cfg, readField]);

  // presets offered on this work item (their rules read fields of the work item) and who may save new ones
  const ruleFields = React.useMemo(() => Array.from(new Set(presets.flatMap(x => (x.when ?? []).map(w => w.field).filter(Boolean)))), [presets]);
  const refreshPresets = React.useCallback(async () => {
    if (!presets.length) { setPresetList([]); return; }
    const svc = await getFormService();
    const values: Record<string, unknown> = {};
    for (const f of ruleFields) { try { values[f] = await svc.getFieldValue(f); } catch { values[f] = undefined; } }
    const text = (v: unknown) => (v && typeof v === "object" ? ((v as { displayName?: string; name?: string }).displayName ?? (v as { name?: string }).name ?? "") : v);
    setPresetList(presets.filter(x => presetApplies(x, f => text(values[f]))));
  }, [presets, ruleFields]);
  React.useEffect(() => { if (ready) refreshPresets().catch(() => undefined); }, [ready, refreshPresets]);
  React.useEffect(() => { if (props.gridName && cfg.presetSave?.enabled) canSavePresets(props.projectId, cfg.presetSave).then(setCanSave).catch(() => setCanSave(false)); }, [props.gridName, props.projectId, cfg.presetSave]);
  changedRef.current = ruleFields;
  refreshRef.current = refreshPresets;

  /** secure approvals: write the decision to the protected field first; only when Azure DevOps accepts it do the rows change */
  const onDecide = async (ids: string[], to: "approved" | "rejected") => {
    if (!actor || !cfg.review || !secField) return { changed: 0, skipped: 0, error: "Approvals are not set up correctly." };
    const res = decideSecure(rowsRef.current, new Set(ids), to, cfg, actor, SDK.getUser().displayName, docRef.current);
    if (!res.changed) return { changed: 0, skipped: res.skipped, firstReason: res.firstReason };
    try {
      const ok = await (await getFormService()).setFieldValue(secField, serializeReviewDoc(res.doc));
      if (!ok) throw new Error("the field is read-only for you");
    } catch (e) {
      return { changed: 0, skipped: 0, error: `Azure DevOps did not allow changing the approvals field ${secField} (${(e as Error).message}). Only members of the approver group set in the field's process rule can decide rows.` };
    }
    docRef.current = res.doc;
    commit(res.rows);
    return { changed: res.changed, skipped: res.skipped, firstReason: res.firstReason };
  };

  const loadPreset = (id: string, mode: "add" | "replace"): string[] => {
    const preset = presetList.find(x => x.id === id);
    if (!preset) return [];
    const before = new Set(rowsRef.current.map(r => r._id));
    const res = mergePreset(rowsRef.current, preset, cfg, mode, actor);
    commit(res.rows);
    flash(`Loaded ${res.added} row${res.added === 1 ? "" : "s"} from “${preset.name}”${res.skipped ? `; ${res.skipped} already there` : ""}. Now fill in the rest.`);
    return res.rows.filter(r => !before.has(r._id)).map(r => r._id);
  };
  const savePreset = async (name: string) => {
    try {
      if (!props.gridName) throw new Error("this grid is configured inline, not by name");
      const project = await loadConfig(props.projectId);
      const g = project.grids[props.gridName];
      if (!g) throw new Error(`grid '${props.gridName}' no longer exists`);
      const existing = (g.presets ?? []).find(x => x.name.trim().toLowerCase() === name.toLowerCase());
      const preset = presetFromRows(rowsRef.current, cfg, name, existing?.columns ?? defaultPresetColumns(cfg));
      const list = upsertPreset(g.presets, preset);
      await saveConfig(props.projectId, { ...project, grids: { ...project.grids, [props.gridName]: { ...g, presets: list } } });
      setPresets(list);
      flash(`Saved preset “${name}” (${preset.rows.length} rows). Add a rule for it under Project settings → Grid & Rules if it should only show on some work items.`);
    } catch (e) { flash("Could not save the preset: " + (e as Error).message); }
  };

  // columns that take the person's team from Azure DevOps team / group membership: load the members, then recalculate the rows
  const teamCols = React.useMemo(() => cfg.columns.filter(c => c.teamFrom), [cfg]);
  const [teamVersion, setTeamVersion] = React.useState(0);
  React.useEffect(() => {
    if (!teamCols.length) return;
    let live = true;
    (async () => {
      const books = new Map<string, TeamBook>();
      const failed: string[] = [];
      for (const c of teamCols) {
        const r = await loadTeamBook(props.projectId, c.teamFrom!.teams);
        books.set(r.key, r.book); failed.push(...r.failed);
      }
      if (!live) return;
      setTeamBooks(books);
      if (failed.length) setWarn(w => w || `Could not read the members of: ${Array.from(new Set(failed)).join(", ")}. The team column keeps what was saved.`);
      setTeamVersion(v => v + 1);
    })().catch(e => { if (live) setWarn(`Could not read team members: ${(e as Error).message}`); });
    return () => { live = false; };
  }, [teamCols, props.projectId]);
  React.useEffect(() => {
    if (!ready || !teamVersion) return;
    const next = recomputeAll(rowsRef.current, cfg);
    if (serialize(next) !== serialize(rowsRef.current)) commit(next);
  }, [ready, teamVersion, cfg, commit]);

  // scheduled grids: load the people's calendars, then recalculate the end dates and monthly hours (saved only when something changed)
  React.useEffect(() => {
    if (!cfg.schedule) return;
    let live = true;
    loadCalendarBook(props.projectId)
      .then(book => { if (live) { setCalendarBook(book); setCalError(""); setCalVersion(v => v + 1); } })
      .catch(e => { if (live) setCalError(`Could not read the calendar: ${(e as Error).message}. End dates and monthly hours are not recalculated.`); });
    return () => { live = false; };
  }, [cfg.schedule, props.projectId]);
  React.useEffect(() => {
    if (!ready || !cfg.schedule || !calVersion) return;
    const next = recomputeAll(rowsRef.current, cfg);
    if (serialize(next) !== serialize(rowsRef.current)) commit(next);
  }, [ready, calVersion, cfg, commit]);

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
      let made = 0;
      try {
        for (const id of ids) {
          const row = rowsRef.current.find(r => r._id === id);
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
          made++;
          // remember each created item at once, on top of whatever the user has typed meanwhile, so a later failure cannot make us create it twice
          commit(rowsRef.current.map(r => (r._id === id ? { ...r, _childId: wi.id } : r)));
        }
      } finally {
        if (made) flash(`Created ${made} ${child.workItemType}${made > 1 ? "s" : ""}. Save the work item to keep the links in the grid.`);
      }
    } catch (e) {
      flash("Create failed: " + (e as Error).message);
    } finally { setBusy(false); }
  };

  const onImport = async (file: File) => {
    try {
      const { rows: imported, unmatched } = await importFile(file, cfg);
      if (!imported.length) { flash("Nothing to import – is the first row a header row?"); return; }
      commit([...rowsRef.current, ...(cfg.review ? imported.map(r => freshReview(r, cfg.review!)) : imported)]);      // imported rows must be reviewed (never arrive approved)
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
      {reviewNote && <div className="muted" style={{ padding: "2px 8px" }}>{reviewNote}</div>}
      {calError && <div className="err" style={{ padding: "4px 8px", border: "1px solid var(--err)", margin: "4px 8px" }}>{calError}</div>}
      <Grid cfg={cfg} rows={rows} readOnly={!!cfg.readOnly || commentOnly} projectId={props.projectId} busyChildren={busy} status={status}
        review={cfg.review ? { actor, actorName: SDK.getUser().displayName, onDecide: secField ? onDecide : undefined } : undefined}
        onChange={commit} onImport={onImport} onExport={onExport}
        presetTools={presetList.length || canSave ? { presets: presetList.map(x => ({ id: x.id, name: x.name, count: x.rows.length })), onLoad: loadPreset, canSave, onSave: savePreset } : undefined}
        onCreateChild={id => createChildren([id])}
        onCreateAllChildren={() => createChildren(rowsRef.current.filter(r => !r._childId).map(r => r._id))} />
      {props.derived.map(d => <DerivedGrid key={d.name} name={d.name} cfg={d.cfg} sourceCfg={cfg} sourceRows={rows} sourceReady={ready} projectId={props.projectId} />)}
    </div>
  );
}

async function main() {
  await init(false);
  const root = document.getElementById("root")!;
  try {
    const inputs = (SDK.getConfiguration().witInputs ?? {}) as Inputs;
    const project = await getProject();
    const { cfg, derived, notice, gridName } = await resolveConfig(inputs, project.id);
    ReactDOM.render(<App cfg={cfg} derived={derived} notice={notice} gridName={gridName} projectId={project.id} projectName={project.name} />, root);
  } catch (e) {
    root.innerHTML = `<div style="padding:8px" class="err">${String((e as Error).message).replace(/</g, "&lt;")}</div>`;
    SDK.resize(undefined, 80);
  }
  await SDK.notifyLoadSucceeded();
}
main();
