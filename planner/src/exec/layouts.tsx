import * as React from "react";
import { dimLabel, ExecStatus, NO_VALUE, STATUS_NAME } from "../core/executive";
import { PlannerSettings } from "../core/types";
import { MOVED, signed } from "../core/history";
import { deltaOf, health, series, Snapshot } from "../core/snapshots";
import { byStatus, countBy, isEmpty, Item, pass, quarterOf, SHOWN, Skip, sortQuarters, toggle, XF } from "./model";
import { COLOR, Columns, Delta, Donut, ProgressBar, Slicer, Spark, StackedBars, StatusPill, Sw, pct } from "./parts";

export interface ExtraCol { key: string; label: string; get(i: Item): string }
export interface LP {
  all: Item[]; items: Item[]; f: XF; setF(f: XF): void; fields: string[]; settings: PlannerSettings;
  open(i: Item): void; day(t?: number): string; extra: ExtraCol[]; today: number;
  /** the history of the go-live date was read: show moves, marks and the slicer */
  historyOn: boolean;
  /** the weekly snapshots (this week last): trends and the change since last week, shown while no filter is applied */
  snaps?: Snapshot[];
}
const DAY = 86400000;

/** The values of a slicer with the count each would give with the other slicers applied. */
export function optionsOf(lp: LP, skip: Skip, key: (i: Item) => string, order?: (v: string[]) => string[]) {
  const m = countBy(lp.all.filter(i => pass(i, lp.f, skip)), key);
  const vals = new Set(lp.all.map(key));
  const list = Array.from(vals);
  return (order ? order(list) : list.sort((a, b) => (a === NO_VALUE ? 1 : 0) - (b === NO_VALUE ? 1 : 0) || a.localeCompare(b))).map(value => ({ value, count: m.get(value) ?? 0 }));
}

const MOVED_ORDER = [MOVED.recent, MOVED.later, MOVED.earlier, MOVED.often, MOVED.same, MOVED.none] as string[];
/** The "go-live changes" words with the count each would give; an Epic can carry several. */
export function movedOptions(lp: LP) { const base = lp.all.filter(i => pass(i, lp.f, "moved")); return MOVED_ORDER.map(value => ({ value, count: base.filter(i => i.moved.includes(value)).length })).filter(o => o.count > 0 || lp.f.moved.includes(o.value)); }

/** All the slicers as pop-up lists (Report and Roadmap layouts). */
export function Slicers(lp: LP) {
  const { f, setF } = lp;
  return (
    <div className="ex-slicers" role="group" aria-label="Filters">
      <Slicer label="Status" options={SHOWN.map(s => ({ value: s, count: lp.all.filter(i => pass(i, f, "status") && i.status === s).length, color: COLOR[s] })).map(o => ({ ...o, value: STATUS_NAME[o.value as ExecStatus] }))} selected={f.status.map(s => STATUS_NAME[s])}
        onChange={v => setF({ ...f, status: SHOWN.filter(s => v.includes(STATUS_NAME[s])) })} />
      <Slicer label="State" options={optionsOf(lp, "state", i => i.state)} selected={f.state} onChange={v => setF({ ...f, state: v })} />
      {lp.fields.map(d => <Slicer key={d} label={dimLabel(d)} options={optionsOf(lp, { dim: d }, i => i.r.dims[d])} selected={f.dims[d] ?? []} onChange={v => setF({ ...f, dims: { ...f.dims, [d]: v } })} />)}
      <Slicer label="Team" options={optionsOf(lp, "team", i => i.team)} selected={f.team} onChange={v => setF({ ...f, team: v })} />
      <Slicer label="Go-live" options={optionsOf(lp, "quarter", i => i.quarter, sortQuarters)} selected={f.quarter} onChange={v => setF({ ...f, quarter: v })} />
      {lp.historyOn && <Slicer label="Go-live changes" options={movedOptions(lp)} selected={f.moved} onChange={v => setF({ ...f, moved: v })} />}
    </div>
  );
}

