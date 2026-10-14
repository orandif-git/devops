import * as React from "react";
import { answer, findQuery, interpret, matchesDims } from "../core/ask";
import { describeResult, formatCell, OP_LABEL, QueryResult, runQuery } from "../core/execQuery";
import { ExecQuery } from "../core/types";
import { buildExec, dayText, dimFields, dimLabel, ExecEpic, ExecStatus, likely, NO_VALUE, STATUS_NAME, STATUS_ORDER } from "../core/executive";
import { monthsOfPeriod } from "../core/period";
import { PlannerSettings } from "../core/types";
import { Loaded } from "../data/loadAll";
import { LoadProgress } from "../data/epics";
import { EpicDialog } from "../hub/EpicDialog";

const SYM: Record<ExecStatus, string> = { green: "✓", amber: "▲", red: "!", unknown: "?", idle: "○", done: "●" };
const Sw = ({ s }: { s: ExecStatus }) => <i className={"ex-sw " + s} aria-hidden="true">{SYM[s]}</i>;
const PAGE = 100;

interface Filters { dims: Record<string, string[]>; statuses: ExecStatus[]; late: boolean; hold: boolean; search: string; /** only these Epics (the result of a query) */ ids?: number[]; idsName?: string }
const none = (): Filters => ({ dims: {}, statuses: [], late: false, hold: false, search: "" });
const toggle = <T,>(a: T[], v: T) => (a.includes(v) ? a.filter(x => x !== v) : [...a, v]);

