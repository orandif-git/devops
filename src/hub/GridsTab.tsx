import * as React from "react";
import { Aggregate, ApproverRule, Breakdown, ColumnDef, ColumnType, GridConfig, GridPreset, GridRow, ReviewConfig, StatusBand, StatusColor, TotalMapping } from "../core/types";
import { newRow } from "../core/gridModel";
import { applySharedLookups, lookupValues } from "../core/sharedLookups";
import { CAPACITY_BANDS, CAPACITY_ROW_COLOR, capacityAllocation, capacityTemplate, TEAM_FROM_CAPACITY } from "../core/derived";
import { needsScheduledRemap, remapToScheduled, SCHEDULE_VIRTUAL, withSchedule } from "../core/schedule";
import { Grid } from "../grid/Grid";
import { defaultPresetColumns } from "../core/presets";
import { DEFAULT_STATUSES, withReview } from "../core/review";
import { IdentityInput } from "../grid/IdentityInput";
import { getProject } from "../shared/ado";
import { listTeams, TeamRef } from "../shared/capacityStore";
import "../grid/grid.css";
import { LookupEditor } from "./LookupEditor";
import { csv, Ctx, delAt, FieldInput, setAt } from "./ui";
import { Issue } from "./validate";

const TYPES: ColumnType[] = ["string", "number", "boolean", "date", "dropdown", "identity", "calculated"];
const COLORS: StatusColor[] = ["green", "yellow", "orange", "red", "blue", "gray"];
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