const Kpi = (p: { label: React.ReactNode; value: number | string; detail: React.ReactNode; on?: boolean; dim?: boolean; onClick(): void; c?: string; spark?: React.ReactNode; delta?: React.ReactNode; hero?: React.ReactNode }) =>
  <button type="button" className={"ex-kpi" + (p.hero ? " hero" : "") + (p.on ? " on" : p.dim ? " dim" : "")} aria-pressed={p.on} onClick={p.onClick} style={p.c ? { ["--c" as string]: p.c } : undefined}>
    <div className="l">{p.label}</div><div className="row"><div className="v">{p.value}</div>{p.spark ?? p.hero}</div><div className="d"><span>{p.detail}</span>{p.delta}</div></button>;

/** Portfolio health, then one card per status; the trend and the change since last week come from the weekly snapshots. */
function KpiRow({ lp }: { lp: LP }) {
  const base = lp.all.filter(i => pass(i, lp.f, "status")), c = byStatus(base), snaps = lp.snaps ?? [];
  const trend = snaps.length > 0 && lp.all.length > 0 && isEmpty({ ...lp.f, status: [] }), score = health(c), act = base.length - c.idle;
  const R = 44, C = Math.PI * R, prevScore = snaps.length > 1 ? health(snaps[snaps.length - 2]) : undefined;
  return (
    <div className="ex-kpis">
      <Kpi hero label="Portfolio health" value={score + "%"} detail={`${base.length} Epics · ${act} in delivery`} delta={trend && prevScore !== undefined ? <Delta d={score - prevScore} good /> : undefined} onClick={() => lp.setF({ ...lp.f, status: [] })}
        spark={<svg width="110" height="64" viewBox="0 0 110 64" aria-hidden="true"><path d="M11 58 A44 44 0 0 1 99 58" fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="9" strokeLinecap="round" /><path d="M11 58 A44 44 0 0 1 99 58" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeDasharray={`${C * score / 100} ${C}`} /></svg>} />
      {lp.historyOn && <Kpi c="#8a1f45" label={<>↔ Go-live moved</>} value={lp.all.filter(i => pass(i, lp.f, "moved") && pass(i, lp.f, "status") && i.moved.includes(MOVED.recent)).length} detail={`in the last ${lp.settings.history.windowDays} days`} on={lp.f.moved.includes(MOVED.recent)} dim={lp.f.moved.length > 0 && !lp.f.moved.includes(MOVED.recent)} onClick={() => lp.setF({ ...lp.f, moved: toggle(lp.f.moved, MOVED.recent) })} />}
      {(["green", "amber", "red", "idle", "done"] as ExecStatus[]).map(s => <Kpi key={s} c={COLOR[s]} label={<><Sw s={s} />{STATUS_NAME[s]}</>} value={c[s]} detail={`${pct(c[s], base.length)}% of Epics`} on={lp.f.status.includes(s)} dim={lp.f.status.length > 0 && !lp.f.status.includes(s)} onClick={() => lp.setF({ ...lp.f, status: toggle(lp.f.status, s) })}
        spark={trend ? <Spark values={series(snaps, s)} color={COLOR[s]} /> : undefined} delta={trend ? <Delta d={deltaOf(snaps, s)} good={s === "green" || s === "done" ? true : s === "amber" || s === "red" ? false : undefined} /> : undefined} />)}
    </div>
  );
}

