import * as React from "react";
import { sameRows, syncDerived } from "../core/derived";
import { parseStored, serialize } from "../core/gridModel";
import { CapacityRegister } from "../core/capacity";
import { GridConfig, GridRow } from "../core/types";
import { loadRegister } from "../shared/capacityStore";
import { downloadFile, getFormService } from "../shared/ado";
import { exportCsv, exportXlsx } from "../shared/excel";
import { Grid } from "./Grid";
import { onFormEvent, writeGrid } from "./formWriter";

/**
 * A grid whose rows are built automatically from the source grid shown above it
 * (e.g. Resource Capacity from the timesheet). Manual columns stay editable and are remembered by key.
 */
export function DerivedGrid(p: { name: string; cfg: GridConfig; sourceRows: GridRow[]; sourceReady: boolean; projectId: string }) {
  const { cfg } = p;
  const [rows, setRows] = React.useState<GridRow[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [warn, setWarn] = React.useState("");
  const usesRegister = cfg.columns.some(c => c.capacity);
  const [register, setRegister] = React.useState<CapacityRegister>();
  const [registerTried, setRegisterTried] = React.useState(!usesRegister);
  const rowsRef = React.useRef<GridRow[]>([]);
  const lastWritten = React.useRef<string | null>(null);
  const timer = React.useRef<number>();

  const schedule = React.useCallback((next: GridRow[]) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      lastWritten.current = serialize(next);
      writeGrid(cfg, next).then(setWarn).catch(e => setWarn(`Could not store ${cfg.dataField}: ${(e as Error).message}. Is it a long-text field on this work item type?`));
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

  // keep the rows in step with the source grid (waits until both sides have been read from the form)
  React.useEffect(() => {
    if (!loaded || !p.sourceReady || !registerTried) return;
    const next = syncDerived(p.sourceRows, cfg, rowsRef.current, register);
    if (!sameRows(next, rowsRef.current)) apply(next);
  }, [p.sourceRows, p.sourceReady, loaded, cfg, apply, register, registerTried]);

  if (!cfg.dataField) return <div className="err" style={{ padding: 8 }}>The derived grid “{p.name}” has no data field. Set one in Project settings → Grid &amp; Rules.</div>;
  return (
    <>
      {warn && <div className="err" style={{ padding: "4px 8px", border: "1px solid var(--err)", margin: "4px 8px" }}>{warn}</div>}
      <Grid title={p.name} cfg={cfg} rows={rows} readOnly={!!cfg.readOnly} autoRows projectId={p.projectId} busyChildren={false} status=""
        onChange={apply} onCreateChild={() => undefined} onCreateAllChildren={() => undefined} onImport={() => undefined}
        onExport={async k => { if (k === "csv") downloadFile(`${p.name}.csv`, "﻿" + exportCsv(rowsRef.current, cfg), "text/csv;charset=utf-8"); else downloadFile(`${p.name}.xlsx`, await exportXlsx(rowsRef.current, cfg)); }} />
    </>
  );
}
