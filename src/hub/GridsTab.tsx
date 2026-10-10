import * as React from "react";
import { Aggregate, Breakdown, ColumnDef, ColumnType, GridConfig, GridRow, TotalMapping } from "../core/types";
import { newRow } from "../core/gridModel";
import { applySharedLookups, lookupValues } from "../core/sharedLookups";
import { capacityAllocation, capacityTemplate } from "../core/derived";
import { Grid } from "../grid/Grid";
import "../grid/grid.css";
import { LookupEditor } from "./LookupEditor";
import { csv, Ctx, delAt, FieldInput, setAt } from "./ui";
import { Issue } from "./validate";

const TYPES: ColumnType[] = ["string", "number", "boolean", "date", "dropdown", "identity", "calculated"];
const BUCKETS = ["day", "month", "quarter", "year"] as const;
const AGG: (Aggregate | "")[] = ["", "sum", "avg", "min", "max", "count"];

const mapToText = (m: Record<string, string[]>) => Object.entries(m).map(([k, v]) => `${k}: ${v.join(", ")}`).join("\n");
const textToMap = (t: string) => Object.fromEntries(t.split("\n").map(l => l.trim()).filter(Boolean).map(l => {
  const i = l.indexOf(":"); return i < 0 ? [l, []] : [l.slice(0, i).trim(), csv(l.slice(i + 1))];
}));

function LookupPanel(p: { col: ColumnDef; source?: ColumnDef; onChange(l: NonNullable<ColumnDef["lookup"]>): void }) {
  const { lookups, setLookups } = React.useContext(Ctx);
  const l = p.col.lookup!;
  const [newName, setNewName] = React.useState("");
  const srcOptions = p.source?.options ?? (p.source?.dependsOn ? Array.from(new Set(Object.values(p.source.dependsOn.map).flat())) : []);
  const names = Object.keys(lookups);
  const shared = l.table ? lookups[l.table] : undefined;
  return (
    <div>
      <label className="field"><span>Mapping</span>
        <select value={l.table ?? ""} onChange={e => p.onChange(e.target.value ? { column: l.column, map: {}, table: e.target.value } : { column: l.column, map: l.table ? { ...(lookups[l.table]?.map ?? {}) } : l.map, fallback: l.table ? lookups[l.table]?.fallback : l.fallback })}>
          <option value="">Custom – defined only for this column</option>
          {names.map(n => <option key={n} value={n}>Shared: {n}</option>)}
          {l.table && !names.includes(l.table) && <option value={l.table}>Shared: {l.table} (missing)</option>}
        </select></label>
      {l.table ? (
        <div className="card">
          <div className="help">Using the shared mapping “{l.table}”. Edit it once in the <b>Mappings</b> tab and every grid using it follows.</div>
          {shared ? <div>{Object.entries(shared.map).length} value(s) mapped · all other values → <b>{shared.fallback || "(blank)"}</b></div> : <div className="err">This mapping does not exist.</div>}
        </div>
      ) : (
        <>
          <LookupEditor value={{ map: l.map, fallback: l.fallback }} sourceName={p.source?.name ?? l.column} sourceOptions={srcOptions}
            onChange={v => p.onChange({ ...l, map: v.map, fallback: v.fallback })} />
          <div className="row">
            <input placeholder="Share this mapping as… (e.g. Resource type)" value={newName} onChange={e => setNewName(e.target.value)} />
            <button className="btn fixed" disabled={!newName.trim() || names.includes(newName.trim())} onClick={() => {
              const name = newName.trim(); setLookups({ ...lookups, [name]: { map: l.map, fallback: l.fallback } }); p.onChange({ column: l.column, map: {}, table: name }); setNewName("");
            }}>Make shared</button>
          </div>
        </>
      )}
    </div>
  );
}