type SortKey = "status" | "title" | "dim" | "state" | "pct" | "goLive" | "forecast" | "conf" | string;
/** The Epics as a table: sortable, with progress against time and the calculated fields. */
export function ItemsTable({ lp, items, limit = 100 }: { lp: LP; items: Item[]; limit?: number }) {
  const [sort, setSort] = React.useState<{ k: SortKey; d: number }>({ k: "status", d: 1 }), [more, setMore] = React.useState(limit);
  const order = { red: 0, amber: 1, green: 2, unknown: 3, idle: 4, done: 5 };
  const val = (i: Item, k: SortKey): number | string => k === "status" ? order[i.status] * 1e6 - i.r.slip : k === "title" ? i.title : k === "state" ? i.state : k === "dim" ? i.r.dims[lp.fields[0]] : k === "pct" ? i.r.pct ?? -1 : k === "goLive" ? i.r.goLive ?? 9e15 : k === "forecast" ? i.r.forecast ?? 9e15 : k === "conf" ? i.r.conf ?? -1 : k === "moves" ? i.sum.moves : lp.extra.find(c => c.key === k)?.get(i) ?? "";
  const rows = React.useMemo(() => [...items].sort((a, b) => { const x = val(a, sort.k), y = val(b, sort.k); return ((x > y ? 1 : x < y ? -1 : 0) || a.title.localeCompare(b.title)) * sort.d; }), [items, sort]);   // eslint-disable-line react-hooks/exhaustive-deps
  const th = (k: SortKey, label: string) => <th key={k} aria-sort={sort.k === k ? (sort.d > 0 ? "ascending" : "descending") : "none"}><button className="lk" onClick={() => setSort({ k, d: sort.k === k ? -sort.d : 1 })}>{label}{sort.k === k ? (sort.d > 0 ? " ▲" : " ▼") : ""}</button></th>;
  return (
    <div className="ex-tablewrap"><table className="ex-table"><thead><tr>{th("status", "Status")}{th("title", "Epic")}{th("dim", dimLabel(lp.fields[0]))}{th("state", "State")}{th("pct", "Progress vs time")}{th("goLive", "Go-live")}{th("forecast", "Forecast")}{lp.historyOn && th("moves", "Go-live changes")}{th("conf", "Confidence")}<th>Why</th>{lp.extra.map(c => th(c.key, c.label))}</tr></thead>
      <tbody>{rows.slice(0, more).map(i => <tr key={i.id} className="ex-row" tabIndex={0} onClick={() => lp.open(i)} onKeyDown={e => { if (e.key === "Enter") lp.open(i); }}>
        <td><StatusPill s={i.status} /></td><td><b>{i.title}</b><div className="muted">{i.id}</div></td><td>{i.r.dims[lp.fields[0]]}</td><td>{i.state}</td>
        <td><ProgressBar i={i} /> <span>{i.r.pct === undefined ? "–" : i.r.pct + "%"}</span></td><td>{lp.day(i.r.goLive)}</td>
        <td>{i.status === "done" ? "–" : lp.day(i.r.forecast)}{i.r.slip > 0 && i.status !== "done" && <span className="ex-slip"> +{i.r.slip}d</span>}</td>{lp.historyOn && <td title={i.hist ? `Original ${lp.day(Date.parse(i.hist.baseline + "T00:00:00Z"))}` : undefined}>{i.sum.moves ? <><b>{i.sum.moves}×</b> <span className={i.sum.net > 0 ? "ex-slip" : "ex-good"}>{signed(i.sum.net)}d</span></> : "–"}</td>}<td>{i.r.conf === null ? "–" : i.r.conf + "%"}</td><td className="muted">{i.r.reasons[0]}</td>{lp.extra.map(c => <td key={c.key}>{c.get(i)}</td>)}</tr>)}</tbody></table>
      {rows.length > more && <div style={{ padding: 10 }}><button className="btn" onClick={() => setMore(more + 100)}>Show {Math.min(100, rows.length - more)} more ({rows.length - more} left)</button></div>}
      {!rows.length && <div className="muted" style={{ padding: 14 }}>No Epics match the filters.</div>}</div>
  );
}

