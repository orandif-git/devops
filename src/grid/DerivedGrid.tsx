import * as React from "react";
import { sameRows, sourceMembers, syncDerived } from "../core/derived";
import { parseStored, serialize } from "../core/gridModel";
import { entriesFromRows, sameEntries, sumAllocations } from "../core/allocations";
import { CapacityRegister } from "../core/capacity";
import { ColumnDef, GridConfig, GridRow } from "../core/types";
import { loadLiveAllocations, saveAllocation } from "../shared/allocationStore";
import { applyCalculations } from "../shared/calcRunner";
import { loadRegister } from "../shared/capacityStore";
import { downloadFile, getFormService } from "../shared/ado";
import { exportCsv, exportXlsx } from "../shared/excel";
import { Grid } from "./Grid";
import { onFormEvent, writeGrid } from "./formWriter";

/**
 * A grid whose rows are built automatically from the source grid shown above it
 * (e.g. Resource Capacity from the timesheet). Manual columns stay editable and are remembered by key.
 */
export function DerivedGrid(p: { name: string; cfg: GridConfig; sourceCfg?: GridConfig; sourceRows: GridRow[]; sourceReady: boolean; projectId: string }) {
  const { cfg } = p;
  const [rows, setRows] = React.useState<GridRow[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [warn, setWarn] = React.useState("");
  const usesRegister = cfg.columns.some(c => c.capacity || c.teamOf);
  const [register, setRegister] = React.useState<CapacityRegister>();
  const [registerTried, setRegisterTried] = React.useState(!usesRegister);
  const usesOthers = cfg.columns.some(c => c.others);
  const [others, setOthers] = React.useState<Record<string, number>>();
  const [othersTried, setOthersTried] = React.useState(!usesOthers);
  const [unverified, setUnverified] = React.useState(false);
  const published = React.useRef<Record<string, number> | null>(null);
  const publishedOnce = React.useRef(false);
  const rowsRef = React.useRef<GridRow[]>([]);
  const lastWritten = React.useRef<string | null>(null);
  const timer = React.useRef<number>();

  const schedule = React.useCallback((next: GridRow[]) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      lastWritten.current = serialize(next);
      writeGrid(cfg, next).then(w => { setWarn(w); return applyCalculations(); }).catch(e => setWarn(`Could not store ${cfg.dataField}: ${(e as Error).message}. Is it a long-text field on this work item type?`));
    }, 250);
  }, [cfg]);

  const apply = React.useCallback((next: GridRow[]) => { rowsRef.current = next; setRows(next); schedule(next); }, [schedule]);

  const read = React.useCallback(async () => {
    const raw = await (await getFormService()).getFieldValue(cfg.dataField!);
    if (raw !== null && lastWritten.current !== null && String(raw) === lastWritten.current) return;
    const parsed = parseStored(raw, cfg);
    rowsRef.current = parsed; setRows(parsed); setLoaded(true);
  }, [cfg]);

  React.useEffect(() => {
    read().catch(e => setWarn(e.message));
    const off = onFormEvent(e => {
      if (e.type === "reset") lastWritten.current = null;
      if (e.type !== "changed" || (e.changed && cfg.dataField! in e.changed)) read().catch(() => undefined);
    });
    return () => { off(); window.clearTimeout(timer.current); };
  }, [cfg, read]);

  // central Capacity register (read once when the work item opens)
  React.useEffect(() => {
    if (!usesRegister) return;
    loadRegister(p.projectId).then(r => { setRegister(r); setRegisterTried(true); })
      .catch(e => { setWarn(`Could not load the Capacity register: ${e.message}. Capacity values shown may be out of date.`); setRegisterTried(true); });
  }, [usesRegister, p.projectId]);

  // hours on all other Epics (central allocation store), excluding this work item
  React.useEffect(() => {
    if (!usesOthers) return;
    (async () => {
      const id = await (await getFormService()).getId();
      const live = await loadLiveAllocations(p.projectId);
      setOthers(sumAllocations(live.docs, id || undefined));
      setUnverified(!live.verified);
    })().catch(e => setWarn(`Could not load the hours of other Epics: ${e.message}. "Hours (other Epics)" may be out of date.`)).finally(() => setOthersTried(true));
  }, [usesOthers, p.projectId]);

  // publish this Epic's hours (per person and month) so other Epics can count them; only the saved state is published
  const publish = React.useCallback(async () => {
    if (!cfg.allocation) return;
    try {
      const svc = await getFormService();
      const id = await svc.getId();
      if (!id) return;                                           // not saved yet: published right after the first save
      const entries = entriesFromRows(rowsRef.current, cfg.allocation);
      if (published.current && sameEntries(published.current, entries)) return;
      await saveAllocation(p.projectId, { workItemId: id, title: String((await svc.getFieldValue("System.Title")) ?? ""), updatedAt: new Date().toISOString(), entries });
      published.current = entries;
    } catch (e) { setWarn(`Could not publish this Epic's hours for other Epics: ${(e as Error).message}`); }
  }, [cfg.allocation, p.projectId]);

  React.useEffect(() => onFormEvent(e => { if (e.type === "saved") window.setTimeout(() => { publish(); }, 700); }), [publish]);

  // keep the rows in step with the source grid (waits until both sides have been read from the form)
  React.useEffect(() => {
    if (!loaded || !p.sourceReady || !registerTried || !othersTried) return;
    const next = syncDerived(p.sourceRows, cfg, rowsRef.current, register, others, p.sourceCfg);
    if (!sameRows(next, rowsRef.current)) apply(next);
    if (!publishedOnce.current) { publishedOnce.current = true; publish(); }    // first load: make sure the store reflects the saved Epic
  }, [p.sourceRows, p.sourceCfg, p.sourceReady, loaded, cfg, apply, register, registerTried, others, othersTried, publish]);

  const labelCol = p.sourceCfg?.columns.find(c => c.type === "dropdown") ?? p.sourceCfg?.columns.find(c => c.type === "string" && !c.lookup);
  /** hover text for an aggregated figure: which source rows add up to it */
  const cellInfo = (row: GridRow, col: ColumnDef) => {
    if (col.others) return "Hours this person has on all other work items that month (saved hours of the other Epics)";
    if (col.teamOf) return "The person's team, from the capacity source";
    if (col.capacity) return "Available hours from the capacity source";
    if (col.derive?.role !== "agg") return undefined;
    const d = col.derive;
    const lines = sourceMembers(p.sourceRows, cfg, row, p.sourceCfg).map(m => `${labelCol ? String(m[labelCol.id] || "(no " + labelCol.name + ")") : "Row"}: ${m[d.source] ?? 0}`);
    if (!lines.length) return undefined;
    const adj = typeof row["_adj_" + col.id] === "number";
    return `${adj ? "Adjusted by hand. Calculated from:" : "Made up of:"}\n${lines.join("\n")}`;
  };
  const resync = (next: GridRow[]) => apply(syncDerived(p.sourceRows, cfg, next, register, others, p.sourceCfg));

  if (!cfg.dataField) return <div className="err" style={{ padding: 8 }}>The derived grid “{p.name}” has no data field. Set one in Project settings → Grid &amp; Rules.</div>;
  return (
    <>
      {warn && <div className="err" style={{ padding: "4px 8px", border: "1px solid var(--err)", margin: "4px 8px" }}>{warn}</div>}
      {unverified && <div className="muted" style={{ padding: "2px 8px", fontSize: 12 }}>Hours of other Epics are counted without checking that those Epics still exist (the check could not be completed).</div>}
      <Grid title={p.name} cfg={cfg} rows={rows} readOnly={!!cfg.readOnly} autoRows projectId={p.projectId} busyChildren={false} status=""
        onChange={resync} cellInfo={cellInfo} onCreateChild={() => undefined} onCreateAllChildren={() => undefined} onImport={() => undefined}
        onExport={async k => { if (k === "csv") downloadFile(`${p.name}.csv`, "﻿" + exportCsv(rowsRef.current, cfg), "text/csv;charset=utf-8"); else downloadFile(`${p.name}.xlsx`, await exportXlsx(rowsRef.current, cfg)); }} />
    </>
  );
}
