import * as React from "react";
import { cellBand, columnTotals, newRow, optionsFor, recomputeAll, summaries, validateRows } from "../core/gridModel";
import { ColumnDef, GridConfig, GridRow } from "../core/types";
import { IdentityInput } from "./IdentityInput";
import { Actor, canDecide, decide, freshReview, isLocked, resetOnEdit, reviewColumns, stateOf } from "../core/review";

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
  /** approve / reject: who is looking (undefined until it is known: approved rows then stay locked) and the name stamped on decisions */
  review?: {
    actor?: Actor; actorName: string;
    /** secure approvals: records the decision in the protected field; resolves with what happened (error = Azure DevOps refused) */
    onDecide?(ids: string[], to: "approved" | "rejected"): Promise<{ changed: number; skipped: number; firstReason?: string; error?: string }>;
  };
  /** "Load preset" / "Save as preset" tools (source grids only) */
  presetTools?: {
    presets: { id: string; name: string; count: number }[];
    /** returns the ids of the rows that were added, so they can stay calm (no red highlighting) until touched */
    onLoad(id: string, mode: "add" | "replace"): string[];
    canSave: boolean;
    onSave(name: string): void;
  };
  /** hover text explaining where a (calculated) figure comes from, e.g. which tasks make up the hours */
  cellInfo?(row: GridRow, col: ColumnDef): string | undefined;
}

/** Two overlapping pages with a plus: "add a copy of this row". Drawn in the text colour so it follows light and dark themes. */
const DuplicateIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M5.5 3.5V3A1.5 1.5 0 0 1 7 1.5h6A1.5 1.5 0 0 1 14.5 3v6A1.5 1.5 0 0 1 13 10.5h-.5" />
    <rect x="1.5" y="5.5" width="9" height="9" rx="1.6" />
    <path d="M6 8v4M4 10h4" />
  </svg>
);

type SortState = { col: string; dir: 1 | -1 } | null;