/** Layout 1: slicers, status cards, three charts that filter each other, and the table. */
export function ReportLayout({ lp }: { lp: LP }) {
  const { f, setF, items } = lp, [dim, setDim] = React.useState(lp.fields[0]);
  React.useEffect(() => { if (!lp.fields.includes(dim)) setDim(lp.fields[0]); }, [lp.fields.join("|")]);   // eslint-disable-line react-hooks/exhaustive-deps
  const forStatus = lp.all.filter(i => pass(i, f, "status")), counts = byStatus(forStatus);
  const forDim = lp.all.filter(i => pass(i, f, { dim })), forQ = lp.all.filter(i => pass(i, f, "quarter"));
  const dimRows = optionsOf(lp, { dim }, i => i.r.dims[dim]).map(o => ({ label: o.value, counts: byStatus(forDim.filter(i => i.r.dims[dim] === o.value)) })).filter(r => SHOWN.some(s => r.counts[s])).sort((a, b) => SHOWN.reduce((x, s) => x + b.counts[s], 0) - SHOWN.reduce((x, s) => x + a.counts[s], 0)).slice(0, 12);
  const qs = sortQuarters(Array.from(new Set(lp.all.map(i => i.quarter)))).map(q => ({ label: q, counts: byStatus(forQ.filter(i => i.quarter === q)) }));
  const pick = (label: string, s?: ExecStatus, which?: "dim" | "q") => setF(which === "q" ? { ...f, quarter: toggle(f.quarter, label), status: s ? toggle(f.status, s) : f.status } : { ...f, dims: { ...f.dims, [dim]: toggle(f.dims[dim] ?? [], label) }, status: s ? toggle(f.status, s) : f.status });
  return (
    <div className="ex-report">
      <Slicers {...lp} /><KpiRow lp={lp} />
      <div className="ex-charts">
        <section className="ex-card"><h4>Delivery status <span>click a slice</span></h4><Donut counts={counts} total={forStatus.length} selected={f.status} onPick={s => setF({ ...f, status: toggle(f.status, s) })} /></section>
        <section className="ex-card"><h4>{lp.fields.length > 1 ? <select aria-label="Chart by" value={dim} onChange={e => setDim(e.target.value)}>{lp.fields.map(d => <option key={d} value={d}>By {dimLabel(d).toLowerCase()}</option>)}</select> : <>By {dimLabel(dim).toLowerCase()}</>} <span>Epics, by status</span></h4>
          <StackedBars rows={dimRows} selected={f.dims[dim] ?? []} selectedStatus={f.status} onPick={(l, s) => pick(l, s, "dim")} /></section>
        <section className="ex-card"><h4>Go-live by quarter <span>Epics</span></h4><Columns cols={qs} selected={f.quarter} selectedStatus={f.status} onPick={(l, s) => pick(l, s, "q")} /></section>
      </div>
      <section className="ex-card"><h4>Epics <span>{items.length} of {lp.all.length}</span></h4><ItemsTable lp={lp} items={items} /></section>
    </div>
  );
}

