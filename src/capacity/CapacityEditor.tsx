import * as React from "react";
import { addHistory, CapacityRecord, exportCapacityCsv, importMatrix, monthsOf, newRecord, toMatrix } from "../core/capacity";
import { parseCsv } from "../core/csv";
import { IdentityInput } from "../grid/IdentityInput";
import { IdentityHit } from "../shared/identity";

export interface CapacityApi {
  list(): Promise<CapacityRecord[]>;
  save(r: CapacityRecord): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface EditorProps {
  api: CapacityApi;
  canEdit: boolean;
  /** shown above the table, e.g. why the page is read-only */
  reason?: string;
  /** name recorded in the audit trail */
  actor: string;
  projectId: string;
  /** injectable for tests */
  search?: (q: string, groups: boolean, projectId: string) => Promise<IdentityHit[]>;
  download?: (name: string, data: Blob | string, mime?: string) => void;
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const parseHours = (t: string): number | null | "invalid" => { const s = t.trim(); if (!s) return null; const n = parseFloat(s.replace(/,/g, "")); return Number.isFinite(n) && n >= 0 ? n : "invalid"; };
const fmt = (n: number) => String(Math.round(n * 100) / 100);

export function CapacityEditor(p: EditorProps) {
  const [records, setRecords] = React.useState<CapacityRecord[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [year, setYear] = React.useState(new Date().getFullYear());
  const [filter, setFilter] = React.useState("");
  const [msg, setMsg] = React.useState<{ text: string; bad?: boolean }>({ text: "" });
  const [newName, setNewName] = React.useState("");
  const [newDefault, setNewDefault] = React.useState("");
  const [selected, setSelected] = React.useState<string>("");
  const fileRef = React.useRef<HTMLInputElement>(null);
  const months = monthsOf(year);

  const flash = (text: string, bad = false) => setMsg({ text, bad });
  React.useEffect(() => { p.api.list().then(r => { setRecords(r); setLoaded(true); }).catch(e => flash("Could not load capacity: " + e.message, true)); }, [p.api]);

  const upsert = (rec: CapacityRecord) => setRecords(rs => [...rs.filter(r => r.key !== rec.key), rec].sort((a, b) => a.name.localeCompare(b.name)));

  const persist = async (rec: CapacityRecord, what: string) => {
    if (!p.canEdit) return;
    const next = addHistory(rec, p.actor, what);
    try { await p.api.save(next); upsert(next); flash(`Saved: ${what}`); }
    catch (e) { flash("Could not save: " + (e as Error).message, true); }
  };

  const commitDefault = (rec: CapacityRecord, text: string) => {
    const v = parseHours(text);
    if (v === "invalid") return flash("Hours must be a number, 0 or more.", true);
    if (v === rec.defaultHours) return;
    persist({ ...rec, defaultHours: v }, `${rec.name.split(" <")[0]}: default ${rec.defaultHours ?? "none"} → ${v ?? "none"}`);
  };
  const commitMonth = (rec: CapacityRecord, month: string, text: string) => {
    const v = parseHours(text);
    if (v === "invalid") return flash("Hours must be a number, 0 or more.", true);
    const before = rec.overrides[month];
    if ((v === null && before === undefined) || v === before) return;
    const overrides = { ...rec.overrides };
    if (v === null) delete overrides[month]; else overrides[month] = v;
    persist({ ...rec, overrides }, `${rec.name.split(" <")[0]} ${month}: ${before ?? "default"} → ${v ?? "default"}`);
  };

  const add = async () => {
    const name = newName.trim();
    if (!name) return flash("Pick a person first.", true);
    const d = parseHours(newDefault);
    if (d === "invalid") return flash("Default hours must be a number, 0 or more.", true);
    const rec = newRecord(name, d);
    if (records.some(r => r.key === rec.key)) return flash("That person is already in the register.", true);
    await persist(rec, `${name.split(" <")[0]} added (default ${d ?? "none"})`);
    setNewName(""); setNewDefault("");
  };
  const remove = async (rec: CapacityRecord) => {
    try { await p.api.remove(rec.key); setRecords(rs => rs.filter(r => r.key !== rec.key)); flash(`${rec.name.split(" <")[0]} removed from the register.`); }
    catch (e) { flash("Could not remove: " + (e as Error).message, true); }
  };

  const doImport = async (file: File) => {
    try {
      const matrix: unknown[][] = /\.xlsx$/i.test(file.name) ? ((await (await import("read-excel-file/browser")).readSheet(file)) as unknown[][]) : parseCsv(await file.text());
      const res = importMatrix(matrix, records);
      for (const rec of res.records) { const next = addHistory(rec, p.actor, "imported from file"); await p.api.save(next); upsert(next); }
      flash(`Imported: ${res.created} new, ${res.updated} updated${res.skipped.length ? `; skipped: ${res.skipped.join("; ")}` : ""}.`, res.skipped.length > 0);
    } catch (e) { flash("Import failed: " + (e as Error).message, true); }
  };
  const download = p.download ?? ((name: string, data: Blob | string, mime = "text/plain") => {
    const a = document.createElement("a"); a.href = URL.createObjectURL(typeof data === "string" ? new Blob([data], { type: mime }) : data); a.download = name; a.click();
  });
  const exportXlsx = async () => {
    const { default: write } = await import("write-excel-file/browser");
    const m = toMatrix(records, year);
    const rows = m.map((r, i) => r.map(v => (i === 0 ? { value: String(v), fontWeight: "bold" as const } : typeof v === "number" ? { type: Number, value: v } : { type: String, value: String(v) })));
    download(`capacity-${year}.xlsx`, await write(rows as never).toBlob());
  };

  const shown = records.filter(r => r.name.toLowerCase().includes(filter.trim().toLowerCase()));
  const effective = (r: CapacityRecord, m: string) => r.overrides[m] ?? r.defaultHours ?? null;
  const monthTotal = (m: string) => shown.reduce((s, r) => s + (effective(r, m) ?? 0), 0);
  const sel = records.find(r => r.key === selected);

  return (
    <div className="capacity">
      {p.reason && <div className={p.canEdit ? "muted" : "err"} style={{ marginBottom: 6 }}>{p.reason}</div>}
      <div className="toolbar">
        <button className="btn" onClick={() => setYear(year - 1)}>◀</button><strong>{year}</strong><button className="btn" onClick={() => setYear(year + 1)}>▶</button>
        <input type="search" placeholder="Filter people…" value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 160 }} />
        <span className="spacer" />
        {p.canEdit && <><button className="btn" onClick={() => fileRef.current?.click()}>Import</button>
          <input ref={fileRef} type="file" accept=".csv,.xlsx" hidden onChange={e => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = ""; }} /></>}
        <button className="btn" onClick={() => download(`capacity-${year}.csv`, "﻿" + exportCapacityCsv(records, year), "text/csv;charset=utf-8")}>CSV</button>
        <button className="btn" onClick={exportXlsx}>Excel</button>
      </div>
      {p.canEdit && (
        <div className="row addrow">
          <div className="grow"><IdentityInput value={newName} includeGroups={false} projectId={p.projectId} search={p.search} onChange={setNewName} /></div>
          <input className="fixed" style={{ width: 130 }} placeholder="Default hours / month" value={newDefault} onChange={e => setNewDefault(e.target.value)} />
          <button className="btn primary fixed" onClick={add}>+ Add person</button>
        </div>
      )}
      <div className="scroll">
        <table>
          <thead><tr><th>Person</th><th>Default</th>{months.map((m, i) => <th key={m} title={m}>{MONTH_LABELS[i]}</th>)}<th>Year</th><th /></tr></thead>
          <tbody>
            {shown.map(r => (
              <tr key={r.key} className={r.key === selected ? "sel" : ""}>
                <td className="name" title={r.name}>{r.name}</td>
                <td><input disabled={!p.canEdit} defaultValue={r.defaultHours ?? ""} key={"d" + r.key + (r.defaultHours ?? "")} onBlur={e => commitDefault(r, e.target.value)} /></td>
                {months.map(m => (
                  <td key={m}><input disabled={!p.canEdit} className={r.overrides[m] !== undefined ? "ovr" : ""} defaultValue={r.overrides[m] ?? ""} key={m + r.key + (r.overrides[m] ?? "")}
                    placeholder={effective(r, m) === null ? "–" : fmt(effective(r, m)!)} title={r.overrides[m] !== undefined ? "Exception for this month (clear to use the default)" : "Default"} onBlur={e => commitMonth(r, m, e.target.value)} /></td>
                ))}
                <td className="tot">{fmt(months.reduce((s, m) => s + (effective(r, m) ?? 0), 0))}</td>
                <td className="actions"><button className="btn icon" title="Change history" onClick={() => setSelected(r.key === selected ? "" : r.key)}>ⓘ</button>
                  {p.canEdit && <button className="btn icon danger" title="Remove from the register" onClick={() => remove(r)}>✕</button>}</td>
              </tr>
            ))}
            {loaded && !shown.length && <tr><td colSpan={16} className="muted empty">{records.length ? "No one matches the filter." : p.canEdit ? "No one is registered yet – add a person above or import a file." : "No one is registered yet."}</td></tr>}
            {!loaded && <tr><td colSpan={16} className="muted empty">Loading…</td></tr>}
          </tbody>
          {shown.length > 0 && <tfoot><tr><td>Total</td><td />{months.map(m => <td key={m} className="tot">{fmt(monthTotal(m))}</td>)}<td className="tot">{fmt(months.reduce((s, m) => s + monthTotal(m), 0))}</td><td /></tr></tfoot>}
        </table>
      </div>
      <div className={msg.bad ? "err" : "muted"} style={{ marginTop: 6 }}>{msg.text}</div>
      <div className="help">Each person has a <b>default</b> number of hours per month. Type a number in a month only for an <b>exception</b> (leave, part time, holidays); clear it to use the default again. Every Epic's Resource Capacity grid reads these values.</div>
      {sel && (
        <div className="card">
          <strong>Change history – {sel.name}</strong>
          {(sel.history ?? []).length ? <ul className="hist">{sel.history!.map((h, i) => <li key={i}><span className="muted">{new Date(h.at).toLocaleString()}</span> · {h.by} · {h.what}</li>)}</ul> : <div className="muted">No changes recorded.</div>}
        </div>
      )}
    </div>
  );
}