export function Grid(p: GridProps) {
  const { cfg, rows, readOnly } = p;
  const lockedRows = readOnly || !!p.autoRows;
  const [sort, setSort] = React.useState<SortState>(null);
  const [filter, setFilter] = React.useState("");
  // rows added with "Add row" that the user has not touched yet: no red highlighting
  const [pristine, setPristine] = React.useState<Set<string>>(new Set());
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [presetPick, setPresetPick] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [saveName, setSaveName] = React.useState("");
  const pt = p.presetTools;
  const rv = cfg.review;
  const actor = p.review?.actor;
  const [reviewMsg, setReviewMsg] = React.useState("");
  const rowLocked = (r: GridRow) => !!rv && isLocked(r, cfg, actor);
  const reviewCols = React.useMemo(() => new Set(rv ? reviewColumns(rv) : []), [rv]);
  const pickedPreset = pt?.presets.find(x => x.id === presetPick);

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
    const target = rows.find(r => r._id === rowId);
    if (target && rowLocked(target)) return;
    if (pristine.has(rowId)) setPristine(s => { const n = new Set(s); n.delete(rowId); return n; });
    const adjustable = cfg.columns.find(c => c.id === col)?.derive?.adjustable;       // derived grids: remember the typed value as an adjustment
    const patch = adjustable ? { [col]: value, ["_adj_" + col]: value } : { [col]: value };
    const next = recomputeAll(rows.map(r => (r._id === rowId ? { ...r, ...patch } : r)), cfg);
    p.onChange(rv && !rv.secure ? resetOnEdit(rows, next, cfg) : next);          // an edited approved / rejected row goes back to pending review (when configured)
  };
  const addRow = () => { const r = newRow(cfg); setPristine(s => new Set(s).add(r._id)); p.onChange(recomputeAll([...rows, r], cfg)); };
  const delRow = (id: string) => { const t = rows.find(r => r._id === id); if (t && rowLocked(t)) return; p.onChange(recomputeAll(rows.filter(r => r._id !== id), cfg)); };
  const move = (id: string, d: number) => {
    const i = rows.findIndex(r => r._id === id), j = i + d;
    if (j < 0 || j >= rows.length || rowLocked(rows[i]) || rowLocked(rows[j])) return;
    const next = [...rows]; [next[i], next[j]] = [next[j], next[i]]; p.onChange(next);
  };
  const dup = (id: string) => {
    const i = rows.findIndex(r => r._id === id);
    const copy = { ...newRow(cfg), ...rows[i], _id: newRow(cfg)._id } as GridRow;
    delete copy._childId;
    const next = [...rows]; next.splice(i + 1, 0, rv ? freshReview(copy, rv) : copy); p.onChange(recomputeAll(next, cfg));
  };

  const doDecide = async (ids: string[], to: "approved" | "rejected") => {
    if (!rv || !actor) return;
    const verb = to === "approved" ? "Approved" : "Rejected";
    const say = (changed: number, skipped: number, firstReason?: string) =>
      setReviewMsg(changed || skipped ? `${verb} ${changed} row${changed === 1 ? "" : "s"}${skipped ? `; ${skipped} skipped: ${firstReason ?? "not allowed"}` : ""}.${changed ? " Save the work item to keep the decision." : ""}` : "Nothing to change.");
    if (p.review?.onDecide) {
      const res = await p.review.onDecide(ids, to);
      if (res.error) setReviewMsg(res.error); else say(res.changed, res.skipped, res.firstReason);
      return;
    }
    const res = decide(rows, new Set(ids), to, cfg, actor, p.review!.actorName);
    say(res.changed, res.skipped, res.firstReason);
    if (res.changed) p.onChange(recomputeAll(res.rows, cfg));
  };
  const decidable = (to: "approved" | "rejected") => (rv && actor ? visible.filter(r => stateOf(r, rv) !== to && canDecide(r, cfg, actor).ok).length : 0);

  const sums = React.useMemo(() => summaries(rows, cfg), [rows, cfg]);
  const childOn = !!cfg.child?.enabled;
  /** numbers are right-aligned (headers, cells and totals) so figures line up under their heading */
  const isNum = (c: ColumnDef) => {
    if (c.statusBands) return false;
    if (c.type === "number" || c.capacity || c.others) return true;
    if (c.type !== "calculated") return false;
    const vals = rows.map(r => r[c.id]).filter(v => v !== null && v !== undefined && v !== "");
    return vals.length > 0 && vals.every(v => typeof v === "number");
  };
  const numCols = React.useMemo(() => new Set(cfg.columns.filter(isNum).map(c => c.id)), [cfg, rows]);   // eslint-disable-line react-hooks/exhaustive-deps
  const rowStatus = cfg.rowColorBy ? cfg.columns.find(c => c.id === cfg.rowColorBy) : undefined;
  const pendingChildren = rows.filter(r => !r._childId).length;

  const editor = (c: ColumnDef, r: GridRow) => {
    const v = r[c.id];
    const isEnd = cfg.schedule?.end === c.id;
    const dis = readOnly || isEnd || rowLocked(r) || (reviewCols.has(c.id) && c.id !== rv?.reasonColumn) || !!c.formula || !!c.lookup || (!!c.derive && !c.derive.adjustable) || !!c.capacity || !!c.teamOf || !!c.others || c.type === "calculated";
    const cls = errKey(r._id, c.id) ? "cell err-cell" : "cell";
    const title = errKey(r._id, c.id) ?? p.cellInfo?.(r, c) ?? (isEnd && typeof r._schedNote === "string" ? r._schedNote : isEnd ? "Calculated from the start date, effort, allocation and the person's calendar" : undefined);
    switch (c.type) {
      case "calculated":
        return <input className="cell calc" type="text" disabled readOnly value={v === null || v === undefined ? "" : String(v)} title={c.formula} />;
      case "boolean":
        return <input type="checkbox" disabled={dis} checked={!!v} onChange={e => update(r._id, c.id, e.target.checked)} />;
      case "number":
        if (c.others) return <input className="cell calc" type="text" disabled readOnly value={v === null || v === undefined ? "" : String(v)} title="Hours this person has on all other Epics that month" />;
        if (c.capacity) return <input className="cell calc" type="text" disabled readOnly value={v === null || v === undefined ? "" : String(v)} placeholder="not registered" title={v === null || v === undefined ? "No capacity registered for this person and month (Capacity page)" : "From the Capacity register"} />;
        return <input className={cls + (typeof r["_adj_" + c.id] === "number" ? " adj" : "")} title={typeof r["_adj_" + c.id] === "number" ? "Adjusted by hand – clear the cell to use the calculated value again" : title} type="number" disabled={dis} value={v === null || v === undefined ? "" : String(v)}
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
          {pt && pt.presets.length > 0 && (
            <select value={presetPick} title="Add ready-made rows to this grid" onChange={e => {
              const id = e.target.value;
              setSaving(false);
              // nothing to add to or replace: load straight away, only ask when rows already exist
              if (id && rows.length === 0) { const ids = pt.onLoad(id, "add"); setPristine(new Set(ids)); setPresetPick(""); }
              else setPresetPick(id);
            }}>
              <option value="">Load preset…</option>{pt.presets.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          )}
          {rv && actor && rows.some(r => canDecide(r, cfg, actor).ok) && <>
            <button className="btn" disabled={!decidable("approved")} title="Approve every row shown that you are allowed to decide" onClick={() => doDecide(visible.map(r => r._id), "approved")}>Approve all ({decidable("approved")})</button>
            <button className="btn" disabled={!decidable("rejected")} title="Reject every row shown that you are allowed to decide" onClick={() => doDecide(visible.map(r => r._id), "rejected")}>Reject all ({decidable("rejected")})</button>
          </>}
          {pt?.canSave && <button className="btn" onClick={() => { setSaving(s => !s); setPresetPick(""); }} title="Keep the rows of this grid as a preset others can load">Save as preset…</button>}
          <span className="spacer" />
          {cfg.allowImport && <>
            <button className="btn" onClick={() => fileRef.current?.click()}>Import</button>
            <input ref={fileRef} type="file" accept=".csv,.xlsx" hidden onChange={e => { const f = e.target.files?.[0]; if (f) p.onImport(f); e.target.value = ""; }} />
          </>}
          <button className="btn" onClick={() => p.onExport("csv")}>CSV</button>
          <button className="btn" onClick={() => p.onExport("xlsx")}>Excel</button>
          {childOn && <button className="btn" disabled={p.busyChildren || !pendingChildren} onClick={p.onCreateAllChildren}>
            Create {cfg.child!.workItemType}s ({pendingChildren})</button>}
        </div>
      )}
      {!lockedRows && pickedPreset && pt && (
        <div className="toolbar presetbar">
          <span>Load <b>{pickedPreset.name}</b> ({pickedPreset.count} row{pickedPreset.count === 1 ? "" : "s"}):</span>
          <button className="btn primary" title="Keep the current rows and add the preset's rows that are not there yet"
            onClick={() => { const ids = pt.onLoad(pickedPreset.id, "add"); setPristine(s => { const n = new Set(s); ids.forEach(i => n.add(i)); return n; }); setPresetPick(""); }}>Add to existing rows</button>
          <button className="btn" title="Remove all current rows and start from the preset"
            onClick={() => { const ids = pt.onLoad(pickedPreset.id, "replace"); setPristine(new Set(ids)); setPresetPick(""); }}>Replace all rows{rows.length ? ` (removes ${rows.length})` : ""}</button>
          <button className="btn" onClick={() => setPresetPick("")}>Cancel</button>
        </div>
      )}
      {!lockedRows && saving && pt?.canSave && (
        <div className="toolbar presetbar">
          <input type="text" placeholder="Preset name" value={saveName} onChange={e => setSaveName(e.target.value)} style={{ width: 220 }} />
          <button className="btn primary" disabled={!saveName.trim() || !rows.length} onClick={() => { pt.onSave(saveName.trim()); setSaving(false); setSaveName(""); }}>Save preset</button>
          <button className="btn" onClick={() => setSaving(false)}>Cancel</button>
          <span className="muted">Keeps the typed-in values of the current rows (not people or dates). A preset with the same name is replaced.</span>
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
                <th key={c.id} className={numCols.has(c.id) ? "num" : undefined} style={{ minWidth: c.width }} onClick={() => setSort(s => (s?.col === c.id ? (s.dir === 1 ? { col: c.id, dir: -1 } : null) : { col: c.id, dir: 1 }))}>
                  {c.name}{c.required && <span className="err">*</span>}{c.formula && <span className="muted" title={c.formula}> ƒ</span>}{cfg.schedule?.end === c.id && <span className="muted" title="Calculated from the start date, effort, allocation and the person's calendar"> ƒ</span>}{c.lookup && <span className="muted" title={`Filled automatically from ${cfg.columns.find(x => x.id === c.lookup!.column)?.name ?? c.lookup.column}`}> ⇢</span>}
                  {sort?.col === c.id ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                </th>
              ))}
              {(!lockedRows || childOn || !!rv) && <th className="narrow" />}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r._id} className={rowStatus ? "row-" + (cellBand(rowStatus, r, cfg)?.color ?? "none") : undefined}>
                <td className="narrow muted">{i + 1}{rowLocked(r) && <span title="Approved: locked (only administrators can change it)"> 🔒</span>}</td>
                {cfg.columns.map(c => {
                  const band = c.statusBands || c.colorBy ? cellBand(c, r, cfg) : undefined;
                  const rvTint = rv && c.id === rv.statusColumn ? { approved: "tint-green", rejected: "tint-red", pending: "tint-yellow" }[stateOf(r, rv)] : "";
                  return <td key={c.id} className={[numCols.has(c.id) ? "num" : "", band ? "tint-" + band.color : "", rvTint, c.statusBands || rvTint ? "status" : ""].join(" ").trim() || undefined}>{editor(c, r)}</td>;
                })}
                {(!lockedRows || childOn || !!rv) && (
                  <td className="actions">
                    {rv && actor && !readOnly && canDecide(r, cfg, actor).ok && <>
                      {stateOf(r, rv) !== "approved" && <button className="btn" title="Approve this row" onClick={() => doDecide([r._id], "approved")}>Approve</button>}
                      {stateOf(r, rv) !== "rejected" && <button className="btn" title="Reject this row (type the reason in the comment column first, if you like)" onClick={() => doDecide([r._id], "rejected")}>Reject</button>}
                    </>}
                    {!lockedRows && !rowLocked(r) && !sort && !filter && <>
                      <button className="btn icon" title="Move up" aria-label="Move up" onClick={() => move(r._id, -1)}>↑</button>
                      <button className="btn icon" title="Move down" aria-label="Move down" onClick={() => move(r._id, 1)}>↓</button>
                    </>}
                    {!lockedRows && !rowLocked(r) && <button className="btn icon" title="Duplicate row" aria-label="Duplicate row" onClick={() => dup(r._id)}><DuplicateIcon /></button>}
                    {childOn && (r._childId
                      ? <span className="badge" title="Child work item">#{r._childId}</span>
                      : !lockedRows && <button className="btn icon" title={`Create ${cfg.child!.workItemType}`} disabled={p.busyChildren} onClick={() => p.onCreateChild(r._id)}>＋WI</button>)}
                    {!lockedRows && !rowLocked(r) && <button className="btn icon danger" title="Delete row" aria-label="Delete row" onClick={() => delRow(r._id)}>✕</button>}
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
                  <td key={c.id} className={numCols.has(c.id) ? "num" : undefined}>{c.total ? <strong title={`${c.total} of ${c.name}`}>{c.total === "count" ? "" : "Σ "}{totals[c.id]}{c.total === "avg" ? " avg" : c.total === "count" ? " items" : c.total === "min" ? " min" : c.total === "max" ? " max" : ""}</strong> : null}</td>
                ))}
                {(!lockedRows || childOn || !!rv) && <td />}
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
        {reviewMsg && <span>{reviewMsg} </span>}{p.status}
      </div>
    </div>
  );
}