/** Edit "Status from a number": ranges with label and colour, e.g. 0-70 Available (green). */
function StatusEditor(p: { col: ColumnDef; numeric: ColumnDef[]; onChange(sb: ColumnDef["statusBands"]): void }) {
  const sb = p.col.statusBands!;
  const set = (ranges: StatusBand[]) => p.onChange({ ...sb, ranges });
  return (
    <div className="card">
      <div className="help">The label is picked automatically from the number: the first range whose “up to” value is not exceeded wins. Leave “up to” empty on the last range for “and above”.</div>
      <div className="row"><label className="field" style={{ flex: 1 }}><span>Number column</span>
        <select value={sb.source} onChange={e => p.onChange({ ...sb, source: e.target.value })}><option value="" />{p.numeric.map(c => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}</select></label>
        <button className="btn fixed" onClick={() => set(CAPACITY_BANDS.map(b => ({ ...b })))} title="0–70 Available, up to 90 Near Capacity, up to 100 Fully Allocated, above Overallocated">Use capacity status preset</button></div>
      {sb.ranges.map((r, i) => (
        <div className="row" key={i}>
          <span className="fixed">up to</span>
          <input className="fixed" style={{ width: 90 }} type="number" placeholder="no limit" value={r.upTo ?? ""} onChange={e => set(setAt(sb.ranges, i, { ...r, upTo: e.target.value === "" || Number.isNaN(+e.target.value) ? null : +e.target.value }))} />
          <span className="fixed">→</span>
          <input placeholder="Label, e.g. Available" value={r.label} onChange={e => set(setAt(sb.ranges, i, { ...r, label: e.target.value }))} />
          <select className="fixed" value={r.color} onChange={e => set(setAt(sb.ranges, i, { ...r, color: e.target.value as StatusColor }))}>{COLORS.map(c => <option key={c}>{c}</option>)}</select>
          <span className={"badge"} style={{ background: `var(--tint-${r.color}, transparent)` }}>{r.color}</span>
          <button className="btn icon danger fixed" onClick={() => set(delAt(sb.ranges, i))}>✕</button>
        </div>
      ))}
      <button className="btn" onClick={() => set([...sb.ranges, { upTo: null, label: "", color: "gray" }])}>+ Add range</button>
    </div>
  );
}

function ColumnRow(p: { c: ColumnDef; others: ColumnDef[]; statusCols: ColumnDef[]; sourceCols?: ColumnDef[]; open: boolean; onToggle(): void; canUp: boolean; canDown: boolean; onMove(d: -1 | 1): void; onChange(c: ColumnDef): void; onDelete(): void }) {
  const c = p.c;
  const open = p.open;
  const set = (patch: Partial<ColumnDef>) => p.onChange({ ...c, ...patch });
  return (
    <>
      <tr>
        <td><input value={c.id} onChange={e => set({ id: e.target.value.replace(/[^A-Za-z0-9_]/g, "") })} /></td>
        <td><input value={c.name} onChange={e => set({ name: e.target.value })} /></td>
        <td><select value={c.type} onChange={e => set({ type: e.target.value as ColumnType })}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></td>
        <td style={{ textAlign: "center" }}><input type="checkbox" checked={!!c.required} onChange={e => set({ required: e.target.checked })} /></td>
        <td><select value={c.total ?? ""} onChange={e => set({ total: (e.target.value || undefined) as Aggregate | undefined })}>{AGG.map(a => <option key={a} value={a}>{a || "—"}</option>)}</select></td>
        <td style={{ whiteSpace: "nowrap" }}><button className="btn icon" title="Move column up" aria-label="Move column up" disabled={!p.canUp} onClick={() => p.onMove(-1)}>↑</button><button className="btn icon" title="Move column down" aria-label="Move column down" disabled={!p.canDown} onClick={() => p.onMove(1)}>↓</button><button className="btn icon" title={open ? "Hide settings" : "Show settings"} onClick={p.onToggle}>{open ? "▾" : "▸"}</button><button className="btn icon danger" title="Delete column" onClick={p.onDelete}>✕</button></td>
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
            <label className="field"><span>Status from a number (e.g. Capacity Status from Utilization %)</span>
              <select value={c.statusBands ? "on" : ""} onChange={e => set({ statusBands: e.target.value ? { source: p.others.find(o => o.type === "number" || o.type === "calculated")?.id ?? "", ranges: CAPACITY_BANDS.map(b => ({ ...b })) } : undefined })}>
                <option value="">No – this column is a normal column</option><option value="on">Yes – fill it automatically from ranges of a number column</option></select></label>
            {c.statusBands && <StatusEditor col={c} numeric={p.others.filter(o => o.id !== c.id && (o.type === "number" || o.type === "calculated"))} onChange={statusBands => set({ statusBands })} />}
            {p.statusCols.some(sc => sc.id !== c.id) && !c.statusBands && (
              <label className="field"><span>Colour this column's cells like a status column</span>
                <select value={c.colorBy ?? ""} onChange={e => set({ colorBy: e.target.value || undefined })}><option value="">No colour</option>{p.statusCols.filter(sc => sc.id !== c.id).map(sc => <option key={sc.id} value={sc.id}>{sc.name}</option>)}</select></label>
            )}
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
                    <select value={c.capacity ? "register" : c.teamOf ? "team" : c.others ? "others" : c.derive?.role ?? ""} onChange={e => {
                      const v = e.target.value;
                      if (v === "others") { const keys = p.others.filter(o => o.derive?.role === "key"); set({ derive: undefined, capacity: undefined, teamOf: undefined, others: { resource: keys[0]?.id ?? "", period: keys[1]?.id ?? "" } }); return; }
                      if (v === "team") { const keys = p.others.filter(o => o.derive?.role === "key"); set({ derive: undefined, capacity: undefined, others: undefined, teamOf: { resource: keys[0]?.id ?? "" } }); return; }
                      if (v === "register") { const keys = p.others.filter(o => o.derive?.role === "key"); set({ derive: undefined, teamOf: undefined, capacity: { resource: keys[0]?.id ?? "", period: keys[1]?.id ?? "" } }); }
                      else set({ capacity: undefined, others: undefined, teamOf: undefined, derive: v ? { role: v as "key" | "first" | "agg", source: c.derive?.source ?? "", aggregate: v === "agg" ? c.derive?.aggregate ?? "sum" : undefined } : undefined });
                    }}>
                      <option value="">Entered by the user / calculated here</option>
                      <option value="register">From the Capacity register (hours available for the person and month)</option>
                      <option value="team">The person's team (from the capacity source)</option>
                      <option value="others">Hours on all OTHER Epics (person and month, from the central store)</option>
                      <option value="key">Source column – KEY (one row per distinct value)</option>
                      <option value="first">Source column – first value in the group</option>
                      <option value="agg">Source column – aggregate (sum, …)</option>
                    </select></label>
                  {c.teamOf && <label className="field" style={{ flex: 1 }}><span>Person column (key)</span>
                    <select value={c.teamOf.resource} onChange={e => set({ teamOf: { resource: e.target.value } })}><option value="" />{p.others.filter(o => o.id !== c.id).map(o => <option key={o.id} value={o.id}>{o.name} ({o.id})</option>)}</select></label>}
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
                  {c.derive?.role === "agg" && <label className="fixed" title="The user can type a different value on a row (for example a month that differs from the schedule); clearing it restores the calculated value."><input type="checkbox" checked={!!c.derive.adjustable} onChange={e => set({ derive: { ...c.derive!, adjustable: e.target.checked || undefined } })} /> Allow manual adjustment</label>}
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
                {c.lookup && (() => {
                  const boxes = p.others.filter(o => o.type === "boolean" && o.id !== c.id);
                  const ov = c.overrides ?? [];
                  const upd = (i: number, patch: Partial<{ when: string; value: string }>) => set({ overrides: ov.map((o, j) => (j === i ? { ...o, ...patch } : o)) });
                  return (
                    <div className="field">
                      <span>Overrides – when a checkbox is ticked, use this value instead of the mapping (first ticked rule wins)</span>
                      {ov.map((o, i) => (
                        <div key={i} className="row" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                          <span>When</span>
                          <select value={o.when} onChange={e => upd(i, { when: e.target.value })}><option value="" />{boxes.map(b => <option key={b.id} value={b.id}>{b.name} ({b.id})</option>)}</select>
                          <span>is ticked →</span>
                          <input defaultValue={o.value} placeholder="value, e.g. Capitalizable" onBlur={e => upd(i, { value: e.target.value })} />
                          <button type="button" onClick={() => set({ overrides: ov.filter((_, j) => j !== i).length ? ov.filter((_, j) => j !== i) : undefined })}>✕</button>
                        </div>
                      ))}
                      <div><button type="button" disabled={!boxes.length} title={boxes.length ? "" : "Add a checkbox column first"} onClick={() => set({ overrides: [...ov, { when: boxes[0]?.id ?? "", value: "" }] })}>+ Add override</button></div>
                    </div>
                  );
                })()}
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


/** Ready-made rows ("presets") for a grid: which rows, which columns they keep, when they are offered, and who may save new ones. */
function PresetsEditor(p: { g: GridConfig; effective: GridConfig; onChange(g: GridConfig): void }) {
  const { g } = p;
  const presets = g.presets ?? [];
  const [sel, setSel] = React.useState(0);
  const [teams, setTeams] = React.useState<TeamRef[]>([]);
  React.useEffect(() => { getProject().then(pr => listTeams(pr.id)).then(setTeams).catch(() => undefined); }, []);
  const cur: GridPreset | undefined = presets[Math.min(sel, presets.length - 1)];
  const idx = cur ? presets.indexOf(cur) : -1;
  const setPresets = (list: GridPreset[]) => p.onChange({ ...g, presets: list.length ? list : undefined });
  const setCur = (patch: Partial<GridPreset>) => setPresets(setAt(presets, idx, { ...cur!, ...patch }));
  const reviewIds = new Set(g.review ? [g.review.statusColumn, g.review.byColumn, g.review.atColumn, g.review.reasonColumn] : []);
  const typed = p.effective.columns.filter(c => !reviewIds.has(c.id) && !c.lookup && !c.formula && !c.statusBands && !c.derive && !c.capacity && !c.others && !c.teamOf && c.type !== "calculated" && c.id !== g.schedule?.end);
  const kept = cur ? typed.filter(c => cur.columns.includes(c.id)).map(c => ({ ...c, required: false })) : [];
  const miniRows: GridRow[] = (cur?.rows ?? []).map((r, i) => ({ _id: "pr" + i, ...r }));
  const save = g.presetSave ?? { enabled: false, teams: [], admins: true };
  const setSave = (patch: Partial<NonNullable<GridConfig["presetSave"]>>) => p.onChange({ ...g, presetSave: { ...save, ...patch } });
  const when = cur?.when ?? [];
  return (
    <>
      <h3>Presets (ready-made rows)</h3>
      <div className="help">A preset is a named set of rows users add to the grid with <b>Load preset</b>, e.g. the standard activities with their default effort. People and dates stay blank for the user to fill in. Give a preset a rule (e.g. Project type = Implementation) to offer it only on matching work items.</div>
      <div className="row">
        <select className="fixed" value={idx} onChange={e => setSel(+e.target.value)}>{presets.map((x, i) => <option key={x.id} value={i}>{x.name || "(unnamed)"}</option>)}{!presets.length && <option value={-1}>(no presets yet)</option>}</select>
        <button className="btn fixed" onClick={() => { const id = "p" + Date.now().toString(36); setPresets([...presets, { id, name: "Preset " + (presets.length + 1), columns: defaultPresetColumns(p.effective), rows: [] }]); setSel(presets.length); }}>+ New preset</button>
        {cur && <button className="btn danger fixed" onClick={() => { setPresets(presets.filter((_, i) => i !== idx)); setSel(0); }}>Delete preset</button>}
      </div>
      {cur && (
        <div className="card">
          <label className="field"><span>Name (shown in the Load preset list)</span><input value={cur.name} onChange={e => setCur({ name: e.target.value })} /></label>
          <div className="help"><b>Offer this preset only when…</b> (all conditions must hold; leave empty to offer it on every work item)</div>
          {when.map((w, i) => (
            <div className="row" key={i}>
              <FieldInput value={w.field} onChange={field => setCur({ when: setAt(when, i, { ...w, field }) })} placeholder="Custom.ProjectType" />
              <span className="fixed">is</span>
              <input placeholder="value, or several separated by commas" defaultValue={w.values.join(", ")} key={w.field + i} onBlur={e => setCur({ when: setAt(when, i, { ...w, values: csv(e.target.value) }) })} />
              <button className="btn icon danger fixed" onClick={() => setCur({ when: when.filter((_, j) => j !== i).length ? when.filter((_, j) => j !== i) : undefined })}>✕</button>
            </div>
          ))}
          <button className="btn" onClick={() => setCur({ when: [...when, { field: "", values: [] }] })}>+ Add condition</button>
          <div className="help"><b>Columns this preset keeps</b> (the others, such as people and dates, stay blank; calculated columns fill themselves in):</div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            {typed.map(c => <label key={c.id} className="fixed"><input type="checkbox" checked={cur.columns.includes(c.id)} onChange={e => setCur({ columns: e.target.checked ? [...cur.columns, c.id] : cur.columns.filter(x => x !== c.id) })} /> {c.name}</label>)}
          </div>
          {kept.length > 0 && (
            <>
              <div className="help"><b>Rows</b></div>
              <Grid cfg={{ columns: kept }} rows={miniRows} readOnly={false} projectId="" busyChildren={false} status=""
                onChange={rows => setCur({ rows: rows.map(r => Object.fromEntries(kept.map(c => [c.id, r[c.id]]))) })}
                onCreateChild={() => undefined} onCreateAllChildren={() => undefined} onImport={() => undefined} onExport={() => undefined} />
            </>
          )}
        </div>
      )}
      <div className="card">
        <label><input type="checkbox" checked={save.enabled} onChange={e => setSave({ enabled: e.target.checked })} /> Show <b>Save as preset</b> on the work item (keeps the typed-in values of the current rows as a preset)</label>
        {save.enabled && (
          <>
            <div className="help">Who may save: project administrators and/or members of the chosen teams. This is checked in the extension; it hides the button from others but is not a security boundary of Azure DevOps. Project administrator detection is best effort – if it cannot be read, only the team rule grants access.</div>
            <label><input type="checkbox" checked={save.admins} onChange={e => setSave({ admins: e.target.checked })} /> Project administrators</label>
            <div className="chips" style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "6px 0" }}>
              {teams.map(t => <span key={t.id} className={"chip" + (save.teams.some(x => x.id === t.id) ? " on" : "")} onClick={() => setSave({ teams: save.teams.some(x => x.id === t.id) ? save.teams.filter(x => x.id !== t.id) : [...save.teams, t] })}>{t.name}</span>)}
              {!teams.length && <span className="muted">Loading teams…</span>}
            </div>
          </>
        )}
      </div>
    </>
  );
}

/** Chips to pick Azure DevOps teams. */
function TeamChips(p: { all: TeamRef[]; value: { id: string; name: string }[]; onChange(v: { id: string; name: string }[]): void }) {
  return (
    <div className="chips" style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "4px 0" }}>
      {p.all.map(t => <span key={t.id} className={"chip" + (p.value.some(x => x.id === t.id) ? " on" : "")} onClick={() => p.onChange(p.value.some(x => x.id === t.id) ? p.value.filter(x => x.id !== t.id) : [...p.value, t])}>{t.name}</span>)}
      {!p.all.length && <span className="muted">Loading teams…</span>}
      {p.value.filter(v => !p.all.some(t => t.id === v.id)).map(v => <span key={v.id} className="chip on" title="Not in the current team list" onClick={() => p.onChange(p.value.filter(x => x.id !== v.id))}>{v.name}</span>)}
    </div>
  );
}