/** Executive view of every Epic: status, go-live risk, a short brief, and questions that turn into filters. */
export function ExecDashboard(p: {
  project: { id: string; name: string }; settings: PlannerSettings; loaded?: Loaded; busy: boolean; progress?: LoadProgress; error: string; onReload(force: boolean): void;
  toolbar?: React.ReactNode;
}) {
  const L = p.loaded, x = p.settings.executive;
  const [f, setF] = React.useState<Filters>(none());
  const [group, setGroup] = React.useState(dimFields(p.settings)[0]);
  const [sel, setSel] = React.useState<number>();
  const [dialog, setDialog] = React.useState<number>();
  const [text, setText] = React.useState("");
  const [said, setSaid] = React.useState<{ q: string; a: string }>();
  const [limit, setLimit] = React.useState(PAGE);
  const [run, setRun] = React.useState<QueryResult>();
  const [sort, setSort] = React.useState<{ key: string; desc: boolean }>();
  const fields = dimFields(p.settings);
  React.useEffect(() => { if (!fields.includes(group)) setGroup(fields[0]); }, [fields.join("|")]);   // eslint-disable-line react-hooks/exhaustive-deps

  const built = React.useMemo(() => (L ? buildExec({ epics: L.epics, gridDone: L.gridDone, bookings: L.bookings, avail: L.avail, settings: p.settings }) : undefined), [L, p.settings]);
  const rows = built?.rows ?? [];
  const vocab = React.useMemo(() => Object.fromEntries(fields.map(k => [k, Array.from(new Set(rows.map(r => r.dims[k]))).filter(v => v !== NO_VALUE).sort()])), [rows, fields.join("|")]);   // eslint-disable-line react-hooks/exhaustive-deps
  const idSet = React.useMemo(() => (f.ids ? new Set(f.ids) : undefined), [f.ids]);
  const base = (r: ExecEpic) => (!idSet || idSet.has(r.epic.id)) && matchesDims(r, f.dims) && (!f.late || r.late) && (!f.hold || r.hold) && (!f.search || r.epic.title.toLowerCase().includes(f.search.toLowerCase()) || String(r.epic.id) === f.search.trim());
  const B = rows.filter(base);                                                   // for the tiles: everything but the status filter
  const V = B.filter(r => !f.statuses.length || f.statuses.includes(r.status));
  const cnt = (list: ExecEpic[], s: ExecStatus) => list.filter(r => r.status === s).length;
  const active = B.filter(r => r.status === "green" || r.status === "amber" || r.status === "red");
  const likelyN = active.filter(r => likely(r, x)).length;
  const sorted = React.useMemo(() => V.slice().sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.slip - a.slip || a.epic.title.localeCompare(b.epic.title)), [V.length, f, rows]);   // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = rows.find(r => r.epic.id === sel);
  const months = React.useMemo(() => monthsOfPeriod({ kind: "year" }), []);

  const runNamed = (x: ExecQuery, asked?: string) => {
    if (!L || !built) return;
    const res = runQuery(x, { settings: p.settings, exec: built.rows, bookings: L.bookings, avail: L.avail, gridDone: L.gridDone });
    setSel(undefined); setLimit(PAGE);
    setSort(undefined);
    if (x.show === "epics") { setRun(x.columns.length ? res : undefined); setF({ ...none(), ids: res.rows.map(r => r.epicId!), idsName: x.name }); } else { setRun(res); setF(none()); }
    setSaid({ q: asked ?? x.name, a: describeResult(res) });
  };
  const ask = (q: string) => {
    const t = q.trim(); if (!t) return;
    const named = findQuery(t, x.queries);
    if (named) { runNamed(named, t); return; }
    setRun(undefined);
    const Q = interpret(t, vocab);
    if (!Q.recognised) { setSaid({ q: t, a: "I could not map that to the data. Try a category value with a status, for example “" + (Object.values(vocab).flat()[0] ?? "Regulatory") + " projects that are red”, “what is late?” or “RAG split”." }); return; }
    setF({ dims: Q.dims, statuses: Q.split ? [] : Q.statuses, late: Q.late, hold: Q.hold, search: "" }); setSel(undefined); setLimit(PAGE);
    setSaid({ q: t, a: answer(Q, rows) });
  };
  const first = Object.values(vocab).flat();
  const queryChips = x.queries.filter(q => q.name.trim());
  const suggestions = queryChips.length ? [] : [first[0] && `Which ${first[0]} projects are red?`, first[1] && `How many ${first[1]} projects are at risk?`, first[0] && `${first[0]} RAG`, "What is late?", "Show everything on hold"].filter(Boolean) as string[];
  const chips: { label: string; clear(): void }[] = [
    ...Object.entries(f.dims).flatMap(([k, vals]) => vals.map(v => ({ label: `${dimLabel(k)}: ${v}`, clear: () => setF({ ...f, dims: { ...f.dims, [k]: vals.filter(y => y !== v) } }) }))),
    ...f.statuses.map(s => ({ label: "Status: " + STATUS_NAME[s], clear: () => setF({ ...f, statuses: f.statuses.filter(y => y !== s) }) })),
    ...(f.late ? [{ label: "Late", clear: () => setF({ ...f, late: false }) }] : []), ...(f.hold ? [{ label: "On hold", clear: () => setF({ ...f, hold: false }) }] : []),
    ...(f.search ? [{ label: "Search: " + f.search, clear: () => setF({ ...f, search: "" }) }] : []),
    ...(f.ids ? [{ label: "Query: " + (f.idsName ?? ""), clear: () => setF({ ...f, ids: undefined, idsName: undefined }) }] : []),
  ];

  if (!L) return (
    <div>
      <div className="toolbar"><button className="btn primary" disabled={p.busy} onClick={() => p.onReload(false)}>{p.busy ? "Loading…" : "Load the dashboard"}</button>
        {p.progress && <span className="muted">{p.progress.phase === "query" ? "Finding the Epics…" : p.progress.phase === "check" ? `Checking for changes (${p.progress.done}/${p.progress.total})` : `Reading Epics (${p.progress.done}/${p.progress.total})`}</span>}</div>
      {p.error && <div className="err" role="alert">{p.error}</div>}
    </div>
  );

  const tile = (s: ExecStatus) => <button key={s} className={"ex-tile" + (f.statuses.includes(s) ? " on" : f.statuses.length ? " dim" : "")} aria-pressed={f.statuses.includes(s)} onClick={() => setF({ ...f, statuses: toggle(f.statuses, s) })}>
    <div className="l"><Sw s={s} />{STATUS_NAME[s]}</div><div className="v">{cnt(B, s)}</div><div className="d">{B.length ? Math.round(cnt(B, s) / B.length * 100) : 0}% of Epics</div></button>;
  const li = (r: ExecEpic, extra?: string) => <li key={r.epic.id}><a href="#" className="lk" onClick={e => { e.preventDefault(); setSel(r.epic.id); }}>{r.epic.title}</a> <span className="muted">· {Object.values(r.dims).filter(v => v !== NO_VALUE).join(", ") || r.epic.areaPath}{extra ? " · " + extra : ""}</span></li>;
  const good = B.filter(r => r.status === "green").sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0)).slice(0, 4);
  const warn = B.filter(r => r.status === "amber").sort((a, b) => b.slip - a.slip).slice(0, 4);
  const bad = B.filter(r => r.status === "red").sort((a, b) => (b.late ? 1e4 : 0) + b.slip - (a.late ? 1e4 : 0) - a.slip).slice(0, 4);
  const worst = Array.from(new Set(rows.map(r => r.dims[group]))).map(v => [v, B.filter(r => r.dims[group] === v && r.status === "red").length] as const).sort((a, b) => b[1] - a[1])[0];
  const values = Array.from(new Set(rows.map(r => r.dims[group]))).sort((a, b) => (a === NO_VALUE ? 1 : 0) - (b === NO_VALUE ? 1 : 0) || a.localeCompare(b));

  return (
    <div className="ex">
      <form className="ex-ask" role="search" onSubmit={e => { e.preventDefault(); ask(text); }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input aria-label="Ask the dashboard" placeholder={`Ask the dashboard, e.g. “${queryChips[0]?.name ?? suggestions[1] ?? "What is late?"}”`} value={text} onChange={e => setText(e.target.value)} autoComplete="off" />
          <button className="btn primary" type="submit">Ask</button>
          {p.toolbar}
        </div>
        <div className="ex-sugg"><span className="muted">{queryChips.length ? "Questions" : "Try"}</span>{queryChips.map(q => <button type="button" key={q.id} className="chip" title={q.conditions.map((c, i) => `${i ? c.join.toUpperCase() + " " : ""}${c.field} ${OP_LABEL[c.op]} ${c.value}`).join(" ")} onClick={() => { setText(q.name); runNamed(q); }}>{q.name}</button>)}{suggestions.map(s => <button type="button" key={s} className="chip" onClick={() => { setText(s); ask(s); }}>{s}</button>)}</div>
        {said && <div className="ex-answer" role="status" aria-live="polite"><div className="muted">You asked: “{said.q}”</div>{said.a}</div>}
      </form>
      {chips.length > 0 && <div className="ex-chips">{chips.map((c, i) => <span key={i} className="cchip">{c.label}<button aria-label={`Remove filter ${c.label}`} onClick={c.clear}>×</button></span>)}<button className="lk" onClick={() => { setF(none()); setSaid(undefined); setRun(undefined); }}>Clear all</button></div>}
      {p.error && <div className="err" role="alert">{p.error}</div>}
      {built && (built.noGoLive > 0 || built.noProgress > 0) && <div className="muted" style={{ marginBottom: 6 }}>{built.noGoLive > 0 && `${built.noGoLive} Epic(s) have no go-live date. `}{built.noProgress > 0 && `${built.noProgress} have no progress value${x.progress.length ? "" : " (no progress source is set up yet)"}; they are assessed on dates only. `}{built.ignored > 0 && `${built.ignored} left out by state.`}</div>}

      {run && (() => {
        const rowsSorted = sort ? run.rows.slice().sort((a, b) => { const x1 = a.values[sort.key], y1 = b.values[sort.key]; if (x1 === y1) return 0; if (x1 === undefined) return 1; if (y1 === undefined) return -1;   /* blanks stay last in both directions */ const d = typeof x1 === "number" && typeof y1 === "number" ? x1 - y1 : String(x1).localeCompare(String(y1)); return sort.desc ? -d : d; }) : run.rows;
        return <div className="card ex-result" role="region" aria-label={run.query.name}>
          <h3 style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><span>{run.query.name} <span className="muted">· {run.rows.length} {run.query.show === "epics" ? "Epics" : run.query.show} · {run.month}</span></span><button className="btn" onClick={() => setRun(undefined)}>Close</button></h3>
          {!run.rows.length ? <div className="muted">Nothing matches.</div> : <div className="ex-scroll" style={{ maxHeight: 360 }}><table><thead><tr>{run.shown.map(c => <th key={c.key} aria-sort={sort?.key === c.key ? (sort.desc ? "descending" : "ascending") : undefined}><button className="lk" style={{ border: 0, background: "none", font: "inherit", fontWeight: 600, color: "inherit", cursor: "pointer", padding: 0 }} onClick={() => setSort(sort?.key === c.key ? { key: c.key, desc: !sort.desc } : { key: c.key, desc: c.type === "number" })}>{c.label}{sort?.key === c.key ? (sort.desc ? " ↓" : " ↑") : ""}</button></th>)}</tr></thead>
            <tbody>{rowsSorted.map(r => <tr key={r.key}>{run.shown.map(c => <td key={c.key}>{formatCell(c, r.values[c.key])}</td>)}</tr>)}</tbody></table></div>}
        </div>;
      })()}
      <div className="ex-strip">
        <div className="ex-tile static"><div className="l">Portfolio</div><div className="v">{B.length}</div><div className="d">{cnt(B, "idle")} not started · {cnt(B, "unknown")} not assessed</div></div>
        {(["green", "amber", "red", "done"] as ExecStatus[]).map(tile)}
        <div className="ex-tile static"><div className="l">Likely to deliver by go-live</div><div className="v">{likelyN} of {active.length}</div>
          <div className="ex-gauge" aria-hidden="true"><i style={{ width: (active.length ? likelyN / active.length * 100 : 0) + "%" }} /></div><div className="d">active Epics at {x.likelyPct}% confidence or more</div></div>
      </div>

      <div className="ex-brief">
        <div className="card"><h3><Sw s="green" />Progressing well</h3><div className="muted">{cnt(B, "green")} on track, {cnt(B, "done")} delivered.</div><ul>{good.map(r => li(r, r.pct !== undefined ? r.pct + "% done" : undefined))}{!good.length && <li className="muted">None in this view.</li>}</ul></div>
        <div className="card"><h3><Sw s="amber" />Needs attention</h3><div className="muted">{cnt(B, "amber")} could slip without action.</div><ul>{warn.map(r => li(r, r.reasons[0]))}{!warn.length && <li className="muted">None in this view.</li>}</ul></div>
        <div className="card"><h3><Sw s="red" />Go-live risk</h3><div className="muted">{cnt(B, "red")} will probably miss their go-live date{worst && worst[1] > 0 ? `; most in ${worst[0]} (${worst[1]})` : ""}.</div><ul>{bad.map(r => li(r, r.reasons[0]))}{!bad.length && <li className="muted">None in this view.</li>}</ul></div>
      </div>

      <div className={"ex-main" + (chosen ? " withpanel" : "")}>
        <div className="card">
          <h3 style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>By {dimLabel(group).toLowerCase()}
            {fields.length > 1 && <select aria-label="Group by" value={group} onChange={e => setGroup(e.target.value)}>{fields.map(k => <option key={k} value={k}>{dimLabel(k)}</option>)}</select>}</h3>
          {values.map(v => { const l = rows.filter(r => r.dims[group] === v); const on = (f.dims[group] ?? []).includes(v);
            return <button key={v} className={"ex-cat" + (on ? " on" : "")} aria-pressed={on} onClick={() => setF({ ...f, dims: { ...f.dims, [group]: toggle(f.dims[group] ?? [], v) } })}>
              <span className="n"><span>{v}</span><span className="muted">{l.length}</span></span>
              <span className="ex-stack" aria-hidden="true">{(["red", "amber", "green", "unknown", "idle", "done"] as ExecStatus[]).map(s => <i key={s} className={s} style={{ width: (l.length ? cnt(l, s) / l.length * 100 : 0) + "%" }} />)}</span>
              <span className="muted">{cnt(l, "red")} at risk · {cnt(l, "amber")} attention · {cnt(l, "green")} on track</span></button>; })}
        </div>
        <div className="card" style={{ padding: 0, minWidth: 0 }}>
          {!sorted.length ? <div className="muted" style={{ padding: 20 }}>No Epics match. Clear a filter or ask a different question.</div> : (
            <div className="ex-scroll"><table><thead><tr><th>Status</th><th>Epic</th>{fields.map(k => <th key={k}>{dimLabel(k)}</th>)}<th>Progress vs time</th><th>Go-live</th><th>Forecast</th><th>Confidence</th><th>Why</th></tr></thead>
              <tbody>{sorted.slice(0, limit).map(r => (
                <tr key={r.epic.id} className={"ex-row" + (sel === r.epic.id ? " sel" : "")} tabIndex={0} onClick={() => setSel(r.epic.id)} onKeyDown={e => { if (e.key === "Enter") setSel(r.epic.id); }}>
                  <td><span className="ex-pill"><Sw s={r.status} />{STATUS_NAME[r.status]}</span></td>
                  <td><b>{r.epic.title}</b><div className="muted">{r.epic.id}</div></td>
                  {fields.map(k => <td key={k}>{r.dims[k]}</td>)}
                  <td>{r.pct === undefined || r.status === "idle" ? <span className="muted">–</span> : <div className="ex-prog" role="img" aria-label={`${r.pct}% done${r.elapsed !== undefined ? `, ${Math.round(r.elapsed * 100)}% of the time used` : ""}`}><i className={r.status} style={{ width: r.pct + "%" }} />{r.elapsed !== undefined && <u style={{ left: Math.min(100, r.elapsed * 100) + "%" }} />}</div>}</td>
                  <td>{r.goLive !== undefined ? dayText(r.goLive) : "–"}</td><td>{r.forecast !== undefined && r.status !== "done" ? dayText(r.forecast) : "–"}</td>
                  <td className="ex-conf">{r.conf === null ? "–" : r.conf + "%"}</td><td className="ex-reason">{r.reasons[0] ?? ""}</td></tr>))}</tbody></table>
              {sorted.length > limit && <div style={{ padding: 10 }}><button className="btn" onClick={() => setLimit(limit + PAGE)}>Show {Math.min(PAGE, sorted.length - limit)} more ({sorted.length - limit} not shown)</button></div>}</div>)}
        </div>
        {chosen && <div className="card ex-panel" role="complementary" aria-label={`Details for ${chosen.epic.title}`}>
          <button className="x" aria-label="Close details" onClick={() => setSel(undefined)}>×</button>
          <h3 style={{ margin: 0 }}>{chosen.epic.title}</h3><div className="muted">Epic {chosen.epic.id} · {chosen.epic.state}</div>
          <div style={{ margin: "8px 0" }}><span className="ex-pill"><Sw s={chosen.status} />{STATUS_NAME[chosen.status]}</span></div>
          <dl>
            {fields.map(k => <React.Fragment key={k}><dt>{dimLabel(k)}</dt><dd>{chosen.dims[k]}</dd></React.Fragment>)}
            <dt>Start</dt><dd>{chosen.start !== undefined ? dayText(chosen.start) : "–"}</dd><dt>Go-live</dt><dd>{chosen.goLive !== undefined ? dayText(chosen.goLive) : "–"}</dd>
            <dt>Forecast</dt><dd>{chosen.forecast !== undefined && chosen.status !== "done" ? dayText(chosen.forecast) + (chosen.slip > 0 ? ` (${chosen.slip} days late)` : "") : "–"}</dd>
            <dt>Progress</dt><dd>{chosen.pct !== undefined ? `${chosen.pct}%${chosen.elapsed !== undefined ? ` (time used ${Math.round(Math.min(chosen.elapsed, 1.5) * 100)}%)` : ""}` : "no value"}{chosen.pctFrom && <div className="muted">from {chosen.pctFrom}</div>}</dd>
            <dt>Confidence</dt><dd>{chosen.conf === null ? "–" : chosen.conf + "% of delivering by go-live"}</dd>
          </dl>
          <b>Why this status</b><ul>{chosen.reasons.map((s, i) => <li key={i}>{s}</li>)}</ul>
          {chosen.over.length > 0 && <div className="muted">Over capacity: {chosen.over.join(", ")}</div>}
          <p><button className="btn" onClick={() => setDialog(chosen.epic.id)}>Open the Epic details</button></p>
        </div>}
      </div>
      <div className="ex-legend"><span><Sw s="green" />On track</span><span><Sw s="amber" />Needs attention</span><span><Sw s="red" />At risk</span><span><Sw s="unknown" />Not assessed</span><span><Sw s="idle" />Not started</span><span><Sw s="done" />Done</span><span className="muted">Bar = progress · black tick = share of time used</span></div>
      {dialog !== undefined && chosen && <EpicDialog epic={chosen.epic} project={p.project.name} bookings={L.bookings} months={months} onClose={() => setDialog(undefined)} />}
    </div>
  );
}