/** Layout 2: a rail of slicers with counts, a map of the portfolio (block size = hours booked, colour = status) and the Epics that need attention. */
export function MapLayout({ lp }: { lp: LP }) {
  const { f, setF, items } = lp, ref = React.useRef<HTMLDivElement>(null), [w, setW] = React.useState(700);
  React.useEffect(() => { const el = ref.current; if (!el) return; const size = () => setW(el.clientWidth || 700); size(); if (typeof ResizeObserver === "undefined") { window.addEventListener("resize", size); return () => window.removeEventListener("resize", size); } const ro = new ResizeObserver(size); ro.observe(el); return () => ro.disconnect(); }, []);
  const rail = (title: string, opts: { value: string; count: number; color?: string }[], sel: string[], on: (v: string[]) => void) => <div key={title} className="ex-railgrp"><h5>{title}{sel.length > 0 && <button className="lk" onClick={() => on([])}>clear</button>}</h5>
    {opts.map(o => <label key={o.value}><input type="checkbox" checked={sel.includes(o.value)} onChange={() => on(toggle(sel, o.value))} />{o.color && <i className="dot" style={{ background: o.color }} />}<span className="t">{o.value}</span><span className="n">{o.count}</span></label>)}</div>;
  const d0 = lp.fields[0], H = 440;
  const groups = Array.from(new Set(items.map(i => i.r.dims[d0]))).map(g => ({ g, list: items.filter(i => i.r.dims[d0] === g).sort((a, b) => b.hours - a.hours) })).sort((a, b) => b.list.reduce((s, i) => s + wt(i), 0) - a.list.reduce((s, i) => s + wt(i), 0));
  const half = Math.ceil(groups.length / 2), rows = [groups.slice(0, half), groups.slice(half)].filter(r => r.length);
  const rowT = rows.map(r => r.reduce((s, g) => s + g.list.reduce((a, i) => a + wt(i), 0), 0)), allT = rowT.reduce((a, b) => a + b, 0) || 1;
  const blocks: React.ReactNode[] = []; let y = 0;
  rows.forEach((r, ri) => { const rh = H * rowT[ri] / allT; let x = 0;
    r.forEach(g => { const gt = g.list.reduce((a, i) => a + wt(i), 0), gw = w * gt / rowT[ri];
      blocks.push(<div key={"c" + ri + g.g} className="ex-cat" style={{ left: x, top: y, width: gw, height: rh }}><div className="cl">{g.g} · {g.list.length}</div>{(() => { const cols = Math.max(1, Math.round(Math.sqrt(g.list.length * gw / Math.max(1, rh) / 1.6))), per = Math.ceil(g.list.length / cols); const out: React.ReactNode[] = []; let cx = 0;
        for (let c = 0; c < cols; c++) { const part = g.list.slice(c * per, (c + 1) * per); if (!part.length) continue; const ct = part.reduce((a, i) => a + wt(i), 0), cw = gw * ct / gt; let cy = 22;
          part.forEach(i => { const bh = Math.max(1, (rh - 22) * wt(i) / ct); out.push(<button key={i.id} type="button" className={"ex-blk " + i.status} style={{ left: cx, top: cy, width: cw, height: bh, background: COLOR[i.status] }} onClick={() => lp.open(i)} title={`${i.title}\n${STATUS_NAME[i.status]} · ${i.r.pct ?? "–"}% · ${i.hours.toLocaleString()} h`}>{bh > 26 && cw > 64 ? <b>{i.title}</b> : null}{bh > 48 && cw > 90 ? <span>{i.r.pct ?? "–"}% · {i.state}</span> : null}</button>); cy += bh; }); cx += cw; } return out; })()}</div>); x += gw; });
    y += rh; });
  const attention = items.filter(i => i.status === "red" || i.status === "amber").sort((a, b) => (a.status === "red" ? 0 : 1) - (b.status === "red" ? 0 : 1) || b.r.slip - a.r.slip).slice(0, 12);
  return (
    <div className="ex-maplayout">
      <aside className="ex-rail" aria-label="Filters">
        {rail("Status", SHOWN.map(s => ({ value: STATUS_NAME[s], count: lp.all.filter(i => pass(i, f, "status") && i.status === s).length, color: COLOR[s] })), f.status.map(s => STATUS_NAME[s]), v => setF({ ...f, status: SHOWN.filter(s => v.includes(STATUS_NAME[s])) }))}
        {rail("State", optionsOf(lp, "state", i => i.state), f.state, v => setF({ ...f, state: v }))}
        {lp.fields.map(d => rail(dimLabel(d), optionsOf(lp, { dim: d }, i => i.r.dims[d]), f.dims[d] ?? [], v => setF({ ...f, dims: { ...f.dims, [d]: v } })))}
        {rail("Team", optionsOf(lp, "team", i => i.team), f.team, v => setF({ ...f, team: v }))}
        {rail("Go-live", optionsOf(lp, "quarter", i => i.quarter, sortQuarters), f.quarter, v => setF({ ...f, quarter: v }))}
        {lp.historyOn && rail("Go-live changes", movedOptions(lp), f.moved, v => setF({ ...f, moved: v }))}
      </aside>
      <div className="ex-mapmain"><KpiRow lp={lp} />
        <div className="ex-mapcols">
          <section className="ex-card"><h4>Where is the portfolio at risk? <span>block size = hours booked · colour = status · {items.length} Epics</span></h4>
            <div className="ex-map" ref={ref} style={{ height: H }}>{blocks}{!items.length && <div className="muted" style={{ padding: 14 }}>No Epics match the filters.</div>}</div></section>
          <section className="ex-card"><h4>Needs your attention <span>worst first</span></h4>
            <div className="ex-att">{attention.map(i => <button key={i.id} type="button" className="it" onClick={() => lp.open(i)}><Sw s={i.status} /><div><b>{i.title}</b><div className="muted">{i.r.dims[d0]} · {i.r.reasons[0]}</div><ProgressBar i={i} /></div><span className="ex-slip">{i.r.slip > 0 ? `+${i.r.slip}d` : ""}</span></button>)}
              {!attention.length && <div className="muted">Nothing needs attention in this view.</div>}</div></section>
        </div></div>
    </div>
  );
}
const wt = (i: Item) => Math.max(40, i.hours);       // an Epic without hours still gets a block

