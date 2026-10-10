import * as React from "react";
import { columnTotals, newRow, optionsFor, recomputeAll, summaries, validateRows } from "../core/gridModel";
import { ColumnDef, GridConfig, GridRow } from "../core/types";
import { IdentityInput } from "./IdentityInput";

export interface GridProps {
  cfg: GridConfig;
  rows: GridRow[];
  readOnly: boolean;
  /** derived grids: rows come from another grid, so rows cannot be added, removed, moved or imported (manual cells stay editable) */
  autoRows?: boolean;
  /** heading shown above the grid */
  title?: string;
  projectId: string;
  busyChildren: boolean;
  onChange(rows: GridRow[]): void;
  onCreateChild(rowId: string): void;
  onCreateAllChildren(): void;
  onImport(file: File): void;
  onExport(kind: "csv" | "xlsx"): void;
  status: string;
}

type SortState = { col: string; dir: 1 | -1 } | null;

export function Grid(p: GridProps) {
  const { cfg, rows, readOnly } = p;
  const lockedRows = readOnly || !!p.autoRows;
  const [sort, setSort] = React.useState<SortState>(null);
  const [filter, setFilter] = React.useState("");
  // rows added with "Add row" that the user has not touched yet: no red highlighting
  const [pristine, setPristine] = React.useState<Set<string>>(new Set());
  const fileRef = React.useRef<HTMLInputElement>(null);

  const allErrors = React.useMemo(() => validateRows(rows, cfg), [rows, cfg]);
  const errors = React.useMemo(() => allErrors.filter(e => !pristine.has(e.rowId)), [allErrors, pristine]);
  const errKey = (rowId: string, col: string) => errors.find(e => e.rowId === rowId && e.column === col)?.message;
  const totals = React.useMemo(() => columnTotals(rows, cfg), [rows, cfg]);

  const visible = React.useMemo(() => {
    let r = rows;
    if (filter.trim()) {
      const q = filter.toLowerCase();
      r = r.filter(row => cfg.columns.some(c => String(row[c.id] ?? "").toLowerCase().includes(q)));
    }
    if (sort) {
      const c = cfg.columns.find(x => x.id === sort.col)!;
      r = [...r].sort((a, b) => {
        const x = a[sort.col], y = b[sort.col];
        const cmp = c.type === "number" ? ((x as number) ?? -Infinity) - ((y as number) ?? -Infinity) : String(x ?? "").localeCompare(String(y ?? ""));
        return cmp * sort.dir;
      });
    }
    return r;
  }, [rows, filter, sort, cfg]);

  const update = (rowId: string, col: string, value: unknown) => {
    if (pristine.has(rowId)) setPristine(s => { const n = new Set(s); n.delete(rowId); return n; });
    p.onChange(recomputeAll(rows.map(r => (r._id === rowId ? { ...r, [col]: value } : r)), cfg));
  };
  const addRow = () => { const r = newRow(cfg); setPristine(s => new Set(s).add(r._id)); p.onChange(recomputeAll([...rows, r], cfg)); };
  const delRow = (id: string) => p.onChange(recomputeAll(rows.filter(r => r._id !== id), cfg));
  const move = (id: string, d: number) => {
    const i = rows.findIndex(r => r._id === id), j = i + d;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows]; [next[i], next[j]] = [next[j], next[i]]; p.onChange(next);
  };
  const dup = (id: string) => {
    const i = rows.findIndex(r => r._id === id);
    const copy = { ...newRow(cfg), ...rows[i], _id: newRow(cfg)._id } as GridRow;
    delete copy._childId;
    const next = [...rows]; next.splice(i + 1, 0, copy); p.onChange(recomputeAll(next, cfg));
  };

  const sums = React.useMemo(() => summaries(rows, cfg), [rows, cfg]);
  const childOn = !!cfg.child?.enabled;
  const pendingChildren = rows.filter(r => !r._childId).length;

  const editor = (c: ColumnDef, r: GridRow) => {
    const v = r[c.id];
    const dis = readOnly || !!c.formula || !!c.lookup || !!c.derive || c.type === "calculated";
    const cls = errKey(r._id, c.id) ? "cell err-cell" : "cell";
    const title = errKey(r._id, c.id);
    switch (c.type) {
      case "calculated":
        return <input className="cell calc" type="text" disabled readOnly value={v === null || v === undefined ? "" : String(v)} title={c.formula} />;
      case "boolean":
        return <input type="checkbox" disabled={dis} checked={!!v} onChange={e => update(r._id, c.id, e.target.checked)} />;
      case "number":
        return <input className={cls} title={title} type="number" disabled={dis} value={v === null || v === undefined ? "" : String(v)}
          min={c.min} max={c.max} onChange={e => update(r._id, c.id, e.target.value === "" ? null : parseFloat(e.target.value))} />;
      case "date":
        return <input className={cls} title={title} type="date" disabled={dis} value={String(v ?? "")} onChange={e => update(r._id, c.id, e.target.value)} />;
      case "dropdown": {
        const opts = optionsFor(c, r);
        const val = String(v ?? "");
        return (
          <select className={cls} title={title} disabled={dis} value={val} onChange={e => update(r._id, c.id, e.target.value)}>
            <option value=""></option>
            {val && !opts.includes(val) && <option value={val}>{val} ⚠</option>}
            {opts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        );
      }
      case "identity":
        return <IdentityInput className={cls} title={title} disabled={dis} value={String(v ?? "")} includeGroups={c.identityGroups !== false}
          projectId={p.projectId} onChange={val => update(r._id, c.id, val)} />;
      default:
        return <input className={cls} title={title} type="text" disabled={dis} value={String(v ?? "")} onChange={e => update(r._id, c.id, e.target.value)} />;
    }
  };

  return (
    <div className="wig">
      {p.title && <h3 className="gtitle">{p.title}</h3>}
      {!lockedRows && (
        <div className="toolbar">
          <button className="btn primary" onClick={addRow}>+ Add row</button>
          <input type="search" placeholder="Filter…" value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 120 }} />
          <span className="spacer" />
          <button className="btn" onClick={() => fileRef.current?.click()}>Import</button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx" hidden onChange={e => { const f = e.target.files?.[0]; if (f) p.onImport(f); e.target.value = ""; }} />
          <button className="btn" onClick={() => p.onExport("csv")}>CSV</button>
          <button className="btn" onClick={() => p.onExport("xlsx")}>Excel</button>
          {childOn && <button className="btn" disabled={p.busyChildren || !pendingChildren} onClick={p.onCreateAllChildren}>
            Create {cfg.child!.workItemType}s ({pendingChildren})</button>}
        </div>
      )}
      {lockedRows && (
        <div className="toolbar">
          <input type="search" placeholder="Filter…" value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 120 }} />
          <span className="spacer" />
          <button className="btn" onClick={() => p.onExport("csv")}>CSV</button>
          <button className="btn" onClick={() => p.onExport("xlsx")}>Excel</button>
        </div>
      )}
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th className="narrow">#</th>
              {cfg.columns.map(c => (
                <th key={c.id} style={{ minWidth: c.width }} onClick={() => setSort(s => (s?.col === c.id ? (s.dir === 1 ? { col: c.id, dir: -1 } : null) : { col: c.id, dir: 1 }))}>
                  {c.name}{c.required && <span className="err">*</span>}{c.formula && <span className="muted" title={c.formula}> ƒ</span>}{c.lookup && <span className="muted" title={`Filled automatically from ${cfg.columns.find(x => x.id === c.lookup!.column)?.name ?? c.lookup.column}`}> ⇢</span>}
                  {sort?.col === c.id ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                </th>
              ))}
              {(!lockedRows || childOn) && <th className="narrow" />}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r._id}>
                <td className="narrow muted">{i + 1}</td>
                {cfg.columns.map(c => <td key={c.id}>{editor(c, r)}</td>)}
                {(!lockedRows || childOn) && (
                  <td className="actions">
                    {!lockedRows && !sort && !filter && <>
                      <button className="btn icon" title="Move up" onClick={() => move(r._id, -1)}>↑</button>
                      <button className="btn icon" title="Move down" onClick={() => move(r._id, 1)}>↓</button>
                    </>}
                    {!lockedRows && <button className="btn icon" title="Duplicate" onClick={() => dup(r._id)}>⧉</button>}
                    {childOn && (r._childId
                      ? <span className="badge" title="Child work item">#{r._childId}</span>
                      : !lockedRows && <button className="btn icon" title={`Create ${cfg.child!.workItemType}`} disabled={p.busyChildren} onClick={() => p.onCreateChild(r._id)}>＋WI</button>)}
                    {!lockedRows && <button className="btn icon danger" title="Delete row" onClick={() => delRow(r._id)}>✕</button>}
                  </td>
                )}
              </tr>
            ))}
            {!visible.length && <tr><td colSpan={cfg.columns.length + 2} className="muted empty">{rows.length ? "No rows match the filter." : lockedRows ? (p.autoRows ? "Rows appear here automatically from the grid above." : "No rows.") : "No rows yet – click “Add row” or import a file."}</td></tr>}
          </tbody>
          {Object.keys(totals).length > 0 && (
            <tfoot>
              <tr>
                <td className="narrow" />
                {cfg.columns.map(c => (
                  <td key={c.id}>{c.total ? <strong title={`${c.total} of ${c.name}`}>{c.total === "count" ? "" : "Σ "}{totals[c.id]}{c.total === "avg" ? " avg" : c.total === "count" ? " items" : c.total === "min" ? " min" : c.total === "max" ? " max" : ""}</strong> : null}</td>
                ))}
                {(!lockedRows || childOn) && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {(sums.mapped.length > 0 || sums.groups.length > 0) && (
        <div className="sums">
          {sums.mapped.map((m, i) => <span key={i} className="sum" title={m.field ? `Saved to ${m.field}` : undefined}><span className="muted">{m.label}</span> <strong>{m.value}</strong></span>)}
          {sums.groups.map((g, i) => (
            <span key={"g" + i} className="sum group"><span className="muted">{g.title}:</span> {g.lines.length ? g.lines.map(l => <span key={l.label} className="gl" title={l.field ? `Saved to ${l.field}` : undefined}>{l.label} <strong>{l.value}</strong></span>) : <span className="muted">–</span>}</span>
          ))}
        </div>
      )}
      <div className="foot muted">
        {errors.length > 0 && <span className="err">{errors.length} value{errors.length > 1 ? "s" : ""} still need attention{cfg.blockSave ? " – the work item can't be saved until fixed" : ""} – hover red cells. </span>}
        {p.status}
      </div>
    </div>
  );
}