function ColumnRow(p: { c: ColumnDef; others: ColumnDef[]; sourceCols?: ColumnDef[]; onChange(c: ColumnDef): void; onDelete(): void }) {
  const c = p.c;
  const [open, setOpen] = React.useState(false);
  const set = (patch: Partial<ColumnDef>) => p.onChange({ ...c, ...patch });
  return (
    <>
      <tr>
        <td><input value={c.id} onChange={e => set({ id: e.target.value.replace(/[^A-Za-z0-9_]/g, "") })} /></td>
        <td><input value={c.name} onChange={e => set({ name: e.target.value })} /></td>
        <td><select value={c.type} onChange={e => set({ type: e.target.value as ColumnType })}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></td>
        <td style={{ textAlign: "center" }}><input type="checkbox" checked={!!c.required} onChange={e => set({ required: e.target.checked })} /></td>
        <td><select value={c.total ?? ""} onChange={e => set({ total: (e.target.value || undefined) as Aggregate | undefined })}>{AGG.map(a => <option key={a} value={a}>{a || "—"}</option>)}</select></td>
        <td><button className="btn icon" onClick={() => setOpen(!open)}>{open ? "▾" : "▸"}</button><button className="btn icon danger" onClick={p.onDelete}>✕</button></td>
      </tr>
      {open && (
        <tr><td colSpan={6}>
          <div className="card">
            <div className="row">
              <label className="field" style={{ flex: 1 }}><span>Default value</span><input value={c.defaultValue === undefined ? "" : String(c.defaultValue)} onChange={e => set({ defaultValue: e.target.value === "" ? undefined : e.target.value })} /></label>
              <label className="field" style={{ flex: 2 }}><span>{c.type === "calculated" ? "Formula – use column ids, e.g. hours / capacity * 100, TOTAL(hours), IF(x > 100, \"Yes\", \"No\")" : "Formula (makes column computed)"}</span><input placeholder="[qty] * [price]" value={c.formula ?? ""} onChange={e => set({ formula: e.target.value || undefined })} /></label>
              {c.type === "number" && <>
                <label className="field" style={{ width: 80 }}><span>Min</span><input type="number" value={c.min ?? ""} onChange={e => set({ min: e.target.value === "" ? undefined : +e.target.value })} /></label>
                <label className="field" style={{ width: 80 }}><span>Max</span><input type="number" value={c.max ?? ""} onChange={e => set({ max: e.target.value === "" ? undefined : +e.target.value })} /></label>
              </>}
              <label className="field" style={{ width: 80 }}><span>Width (px)</span><input type="number" value={c.width ?? ""} onChange={e => set({ width: e.target.value === "" ? undefined : +e.target.value })} /></label>
            </div>
            {c.type === "calculated" && (
              <div className="row">
                <label className="field" style={{ width: 110 }}><span>Decimal places</span><input type="number" min={0} max={8} value={c.decimals ?? 2} onChange={e => set({ decimals: Math.max(0, Math.min(8, +e.target.value || 0)) })} /></label>
                <label className="field" style={{ flex: 1 }}><span>When an input is empty</span>
                  <select value={c.onEmpty ?? "blank"} onChange={e => set({ onEmpty: e.target.value as "blank" | "zero" })}><option value="blank">Leave blank (recommended)</option><option value="zero">Count as 0</option></select></label>
                <label className="field" style={{ flex: 1 }}><span>Division by zero</span>
                  <select value={c.onDivZero ?? "blank"} onChange={e => set({ onDivZero: e.target.value as "blank" | "zero" })}><option value="blank">Leave blank (recommended)</option><option value="zero">Result is 0</option></select></label>
              </div>
            )}
            {p.sourceCols && (
              <div className="card">
                <div className="row">
                  <label className="field" style={{ flex: 1 }}><span>Where does this column's value come from?</span>
                    <select value={c.capacity ? "register" : c.others ? "others" : c.derive?.role ?? ""} onChange={e => {
                      const v = e.target.value;
                      if (v === "others") { const keys = p.others.filter(o => o.derive?.role === "key"); set({ derive: undefined, capacity: undefined, others: { resource: keys[0]?.id ?? "", period: keys[1]?.id ?? "" } }); return; }
                      if (v === "register") { const keys = p.others.filter(o => o.derive?.role === "key"); set({ derive: undefined, capacity: { resource: keys[0]?.id ?? "", period: keys[1]?.id ?? "" } }); }
                      else set({ capacity: undefined, others: undefined, derive: v ? { role: v as "key" | "first" | "agg", source: c.derive?.source ?? "", aggregate: v === "agg" ? c.derive?.aggregate ?? "sum" : undefined } : undefined });
                    }}>
                      <option value="">Entered by the user / calculated here</option>
                      <option value="register">From the Capacity register (hours available for the person and month)</option>
                      <option value="others">Hours on all OTHER Epics (person and month, from the central store)</option>
                      <option value="key">Source column – KEY (one row per distinct value)</option>
                      <option value="first">Source column – first value in the group</option>
                      <option value="agg">Source column – aggregate (sum, …)</option>
                    </select></label>
                  {(c.capacity || c.others) && (() => { const ref = (c.capacity ?? c.others)!; const upd = (patch: Partial<{ resource: string; period: string }>) => set(c.capacity ? { capacity: { ...ref, ...patch } } : { others: { ...ref, ...patch } }); return (<>
                    <label className="field" style={{ flex: 1 }}><span>Person column (key)</span>
                      <select value={ref.resource} onChange={e => upd({ resource: e.target.value })}><option value="" />{p.others.filter(o => o.id !== c.id).map(o => <option key={o.id} value={o.id}>{o.name} ({o.id})</option>)}</select></label>
                    <label className="field" style={{ flex: 1 }}><span>Month column (key, grouped by month)</span>
                      <select value={ref.period} onChange={e => upd({ period: e.target.value })}><option value="" />{p.others.filter(o => o.id !== c.id).map(o => <option key={o.id} value={o.id}>{o.name} ({o.id})</option>)}</select></label>
                  </>); })()}
                  {c.derive && <label className="field" style={{ flex: 1 }}><span>Source column</span>
                    <select value={c.derive.source} onChange={e => set({ derive: { ...c.derive!, source: e.target.value } })}><option value="" />{p.sourceCols.map(sc => <option key={sc.id} value={sc.id}>{sc.name} ({sc.id})</option>)}</select></label>}
                  {c.derive?.role === "agg" && <label className="field" style={{ width: 100 }}><span>Aggregate</span>
                    <select value={c.derive.aggregate ?? "sum"} onChange={e => set({ derive: { ...c.derive!, aggregate: e.target.value as Aggregate } })}>{AGG.filter(Boolean).map(a => <option key={a}>{a}</option>)}</select></label>}
                  {c.derive?.role === "key" && p.sourceCols.find(sc => sc.id === c.derive!.source)?.type === "date" && <label className="field" style={{ width: 120 }}><span>Group dates by</span>
                    <select value={c.derive.bucket ?? "day"} onChange={e => set({ derive: { ...c.derive!, bucket: e.target.value as (typeof BUCKETS)[number] } })}>{BUCKETS.map(b => <option key={b}>{b}</option>)}</select></label>}
                </div>
              </div>
            )}
            {c.type !== "identity" && c.type !== "boolean" && c.type !== "calculated" && (
              <>
                <label className="field"><span>Auto-fill from another column (read-only; the user does not pick a value)</span>
                  <select value={c.lookup?.column ?? ""} onChange={e => set({ lookup: e.target.value ? { ...(c.lookup ?? { map: {} }), column: e.target.value } : undefined })}>
                    <option value="">— none (user enters the value) —</option>{p.others.filter(o => o.id !== c.id).map(o => <option key={o.id} value={o.id}>{o.name} ({o.id})</option>)}
                  </select></label>
                {c.lookup && <LookupPanel key={(c.lookup.table ?? "") + "|" + c.lookup.column} col={c} source={p.others.find(o => o.id === c.lookup!.column)} onChange={lookup => set({ lookup })} />}
              </>
            )}
            {c.type === "identity" && (
              <label><input type="checkbox" checked={c.identityGroups !== false} onChange={e => set({ identityGroups: e.target.checked })} /> Also search groups (AD / Azure AD / project groups)</label>
            )}
            {c.type === "dropdown" && (
              <>
                <label className="field"><span>Options (comma separated){c.dependsOn ? " – ignored while “depends on” is set" : ""}</span>
                  <input defaultValue={(c.options ?? []).join(", ")} onBlur={e => set({ options: csv(e.target.value) })} /></label>
                <label className="field"><span>Depends on column</span>
                  <select value={c.dependsOn?.column ?? ""} onChange={e => set({ dependsOn: e.target.value ? { column: e.target.value, map: c.dependsOn?.map ?? {} } : undefined })}>
                    <option value="">— none (independent) —</option>{p.others.filter(o => o.id !== c.id).map(o => <option key={o.id} value={o.id}>{o.name} ({o.id})</option>)}
                  </select></label>
                {c.dependsOn && <label className="field"><span>One line per parent value – <code>ParentValue: option1, option2</code></span>
                  <textarea rows={Math.max(3, Object.keys(c.dependsOn.map).length + 1)} defaultValue={mapToText(c.dependsOn.map)}
                    onBlur={e => set({ dependsOn: { column: c.dependsOn!.column, map: textToMap(e.target.value) } })} /></label>}
              </>
            )}
          </div>
        </td></tr>
      )}
    </>
  );
}