/** Layout 3: a headline in words, the status bar, and a roadmap, scorecards or table. */
export function RoadmapLayout({ lp }: { lp: LP }) {
  const [tab, setTab] = React.useState<"Roadmap" | "Scorecards" | "Table">("Roadmap");
  const { f, setF, items } = lp, d0 = lp.fields[0], base = lp.all.filter(i => pass(i, f, "status")), c = byStatus(base);
  const worst = Array.from(new Set(base.map(i => i.r.dims[d0]))).map(g => [g, base.filter(i => i.r.dims[d0] === g && i.status === "red").length] as const).sort((a, b) => b[1] - a[1])[0];
  const soon = base.filter(i => i.status !== "done" && i.r.goLive !== undefined && i.r.goLive >= lp.today && i.r.goLive < lp.today + 90 * DAY).length;
  return (
    <div className="ex-story">
      <section className="ex-card ex-head">
        <div className="hl"><button className="hlb red" onClick={() => setF({ ...f, status: toggle(f.status, "red") })}>{c.red} of {base.length}</button> Epics are at risk{worst && worst[1] > 0 && worst[0] !== NO_VALUE ? <>, mostly <button className="hlb" onClick={() => setF({ ...f, dims: { ...f.dims, [d0]: toggle(f.dims[d0] ?? [], worst[0]) } })}>{worst[0]}</button></> : null}.</div>
        <div className="muted">{c.green} on track · {c.amber} need attention · {c.done} delivered. {soon} go-live{soon === 1 ? "" : "s"} fall in the next 90 days.</div>
        <div className="ex-rag" role="group" aria-label="Status mix">{SHOWN.filter(s => c[s]).map(s => <button key={s} type="button" className={f.status.length && !f.status.includes(s) ? "dim" : ""} style={{ flex: c[s], background: COLOR[s] }} aria-pressed={f.status.includes(s)} onClick={() => setF({ ...f, status: toggle(f.status, s) })}>{c[s]} {STATUS_NAME[s]}</button>)}</div>
      </section>
      <Slicers {...lp} />
      <div className="ex-tabs" role="tablist">{(["Roadmap", "Scorecards", "Table"] as const).map(t => <button key={t} role="tab" aria-selected={tab === t} className={"ex-tab" + (tab === t ? " on" : "")} onClick={() => setTab(t)}>{t}</button>)}</div>
      {tab === "Roadmap" ? <Roadmap lp={lp} /> : tab === "Scorecards" ? <Scorecards lp={lp} /> : <section className="ex-card"><ItemsTable lp={lp} items={items} /></section>}
    </div>
  );
}