/** Named people ("Name <sign-in>") picked from the directory. */
function PeopleList(p: { value: string[]; projectId: string; onChange(v: string[]): void }) {
  const [text, setText] = React.useState("");
  const add = () => { const t = text.trim(); if (t && !p.value.includes(t)) p.onChange([...p.value, t]); setText(""); };
  return (
    <div>
      {p.value.map(x => <div key={x} className="row"><span>{x}</span><button className="btn icon danger fixed" onClick={() => p.onChange(p.value.filter(y => y !== x))}>✕</button></div>)}
      <div className="row">
        <div className="grow"><IdentityInput value={text} includeGroups={false} projectId={p.projectId} onChange={setText} /></div>
        <button className="btn fixed" disabled={!text.trim()} onClick={add}>+ Add person</button>
      </div>
    </div>
  );
}

/** Approve / reject / pending review for every row: columns, rules, who may decide, locking, totals by status. */
function ReviewEditor(p: { g: GridConfig; onChange(g: GridConfig): void }) {
  const { g } = p;
  const rv = g.review;
  const [teams, setTeams] = React.useState<TeamRef[]>([]);
  const [projectId, setProjectId] = React.useState("");
  React.useEffect(() => { getProject().then(pr => { setProjectId(pr.id); return listTeams(pr.id); }).then(setTeams).catch(() => undefined); }, []);
  const set = (patch: Partial<ReviewConfig>) => p.onChange({ ...g, review: { ...rv!, ...patch } });
  const textCols = g.columns.filter(c => c.type === "string" && !c.formula && !c.lookup && !c.statusBands && !c.derive);
  const rules = rv?.approvers ?? [];
  const setRule = (i: number, patch: Partial<ApproverRule>) => set({ approvers: setAt(rules, i, { ...rules[i], ...patch }) });
  const [effort, setEffort] = React.useState("");
  const numCols = g.columns.filter(c => c.type === "number" || c.type === "calculated");
  const colPick = (label: string, key: "statusColumn" | "byColumn" | "atColumn" | "reasonColumn", optional: boolean) => (
    <label className="field" style={{ flex: 1 }}><span>{label}</span>
      <select value={rv![key] ?? ""} onChange={e => set({ [key]: e.target.value || undefined } as Partial<ReviewConfig>)}>
        {optional && <option value="">(none)</option>}{!optional && !rv![key] && <option value="" />}
        {textCols.map(c => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}</select></label>
  );
  return (
    <>
      <h3>Review (approve / reject)</h3>
      <label><input type="checkbox" checked={!!rv} onChange={e => p.onChange(e.target.checked ? withReview(g) : { ...g, review: undefined })} /> Every row has a review status (<b>Pending review</b>, <b>Approved</b>, <b>Rejected</b>) that chosen people can change one by one or in bulk</label>
      {rv && (
        <div className="card">
          <div className="row">
            {colPick("Status column", "statusColumn", false)}{colPick("Reviewed by (optional)", "byColumn", true)}{colPick("Reviewed at (optional)", "atColumn", true)}{colPick("Comment / reject reason (optional, typed by the approver)", "reasonColumn", true)}
          </div>
          <div className="row">
            {(["pending", "approved", "rejected"] as const).map(k => (
              <label className="field" key={k} style={{ flex: 1 }}><span>Name of “{k}”</span>
                <input value={rv.statuses[k]} onChange={e => set({ statuses: { ...rv.statuses, [k]: e.target.value } })} placeholder={DEFAULT_STATUSES[k]} /></label>
            ))}
          </div>
          <div className="help">Renaming a status later leaves rows saved under the old name as “pending review”. The Approve / Reject buttons set the status; people cannot type it.</div>
          <label style={{ display: "block" }}><input type="checkbox" checked={rv.resetOnEdit} onChange={e => set({ resetOnEdit: e.target.checked })} /> An edited approved or rejected row goes back to <b>pending review</b> (the review columns and calculated columns do not count)</label>
          <label style={{ display: "block" }}><input type="checkbox" checked={rv.lockApproved} onChange={e => set({ lockApproved: e.target.checked })} /> <b>Lock approved rows</b>: they cannot be edited, moved or deleted, except by administrators</label>
          <label style={{ display: "block" }}><input type="checkbox" checked={rv.noSelfApproval} onChange={e => set({ noSelfApproval: e.target.checked })} /> Nobody can approve or reject their <b>own</b> row (the person on the row; this also applies to administrators)</label>

          <div className="help"><b>Who may approve or reject</b> – one rule per group of rows. A rule can be limited to rows where a column has certain values (for example one team approves Capitalizable rows and another the rest). A row that matches no rule can only be decided by administrators.</div>
          {rules.map((r, i) => (
            <div className="card" key={r.id}>
              <div className="row">
                <label className="field" style={{ flex: 1 }}><span>Rule name</span><input value={r.name} onChange={e => setRule(i, { name: e.target.value })} /></label>
                <label className="field" style={{ flex: 1 }}><span>Applies to rows where…</span>
                  <select value={r.when?.column ?? ""} onChange={e => setRule(i, { when: e.target.value ? { column: e.target.value, values: r.when?.values ?? [] } : undefined })}>
                    <option value="">(all rows)</option>{g.columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                {r.when && <label className="field" style={{ flex: 1 }}><span>…is (values, comma separated)</span>
                  <input defaultValue={r.when.values.join(", ")} key={r.when.column} onBlur={e => setRule(i, { when: { column: r.when!.column, values: csv(e.target.value) } })} /></label>}
                <button className="btn icon danger fixed" onClick={() => set({ approvers: rules.filter((_, j) => j !== i) })}>✕</button>
              </div>
              <div className="help">Members of these Azure DevOps teams may decide these rows:</div>
              <TeamChips all={teams} value={r.teams} onChange={v => setRule(i, { teams: v })} />
              <div className="help">…and/or these people (use this when a team cannot be read):</div>
              <PeopleList value={r.people} projectId={projectId} onChange={v => setRule(i, { people: v })} />
            </div>
          ))}
          <button className="btn" onClick={() => set({ approvers: [...rules, { id: "r" + Date.now().toString(36), name: "Approvers " + (rules.length + 1), teams: [], people: [] }] })}>+ Add approver rule</button>

          <div className="help"><b>Grid administrators</b> – besides project administrators, these people may decide every row and edit or remove approved (locked) rows. Project administrator detection is best effort; this list works even when it fails. Team membership counts direct members only.</div>
          <TeamChips all={teams} value={rv.admins.teams} onChange={v => set({ admins: { ...rv.admins, teams: v } })} />
          <PeopleList value={rv.admins.people} projectId={projectId} onChange={v => set({ admins: { ...rv.admins, people: v } })} />

          <div className="help"><b>Totals by status</b> – write the approved / pending / rejected figure of a number column to work item fields:</div>
          <div className="row">
            <select className="fixed" value={effort} onChange={e => setEffort(e.target.value)}><option value="">Column to add up…</option>{numCols.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <button className="btn fixed" disabled={!effort} onClick={() => {
              const col = g.columns.find(c => c.id === effort)!;
              const add = (["approved", "pending", "rejected"] as const).map(k => ({ column: effort, aggregate: "sum" as Aggregate, label: `${col.name} – ${rv.statuses[k]}`, field: "", where: { column: rv.statusColumn, values: [rv.statuses[k]] } }));
              p.onChange({ ...g, totals: [...(g.totals ?? []), ...add] }); setEffort("");
            }}>Add three total mappings</button>
            <span className="muted">then pick the work item field for each under “Push totals to work item fields”</span>
          </div>
        </div>
      )}
    </>
  );
}

function Editor(p: { name: string; g: GridConfig; grids: Record<string, GridConfig>; onChange(g: GridConfig): void; issues: Issue[] }) {
  const g = p.g;
  const sourceNames = Object.keys(p.grids).filter(n => n !== p.name && !p.grids[n].derived);
  const source = g.derived ? p.grids[g.derived.source] : undefined;
  const sourceCols: ColumnDef[] | undefined = source ? [...source.columns, ...(source.schedule ? (SCHEDULE_VIRTUAL as unknown as ColumnDef[]) : [])] : undefined;
  const [pick, setPick] = React.useState({ resource: "", period: "", hours: "", team: "" });
  const [fromRegister, setFromRegister] = React.useState(true);
  const [openCols, setOpenCols] = React.useState<Set<number>>(new Set());
  const { lookups } = React.useContext(Ctx);
  const effective = React.useMemo(() => applySharedLookups(g, lookups), [g, lookups]);
  const child = g.child ?? { enabled: false, workItemType: "Task", titleColumn: "", fieldMap: {} };
  return (
    <div>
      <div className="row">
        <label className="field" style={{ flex: 1 }}><span>Data field (long-text field that stores the rows as JSON)</span><FieldInput value={g.dataField ?? ""} onChange={dataField => p.onChange({ ...g, dataField })} placeholder="Custom.GridData" /></label>
        <label className="fixed"><input type="checkbox" checked={!!g.readOnly} onChange={e => p.onChange({ ...g, readOnly: e.target.checked })} /> Read-only</label>
      </div>
      <label><input type="checkbox" checked={!!g.allowImport} onChange={e => p.onChange({ ...g, allowImport: e.target.checked || undefined })} /> Allow importing rows from a CSV / Excel file (adds an Import button; Export is always available)</label>
      <br />
      <label title="Off: required/invalid cells are only highlighted. On: the work item cannot be saved while any exist."><input type="checkbox" checked={!!g.blockSave} onChange={e => p.onChange({ ...g, blockSave: e.target.checked })} /> Block saving the work item while required values are missing</label>
      {!g.derived && (
        <>
          <h3>Dates and effort</h3>
          <label><input type="checkbox" checked={!!g.schedule} onChange={e => p.onChange(e.target.checked ? withSchedule(g) : { ...g, schedule: undefined })} /> Users enter a <b>start date, effort (hours) and allocation %</b> instead of a month. The end date and the hours per month are calculated from the person's calendar (working week, days off, hours per day).</label>
          {g.schedule && (
            <div className="card">
              <div className="row">
                {([["resource", "Resource (people picker)", ["identity", "string"]], ["start", "Start date", ["date"]], ["effort", "Effort (hours)", ["number"]], ["allocation", "Allocation % (optional, empty = 100)", ["number"]], ["end", "End date (calculated)", ["date"]]] as [keyof NonNullable<GridConfig["schedule"]>, string, ColumnType[]][]).map(([k, label, types]) => (
                  <label className="field" key={k} style={{ flex: 1 }}><span>{label}</span>
                    <select value={g.schedule![k] ?? ""} onChange={e => p.onChange({ ...g, schedule: { ...g.schedule!, [k]: e.target.value || undefined } as NonNullable<GridConfig["schedule"]> })}>
                      <option value="" />{g.columns.filter(c => types.includes(c.type)).map(c => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}</select></label>
                ))}
              </div>
              <div className="help">Where the calendar comes from is set on <b>Capacity</b>: Azure DevOps team capacity (working days, days off and hours per day) or this extension's own table. The effort fills the working days in turn (hours per day × allocation %), so 80 h at 100 % over an 8-hour day is 10 working days. A derived grid built from this one uses the “Scheduled month” and “Scheduled hours” source columns.</div>
              <button className="btn" onClick={() => p.onChange(withSchedule(g))}>Add any missing standard columns</button>
            </div>
          )}
        </>
      )}
      <h3>Build this grid automatically from another grid</h3>
      <label><input type="checkbox" checked={!!g.derived} onChange={e => p.onChange({ ...g, derived: e.target.checked ? { source: sourceNames[0] ?? "" } : undefined })} disabled={!g.derived && !sourceNames.length} /> This is a derived grid (rows are created from the source grid, e.g. Resource Capacity from the timesheet)</label>
      {g.derived && (
        <div className="card">
          <div className="row">
            <label className="field" style={{ flex: 1 }}><span>Source grid</span>
              <select value={g.derived.source} onChange={e => p.onChange({ ...g, derived: { source: e.target.value } })}><option value="" />{sourceNames.map(n => <option key={n}>{n}</option>)}</select></label>
          </div>
          {source && needsScheduledRemap(g, source) && (
            <div className="card">
              <div className="err">The source grid “{g.derived.source}” is scheduled by dates, so it no longer has the old month and hours columns this grid reads.</div>
              <div className="help">The months come straight from each row's start date, effort and calendar – no separate Period column is needed.</div>
              <button className="btn primary" onClick={() => p.onChange(remapToScheduled(g, source))}>Use the scheduled month and hours</button>
            </div>
          )}
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
                    <select value={pick[k]} onChange={e => setPick({ ...pick, [k]: e.target.value })}><option value="" />{sourceCols!.map(sc => <option key={sc.id} value={sc.id}>{sc.name}</option>)}{k === "team" && <option value={TEAM_FROM_CAPACITY}>From the capacity source (recommended)</option>}</select></label>
                ))}
                {source.schedule && <button className="btn fixed" title="Use the scheduled month and hours of the source grid" onClick={() => setPick({ resource: source.schedule!.resource, period: "_month", hours: "_hours", team: TEAM_FROM_CAPACITY })}>Fill in for a scheduled source</button>}
                <button className="btn fixed" disabled={!pick.resource || !pick.period || !pick.hours}
                  onClick={() => p.onChange({ ...g, columns: capacityTemplate({ ...pick, team: pick.team || undefined }, { fromRegister }), allocation: capacityAllocation(), rowColorBy: CAPACITY_ROW_COLOR })}>{g.columns.length ? "Generate columns (replaces current)" : "Generate columns"}</button>
              </div>
            </>
          )}
        </div>
      )}
      {g.columns.some(c => c.statusBands) && (
        <label className="field"><span>Colour the whole row of each entry by this status column</span>
          <select value={g.rowColorBy ?? ""} onChange={e => p.onChange({ ...g, rowColorBy: e.target.value || undefined })}>
            <option value="">No row colour</option>{g.columns.filter(c => c.statusBands).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      )}
      <h3>Columns</h3>
      <table className="cols">
        <thead><tr><th>Id</th><th>Header</th><th>Type</th><th>Req.</th><th>Total</th><th /></tr></thead>
        <tbody>{g.columns.map((c, i) => <ColumnRow key={i} c={c} others={g.columns} statusCols={g.columns.filter(x => x.statusBands)} sourceCols={sourceCols}
          open={openCols.has(i)} onToggle={() => setOpenCols(o => { const n = new Set(o); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
          canUp={i > 0} canDown={i < g.columns.length - 1}
          onMove={d => { const j = i + d; if (j < 0 || j >= g.columns.length) return; const cols = [...g.columns]; [cols[i], cols[j]] = [cols[j], cols[i]];
            setOpenCols(o => { const n = new Set<number>(); o.forEach(k => n.add(k === i ? j : k === j ? i : k)); return n; }); p.onChange({ ...g, columns: cols }); }}
          onChange={nc => p.onChange({ ...g, columns: setAt(g.columns, i, nc) })} onDelete={() => p.onChange({ ...g, columns: delAt(g.columns, i) })} />)}</tbody>
      </table>
      <button className="btn" onClick={() => { let n = g.columns.length + 1; while (g.columns.some(c => c.id === "col" + n)) n++; p.onChange({ ...g, columns: [...g.columns, { id: "col" + n, name: "Column " + n, type: "string" }] }); }}>+ Add column</button>
      {!g.derived && <ReviewEditor g={g} onChange={p.onChange} />}
      {!g.derived && <PresetsEditor g={g} effective={effective} onChange={p.onChange} />}
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