function Preview({ cfg: raw }: { cfg: GridConfig }) {
  const { lookups } = React.useContext(Ctx);
  const cfg = React.useMemo(() => applySharedLookups(raw, lookups), [raw, lookups]);
  const [rows, setRows] = React.useState<GridRow[]>([]);
  React.useEffect(() => { setRows(r => r.length ? r : cfg.columns.length ? [newRow(cfg), newRow(cfg)] : []); }, [cfg]);
  return <Grid cfg={{ ...cfg, readOnly: false }} rows={rows} readOnly={false} projectId="" busyChildren={false} status="" onChange={setRows}
    onCreateChild={() => undefined} onCreateAllChildren={() => undefined} onImport={() => undefined} onExport={() => undefined} />;
}

function Editor(p: { name: string; g: GridConfig; grids: Record<string, GridConfig>; onChange(g: GridConfig): void; issues: Issue[] }) {
  const g = p.g;
  const sourceNames = Object.keys(p.grids).filter(n => n !== p.name && !p.grids[n].derived);
  const source = g.derived ? p.grids[g.derived.source] : undefined;
  const [pick, setPick] = React.useState({ resource: "", period: "", hours: "", team: "" });
  const [fromRegister, setFromRegister] = React.useState(true);
  const { lookups } = React.useContext(Ctx);
  const effective = React.useMemo(() => applySharedLookups(g, lookups), [g, lookups]);
  const child = g.child ?? { enabled: false, workItemType: "Task", titleColumn: "", fieldMap: {} };
  return (
    <div>
      <div className="row">
        <label className="field" style={{ flex: 1 }}><span>Data field (long-text field that stores the rows as JSON)</span><FieldInput value={g.dataField ?? ""} onChange={dataField => p.onChange({ ...g, dataField })} placeholder="Custom.GridData" /></label>
        <label className="fixed"><input type="checkbox" checked={!!g.readOnly} onChange={e => p.onChange({ ...g, readOnly: e.target.checked })} /> Read-only</label>
      </div>
      <label title="Off: required/invalid cells are only highlighted. On: the work item cannot be saved while any exist."><input type="checkbox" checked={!!g.blockSave} onChange={e => p.onChange({ ...g, blockSave: e.target.checked })} /> Block saving the work item while required values are missing</label>
      <h3>Build this grid automatically from another grid</h3>
      <label><input type="checkbox" checked={!!g.derived} onChange={e => p.onChange({ ...g, derived: e.target.checked ? { source: sourceNames[0] ?? "" } : undefined })} disabled={!g.derived && !sourceNames.length} /> This is a derived grid (rows are created from the source grid, e.g. Resource Capacity from the timesheet)</label>
      {g.derived && (
        <div className="card">
          <div className="row">
            <label className="field" style={{ flex: 1 }}><span>Source grid</span>
              <select value={g.derived.source} onChange={e => p.onChange({ ...g, derived: { source: e.target.value } })}><option value="" />{sourceNames.map(n => <option key={n}>{n}</option>)}</select></label>
          </div>
          <div className="help">The source grid's control shows this grid below it. Mark which columns are <b>keys</b> (one row per distinct combination), carried or summed from the source; other columns stay manual or calculated. It needs its own long-text data field.</div>
          <div className="card">
            <label><input type="checkbox" checked={!!g.allocation} onChange={e => p.onChange({ ...g, allocation: e.target.checked ? capacityAllocation() : undefined })} /> <b>Publish this grid's hours</b> (per person and month) so other Epics can count them in “Hours (other Epics)”. Published when the work item is saved.</label>
            {g.allocation && (
              <div className="row">
                {([["resource", "Person column"], ["period", "Month column"], ["hours", "Hours column"]] as const).map(([k, label]) => (
                  <label className="field" key={k} style={{ flex: 1 }}><span>{label}</span>
                    <select value={g.allocation![k]} onChange={e => p.onChange({ ...g, allocation: { ...g.allocation!, [k]: e.target.value } })}><option value="" />{g.columns.map(c => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}</select></label>
                ))}
              </div>
            )}
          </div>
          {source && (
            <>
              <div className="help"><b>Quick start – Resource capacity:</b> choose the source columns and generate the standard columns (Resource, Period by month, Team, Hours this Epic / other Epics / total, Available Capacity, Utilization % across all Epics, This Epic %, Over capacity) and turn on publishing of this Epic's hours.</div>
              <label><input type="checkbox" checked={fromRegister} onChange={e => setFromRegister(e.target.checked)} /> Take Available Capacity from the central <b>Capacity register</b> (recommended – managers enter it once on the Capacity page)</label>
              <div className="row">
                {([["resource", "Resource"], ["period", "Period (date)"], ["hours", "Hours"], ["team", "Team (optional)"]] as const).map(([k, label]) => (
                  <label className="field" key={k} style={{ flex: 1 }}><span>{label}</span>
                    <select value={pick[k]} onChange={e => setPick({ ...pick, [k]: e.target.value })}><option value="" />{source.columns.map(sc => <option key={sc.id} value={sc.id}>{sc.name}</option>)}</select></label>
                ))}
                <button className="btn fixed" disabled={!pick.resource || !pick.period || !pick.hours}
                  onClick={() => p.onChange({ ...g, columns: capacityTemplate({ ...pick, team: pick.team || undefined }, { fromRegister }), allocation: capacityAllocation() })}>{g.columns.length ? "Generate columns (replaces current)" : "Generate columns"}</button>
              </div>
            </>
          )}
        </div>
      )}
      <h3>Columns</h3>
      <table className="cols">
        <thead><tr><th>Id</th><th>Header</th><th>Type</th><th>Req.</th><th>Total</th><th /></tr></thead>
        <tbody>{g.columns.map((c, i) => <ColumnRow key={i} c={c} others={g.columns} sourceCols={source?.columns} onChange={nc => p.onChange({ ...g, columns: setAt(g.columns, i, nc) })} onDelete={() => p.onChange({ ...g, columns: delAt(g.columns, i) })} />)}</tbody>
      </table>
      <button className="btn" onClick={() => { let n = g.columns.length + 1; while (g.columns.some(c => c.id === "col" + n)) n++; p.onChange({ ...g, columns: [...g.columns, { id: "col" + n, name: "Column " + n, type: "string" }] }); }}>+ Add column</button>
      <h3>Push totals to work item fields</h3>
      <div className="help">Whenever rows change, the aggregate is written to the chosen numeric field (e.g. Original Estimate).</div>
      {(g.totals ?? []).map((t, i) => {
        const setT = (patch: Partial<TotalMapping>) => p.onChange({ ...g, totals: setAt(g.totals!, i, { ...t, ...patch }) });
        return (
          <div className="card" key={i}>
            <div className="row">
              <select className="fixed" value={t.aggregate} onChange={e => setT({ aggregate: e.target.value as Aggregate })}>{AGG.filter(Boolean).map(a => <option key={a}>{a}</option>)}</select>
              <span className="fixed">of</span>
              <select className="fixed" value={t.column} onChange={e => setT({ column: e.target.value })}><option value="" />{g.columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <span className="fixed">→</span>
              <FieldInput value={t.field} onChange={field => setT({ field })} placeholder="Custom.CapitalizableManHours" />
              <button className="btn icon danger fixed" onClick={() => p.onChange({ ...g, totals: delAt(g.totals!, i) })}>✕</button>
            </div>
            <div className="row">
              <span className="fixed">only rows where</span>
              <select className="fixed" value={t.where?.column ?? ""} onChange={e => setT({ where: e.target.value ? { column: e.target.value, values: t.where?.values ?? [] } : undefined })}>
                <option value="">(all rows)</option>{g.columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              {t.where && <>
                <span className="fixed">is</span>
                <input placeholder="value, or several separated by commas" defaultValue={t.where.values.join(", ")} key={t.where.column}
                  onBlur={e => setT({ where: { column: t.where!.column, values: csv(e.target.value) } })} />
              </>}
              <input placeholder="Label shown under the grid (optional)" value={t.label ?? ""} onChange={e => setT({ label: e.target.value || undefined })} />
            </div>
          </div>
        );
      })}
      <button className="btn" onClick={() => p.onChange({ ...g, totals: [...(g.totals ?? []), { column: g.columns[0]?.id ?? "", aggregate: "sum", field: "" }] })}>+ Add total mapping</button>
      <h3>Grouped totals (breakdown by value)</h3>
      <div className="help">Shows one figure per value, e.g. “Sum of Hours by Treatment: Expense 12 · Capitalizable 30”, and can write each one to its own work item field.</div>
      {(g.breakdowns ?? []).map((b, i) => {
        const setB = (patch: Partial<Breakdown>) => p.onChange({ ...g, breakdowns: setAt(g.breakdowns!, i, { ...b, ...patch }) });
        const by = effective.columns.find(c => c.id === b.by);
        const known = by ? Array.from(new Set(by.options ?? (by.lookup ? lookupValues(by) : by.dependsOn ? Object.values(by.dependsOn.map).flat() : []))) : [];
        const fields = b.fields ?? {};
        const setField = (group: string, field: string) => { const f = { ...fields }; if (field) f[group] = field; else delete f[group]; setB({ fields: f }); };
        const extra = Object.keys(fields).filter(k => !known.some(x => x.toLowerCase() === k.toLowerCase()));
        return (
          <div className="card" key={i}>
            <div className="row">
              <select className="fixed" value={b.aggregate} onChange={e => setB({ aggregate: e.target.value as Aggregate })}>{AGG.filter(Boolean).map(a => <option key={a}>{a}</option>)}</select>
              <span className="fixed">of</span>
              <select className="fixed" value={b.column} onChange={e => setB({ column: e.target.value })}><option value="" />{g.columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <span className="fixed">by</span>
              <select className="fixed" value={b.by} onChange={e => setB({ by: e.target.value })}><option value="" />{g.columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <input placeholder="Title (optional)" value={b.label ?? ""} onChange={e => setB({ label: e.target.value || undefined })} />
              <button className="btn icon danger fixed" onClick={() => p.onChange({ ...g, breakdowns: delAt(g.breakdowns!, i) })}>✕</button>
            </div>
            {b.by && <>
              <div className="help">Write each group's figure to a work item field (leave blank to only display it):</div>
              {known.map(k => (
                <div className="row" key={k}><span className="fixed" style={{ width: 160 }}>{k}</span><span className="fixed">→</span>
                  <FieldInput value={fields[k] ?? ""} placeholder="(not saved to a field)" onChange={v => setField(k, v)} /></div>
              ))}
              {extra.map(k => (
                <div className="row" key={k}><span className="fixed" style={{ width: 160 }}>{k}</span><span className="fixed">→</span>
                  <FieldInput value={fields[k]} onChange={v => setField(k, v)} /></div>
              ))}
              {!known.length && <div className="row"><input placeholder="Group value to map, then press Enter" onKeyDown={e => { if (e.key === "Enter" && e.currentTarget.value.trim()) { setField(e.currentTarget.value.trim(), "Custom."); e.currentTarget.value = ""; } }} /></div>}
            </>}
          </div>
        );
      })}
      <button className="btn" onClick={() => p.onChange({ ...g, breakdowns: [...(g.breakdowns ?? []), { by: "", column: "", aggregate: "sum" }] })}>+ Add breakdown</button>
      <h3>Create child work items from rows</h3>
      <label><input type="checkbox" checked={child.enabled} onChange={e => p.onChange({ ...g, child: { ...child, enabled: e.target.checked } })} /> Enable “create work item” buttons</label>
      {child.enabled && (
        <div className="card">
          <div className="row">
            <label className="field" style={{ flex: 1 }}><span>Child work item type</span><input value={child.workItemType} onChange={e => p.onChange({ ...g, child: { ...child, workItemType: e.target.value } })} /></label>
            <label className="field" style={{ flex: 1 }}><span>Title column</span>
              <select value={child.titleColumn} onChange={e => p.onChange({ ...g, child: { ...child, titleColumn: e.target.value } })}><option value="" />{g.columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          </div>
          <div className="help">Map other columns to child fields (e.g. Owner → System.AssignedTo, Hours → Microsoft.VSTS.Scheduling.OriginalEstimate). Area/Iteration path are copied from the parent; the child is linked as a child of the parent.</div>
          {g.columns.filter(c => c.id !== child.titleColumn).map(c => (
            <div className="row" key={c.id}><span className="fixed" style={{ width: 140 }}>{c.name}</span><span className="fixed">→</span>
              <FieldInput value={child.fieldMap[c.id] ?? ""} placeholder="(not mapped)" onChange={v => p.onChange({ ...g, child: { ...child, fieldMap: { ...child.fieldMap, [c.id]: v } } })} /></div>
          ))}
        </div>
      )}
      <h3>Preview</h3>
      {g.derived ? <div className="help">A derived grid fills itself from the source grid on the work item, so there is nothing to preview here.</div> : <Preview cfg={g} />}
      {p.issues.length > 0 && <div className="issues" style={{ marginTop: 12 }}>{p.issues.map((x, i) => <div key={i} className={"issue " + x.level}>{x.message}</div>)}</div>}
      {g.derived ? (
        <div className="help" style={{ marginTop: 10 }}>Nothing to add to the layout for this grid: it appears automatically under the <b>{g.derived.source || "source"}</b> grid. Only create its data field (<code>{g.dataField || "a long-text field"}</code>) on the work item type – you can hide that field from the layout.</div>
      ) : (
        <div className="help" style={{ marginTop: 10 }}>Use it: Organization settings → Process → your work item type → Layout → add the <b>Smart Grid</b> custom control on the data field and set <b>Grid name</b> to <code>{p.name}</code>. Leave the control's own “Data field” input empty so this grid's data field above is the only one.</div>
      )}
    </div>
  );
}

export function GridsTab(p: { grids: Record<string, GridConfig>; onChange(g: Record<string, GridConfig>): void; issues: Issue[] }) {
  const names = Object.keys(p.grids);
  const [sel, setSel] = React.useState(names[0] ?? "");
  const cur = names.includes(sel) ? sel : names[0];
  const add = () => {
    let n = 1; while (p.grids["Grid " + n]) n++;
    const name = "Grid " + n;
    p.onChange({ ...p.grids, [name]: { columns: [{ id: "name", name: "Name", type: "string", required: true }, { id: "hours", name: "Hours", type: "number", total: "sum" }], totals: [] } });
    setSel(name);
  };
  const rename = (from: string, to: string) => {
    if (!to || to === from || p.grids[to]) return;
    const out: Record<string, GridConfig> = {}; for (const k of names) out[k === from ? to : k] = p.grids[k];
    p.onChange(out); setSel(to);
  };
  return (
    <div className="split">
      <div>
        <div className="list">
          {names.map(n => <div key={n} className={"item" + (n === cur ? " on" : "")} onClick={() => setSel(n)}>
            <span className="name">{n}</span>{p.issues.some(x => x.where === `Grid “${n}”` && x.level === "error") && <span className="badge err">!</span>}</div>)}
          {!names.length && <div className="item muted">No grids yet</div>}
        </div>
        <div className="toolbar"><button className="btn primary" onClick={add}>+ New grid</button>
          {cur && <button className="btn danger" onClick={() => { const o = { ...p.grids }; delete o[cur]; p.onChange(o); }}>Delete</button>}</div>
      </div>
      <div className="card">
        {cur ? <>
          <label className="field"><span>Grid name (referenced by the form control)</span>
            <input defaultValue={cur} key={cur} onBlur={e => rename(cur, e.target.value.trim())} /></label>
          <Editor name={cur} grids={p.grids} g={p.grids[cur]} onChange={g => p.onChange({ ...p.grids, [cur]: g })} issues={p.issues.filter(x => x.where === `Grid “${cur}”`)} />
        </> : <div className="muted">Create a grid to define columns, formulas, totals and child item creation.</div>}
      </div>
    </div>
  );
}