function Roadmap({ lp }: { lp: LP }) {
  const { items } = lp, d0 = lp.fields[0], [open, setOpen] = React.useState<string[]>([]), [limit, setLimit] = React.useState<Record<string, number>>({});
  const dated = items.filter(i => i.r.goLive !== undefined);
  if (!dated.length) return <section className="ex-card muted">No Epic has a go-live date, so there is nothing to draw. Set the go-live date field in Settings.</section>;
  const lo = Math.min(...dated.map(i => i.r.start ?? i.r.goLive!), lp.today - 30 * DAY), hi = Math.max(...dated.map(i => Math.max(i.r.goLive!, i.r.forecast ?? 0)), lp.today + 60 * DAY);
  const m0 = new Date(Date.UTC(new Date(lo).getUTCFullYear(), new Date(lo).getUTCMonth(), 1)); const months: Date[] = [];
  for (let d = m0; +d <= hi && months.length < 36; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) months.push(d);
  const T0 = +months[0], T1 = +new Date(Date.UTC(months[months.length - 1].getUTCFullYear(), months[months.length - 1].getUTCMonth() + 1, 1)), pos = (t: number) => Math.max(0, Math.min(100, (t - T0) / (T1 - T0) * 100));
  const groups = Array.from(new Set(dated.map(i => i.r.dims[d0]))).sort((a, b) => (a === NO_VALUE ? 1 : 0) - (b === NO_VALUE ? 1 : 0) || a.localeCompare(b));
  const track = (kids: React.ReactNode) => <div className="tr" style={{ backgroundSize: `${100 / months.length}% 100%` }}>{kids}</div>;
  return (
    <section className="ex-road" aria-label="Roadmap">
      <div className="rh"><div className="nm"><button className="lk" onClick={() => setOpen(open.length ? [] : groups)}>{open.length ? "Collapse all" : "Expand all"}</button></div><div className="mo" style={{ gridTemplateColumns: `repeat(${months.length}, 1fr)` }}>{months.map((m, k) => <span key={k}>{m.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}{m.getUTCMonth() === 0 || k === 0 ? " " + String(m.getUTCFullYear()).slice(2) : ""}</span>)}</div></div>
      <div className="body">
        {groups.map(g => { const list = dated.filter(i => i.r.dims[d0] === g).sort((a, b) => a.r.goLive! - b.r.goLive!), isOpen = open.includes(g), c = byStatus(list), lim = limit[g] ?? 40;
          return <React.Fragment key={g}>
            <div className="lane cat"><button className="nm" aria-expanded={isOpen} onClick={() => setOpen(toggle(open, g))}><span aria-hidden="true">{isOpen ? "▾" : "▸"}</span> <b>{g}</b><small>{list.length} Epics · {c.red} at risk</small></button>
              {track(<div className="mix" aria-hidden="true">{SHOWN.filter(s => c[s]).map(s => <i key={s} style={{ flex: c[s], background: COLOR[s] }} />)}</div>)}</div>
            {isOpen && list.slice(0, lim).map(i => { const l = pos(i.r.start ?? i.r.goLive! - 90 * DAY), r = pos(i.r.goLive!), f = i.r.forecast, late = i.r.slip > 0 && i.status !== "done", b0 = lp.historyOn && i.hist && i.hist.baseline !== i.hist.current ? Date.parse(i.hist.baseline + "T00:00:00Z") : undefined;
              return <div className="lane" key={i.id}><div className="nm"><button className="lk" onClick={() => lp.open(i)}>{i.title}</button><small>{i.state}</small></div>
                {track(<><button type="button" className="gb" style={{ left: l + "%", width: Math.max(.6, r - l) + "%", background: COLOR[i.status] }} onClick={() => lp.open(i)} title={`${i.title}\n${STATUS_NAME[i.status]} · ${i.r.pct ?? "–"}% · go-live ${lp.day(i.r.goLive)}`}><u style={{ width: (i.r.pct ?? 0) + "%" }} /></button>
                  {late && f !== undefined && <div className="slipx" style={{ left: r + "%", width: Math.max(.4, pos(f) - r) + "%" }} title="Forecast slip" />}
                  {b0 !== undefined && <><div className={"mvline " + (b0 < i.r.goLive! ? "later" : "earlier")} style={{ left: Math.min(pos(b0), r) + "%", width: Math.max(.2, Math.abs(r - pos(b0))) + "%" }} /><div className="orig" style={{ left: `calc(${pos(b0)}% - 5px)` }} title={`Original go-live ${lp.day(b0)} · moved ${i.sum.moves}× (${signed(i.sum.net)} days)`} /></>}
                  {f !== undefined && i.status !== "done" && i.status !== "idle" && <div className="diam" style={{ left: `calc(${pos(f)}% - 6px)` }} title={`Forecast finish ${lp.day(f)}`} />}</>)}</div>; })}
            {isOpen && list.length > lim && <div className="lane"><div className="nm"><button className="lk" onClick={() => setLimit({ ...limit, [g]: lim + 40 })}>Show 40 more ({list.length - lim} left)</button></div>{track(null)}</div>}
          </React.Fragment>; })}
        <div className="today" style={{ left: `calc(220px + (100% - 220px) * ${pos(lp.today) / 100})` }}><span>Today</span></div>
      </div>
      <div className="muted" style={{ padding: "6px 10px" }}>Collapsed row: the stripe is the group\u2019s status mix (not dates). Bar = start to go-live (hover or click for the title), darker part = progress · hatched = forecast slip · ◆ = forecast finish{lp.historyOn ? " · ◇ and a line = where the go-live date was originally (red = moved later)" : ""}. Epics without a go-live date are not drawn.</div>
    </section>
  );
}

function Scorecards({ lp }: { lp: LP }) {
  const { f, setF } = lp, d0 = lp.fields[0], base = lp.all.filter(i => pass(i, f, { dim: d0 }));
  const groups = Array.from(new Set(base.map(i => i.r.dims[d0]))).sort((a, b) => (a === NO_VALUE ? 1 : 0) - (b === NO_VALUE ? 1 : 0) || a.localeCompare(b));
  return (
    <div className="ex-cards">{groups.map(g => { const list = base.filter(i => i.r.dims[d0] === g), act = list.filter(i => i.status === "green" || i.status === "amber" || i.status === "red"), c = byStatus(list), on = (f.dims[d0] ?? []).includes(g);
      const avg = act.length ? Math.round(act.reduce((a, i) => a + (i.r.pct ?? 0), 0) / act.length) : 0, conf = act.filter(i => i.r.conf !== null), cf = conf.length ? Math.round(conf.reduce((a, i) => a + i.r.conf!, 0) / conf.length) : 0;
      const next = list.filter(i => i.status !== "done" && i.r.goLive !== undefined && i.r.goLive >= lp.today).sort((a, b) => a.r.goLive! - b.r.goLive!)[0];
      return <button key={g} type="button" className={"ex-sc" + (on ? " on" : "")} aria-pressed={on} onClick={() => setF({ ...f, dims: { ...f.dims, [d0]: toggle(f.dims[d0] ?? [], g) } })}>
        <h4>{g}<span>{list.length} Epics</span></h4><div className="big">{avg}% <small>average progress</small></div>
        <div className="mix" aria-hidden="true">{SHOWN.filter(s => c[s]).map(s => <i key={s} style={{ flex: c[s], background: COLOR[s] }} title={`${STATUS_NAME[s]}: ${c[s]}`} />)}</div>
        <div className="kv2"><span>Delivery confidence</span><b>{cf}%</b></div><div className="kv2"><span>At risk / need attention</span><b>{c.red} / {c.amber}</b></div><div className="kv2"><span>Next go-live</span><b>{next ? lp.day(next.r.goLive) : "–"}</b></div></button>; })}</div>
  );
}
