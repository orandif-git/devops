import * as React from "react";
import { dimLabel, ExecStatus, STATUS_NAME } from "../../core/executive";
import { stageDatesOn, stagesOn } from "../../core/stages";
import { health } from "../../core/snapshots";
import { quarterLabel, quartersIn, summarizeDelivery } from "../../core/delivery";
import { parseDay } from "../../core/execPeriod";
import { ByFieldCard } from "../ByField";
import { DeliveryCard } from "../Delivery";
import { PipelineCard } from "../Pipeline";
import { sdateOptions } from "../layouts";
import type { LP } from "../layouts";
import { byStatus, isEmpty, Item, pass, SDATE, SHOWN, sortQuarters, toggle } from "../model";
import { COLOR, Columns, Delta, Num, Spark, Sw } from "../parts";

export type Tab = "overview" | "pipeline" | "epics" | "insights";
const ORDER: ExecStatus[] = ["green", "amber", "red", "idle", "done"];
const DAY = 86400000;
const pctOf = (n: number, d: number) => (d ? Math.round(100 * n / d) : 0);

export const StatusMark = ({ s }: { s: ExecStatus }) => <span className="exm-st"><Sw s={s} size={20} />{STATUS_NAME[s]}</span>;
const Mix = ({ c, n }: { c: Record<ExecStatus, number>; n: number }) => <div className="exm-stk" aria-hidden="true">{SHOWN.filter(s => c[s]).map(s => <i key={s} style={{ width: `${c[s] / n * 100}%`, background: COLOR[s] }} title={`${STATUS_NAME[s]}: ${c[s]}`} />)}</div>;
const why = (i: Item) => i.r.check ?? i.r.reasons[0] ?? "";
const slipPill = (i: Item) => (i.r.slip > 0 && i.status !== "done" ? <span className={"exm-pill " + (i.status === "red" ? "r" : "a")}>+{i.r.slip} d</span> : <span className="exm-mut">–</span>);

/** The Epics as a table in the modern look: sortable, a row opens the Epic panel. `cols` picks the columns; the calculated fields of the settings come last on the Epics page. */
export function EpicTable({ lp, items, cols, compact, sel }: { lp: LP; items: Item[]; cols: string[]; compact?: boolean; sel?: number }) {
  const [sort, setSort] = React.useState<{ k: string; d: number }>({ k: "status", d: 1 });
  const dim = lp.fields[0], order: Record<ExecStatus, number> = { red: 0, amber: 1, green: 2, unknown: 3, idle: 4, done: 5 };
  const D: Record<string, { h: string; cls?: string; v(i: Item): React.ReactNode; k(i: Item): number | string }> = {
    status: { h: "Status", v: i => <StatusMark s={i.status} />, k: i => order[i.status] * 1e6 - i.r.slip },
    title: { h: "Epic", v: i => <><b>{i.title}</b><span className="exm-sub">#{i.id}</span></>, k: i => i.title },
    dim: { h: dimLabel(dim), v: i => i.r.dims[dim], k: i => i.r.dims[dim] },
    stage: { h: "Stage", v: i => i.stage || i.stageGap || "–", k: i => i.r.stageIdx ?? -1 },
    why: { h: "Why", cls: "why", v: i => <span className="exm-mut">{why(i)}</span>, k: why },
    pct: { h: "Progress", v: i => <span className="exm-pg"><span className="exm-prog"><i style={{ width: (i.r.pct ?? 0) + "%", background: COLOR[i.status] }} /></span>{i.r.pct === undefined ? "–" : i.r.pct + "%"}</span>, k: i => i.r.pct ?? -1 },
    goLive: { h: "Go-live", v: i => lp.day(i.r.goLive), k: i => i.r.goLive ?? 9e15 },
    forecast: { h: "Forecast", v: i => (i.status === "done" ? "Delivered" : lp.day(i.r.forecast)), k: i => i.r.forecast ?? 9e15 },
    slip: { h: "Slip", cls: "r", v: slipPill, k: i => i.r.slip },
    moves: { h: "Moved", cls: "r", v: i => (i.sum.moves ? `${i.sum.moves}×` : "–"), k: i => i.sum.moves },
  };
  lp.extra.forEach(e => { D["x:" + e.key] = { h: e.label, v: i => e.get(i), k: i => e.get(i) }; });
  const use = cols.flatMap(c => (c === "extra" ? lp.extra.map(e => "x:" + e.key) : [c]));
  const rows = React.useMemo(() => (compact ? items : [...items].sort((a, b) => { const x = D[sort.k]?.k(a) ?? 0, y = D[sort.k]?.k(b) ?? 0; return ((x > y ? 1 : x < y ? -1 : 0) || a.title.localeCompare(b.title)) * sort.d; })), [items, sort, compact]);   // eslint-disable-line react-hooks/exhaustive-deps
  const [shown, setShown] = React.useState(100);
  return (
    <div className="exm-tw"><table className={"exm-t" + (compact ? " cmp" : "") + (use.includes("dim") ? " ep" : "")}><thead><tr>{use.map(c => <th key={c} className={D[c].cls} aria-sort={!compact && sort.k === c ? (sort.d > 0 ? "ascending" : "descending") : "none"}>{compact ? D[c].h : <button type="button" className={sort.k === c ? "s" : ""} onClick={() => setSort({ k: c, d: sort.k === c ? -sort.d : 1 })}>{D[c].h}{sort.k === c ? (sort.d > 0 ? " ▴" : " ▾") : ""}</button>}</th>)}</tr></thead>
      <tbody>{rows.slice(0, compact ? rows.length : shown).map(i => <tr key={i.id} className={"rw" + (sel === i.id ? " sel" : "")} tabIndex={0} aria-label={`${i.title}: ${STATUS_NAME[i.status]}`} data-ep={i.id} onClick={() => lp.open(i)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); lp.open(i); } if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); const n = (e.currentTarget as HTMLElement)[e.key === "ArrowDown" ? "nextElementSibling" : "previousElementSibling"] as HTMLElement | null; n?.focus(); } }}>
        {use.map(c => <td key={c} className={D[c].cls}>{D[c].v(i)}</td>)}</tr>)}
        {!rows.length && <tr><td colSpan={use.length}><div className="exm-empty">No Epics match.</div></td></tr>}</tbody></table>
      {!compact && rows.length > shown && <button type="button" className="exm-more-rows" onClick={() => setShown(shown + 200)}>Show more ({rows.length - shown} left)</button>}</div>
  );
}

/** Where the Epics go live in the next months: a lane per value of the first category field, a dot per Epic. */
function Timeline({ lp, items }: { lp: LP; items: Item[] }) {
  const dim = lp.fields[0], t0 = lp.today - 20 * DAY, t1 = lp.today + 180 * DAY, span = t1 - t0, pos = (t: number) => ((t - t0) / span) * 100;
  const live = items.filter(i => i.r.goLive !== undefined && i.status !== "done" && i.r.goLive! >= t0 && i.r.goLive! <= t1);
  const counts = new Map<string, number>(); live.forEach(i => counts.set(i.r.dims[dim], (counts.get(i.r.dims[dim]) ?? 0) + 1));
  const top = Array.from(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]), lanes = [...top, ...(counts.size > top.length ? ["Other"] : [])];
  const months: number[] = []; for (let d = new Date(t0); d.getTime() <= t1; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) { const m = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); if (m >= t0) months.push(m); }
  if (!live.length) return <div className="exm-empty">No Epic goes live in the next 6 months with the filters applied.</div>;
  return (
    <div className="exm-tl" role="img" aria-label="Go-live timeline">
      <div className="lanes">{lanes.map(l => <div key={l} className="lane"><span className="lb" title={l}>{l}</span><div className="tr">{months.map(m => <i key={m} className="gl" style={{ left: pos(m) + "%" }} />)}
        {live.filter(i => (l === "Other" ? !top.includes(i.r.dims[dim]) : i.r.dims[dim] === l)).map(i => <button key={i.id} type="button" className={"dot" + (i.stage ? " num" : "")} aria-label={`${i.title}, go-live ${lp.day(i.r.goLive)}, ${STATUS_NAME[i.status]}${i.stage ? ", stage " + i.stage : ""}`} title={`${i.title} · ${lp.day(i.r.goLive)} · ${STATUS_NAME[i.status]}${i.stage ? " · " + i.stage : ""}`} style={{ left: pos(i.r.goLive!) + "%", background: COLOR[i.status] }} onClick={() => lp.open(i)}>{i.stage && i.r.stageIdx !== undefined ? i.r.stageIdx + 1 : null}</button>)}</div></div>)}
        <div className="today" style={{ left: `calc(150px + (100% - 150px) * ${pos(lp.today) / 100})` }}><span>Today</span></div></div>
      <div className="axis"><i />{<div className="m">{months.map(m => <span key={m} style={{ left: pos(m) + "%" }}>{new Date(m).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}</span>)}</div>}</div>
      <div className="exm-leg">{ORDER.filter(s => s !== "done").map(s => <span key={s}><i style={{ background: COLOR[s] }} />{STATUS_NAME[s]}</span>)}{stagesOn(lp.settings.executive.stages) && <span className="stg">Number in a dot = delivery stage: {lp.settings.executive.stages.stages.map((s, k) => `${k + 1} ${s.name}`).join(" · ")}</span>}</div>
    </div>
  );
}

function quarterCols(lp: LP) { const forQ = lp.all.filter(i => pass(i, lp.f, "quarter")); return sortQuarters(Array.from(new Set(lp.all.map(i => i.quarter)))).map(q => ({ label: q, counts: byStatus(forQ.filter(i => i.quarter === q)) })); }
function QuarterCard({ lp }: { lp: LP }) {
  const { f, setF } = lp;
  return <section className="exm-card"><h3>Go-live by quarter <small>Epics</small></h3><Columns cols={quarterCols(lp)} selected={f.quarter} selectedStatus={f.status} onPick={(l, s) => setF({ ...f, quarter: toggle(f.quarter, l), status: s ? toggle(f.status, s) : f.status })} /></section>;
}

/** On-time rate and average days late, the same numbers as the classic Delivery performance card. */
function DeliveryMini({ lp }: { lp: LP }) {
  const d = lp.settings.executive.delivery, p = lp.f.period;
  const window = React.useMemo(() => (p ? quartersIn(parseDay(p.from)!, parseDay(p.to)! + 86399999) : undefined), [p?.from, p?.to]);   // eslint-disable-line react-hooks/exhaustive-deps
  const base = React.useMemo(() => lp.all.filter(i => pass(i, lp.f, "period")), [lp.all, lp.f]);
  const sum = React.useMemo(() => summarizeDelivery({ items: base.map(i => ({ id: i.id, title: i.title, goLive: i.r.goLive, moves: i.sum.moves, done: i.r.dataStatus === "done" })), all: base.map(i => ({ goLive: i.r.goLive })), doneAt: lp.deliveredAt ?? {}, s: d, now: new Date(), window }), [base, lp.deliveredAt, d, window]);
  if (!d.enabled) return null;
  const rate = sum.rate, R = 44, C = 2 * Math.PI * R, col = rate === undefined ? "#cbd5e1" : rate >= 70 ? COLOR.green : rate >= 50 ? COLOR.amber : COLOR.red;
  return (
    <section className="exm-card"><h3>Delivery performance</h3>
      {!lp.deliveredAt || sum.known === 0 ? <div className="exm-mut">Appears when Epics that reached Done have a go-live date to compare with (see Settings › Delivery performance).</div>
        : <div className="exm-dp"><div className="ring"><svg width="104" height="104" viewBox="0 0 104 104"><circle cx="52" cy="52" r={R} fill="none" stroke="#eee" strokeWidth="10" /><circle cx="52" cy="52" r={R} fill="none" stroke={col} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${C * (rate ?? 0) / 100} ${C}`} transform="rotate(-90 52 52)" /></svg><b>{rate === undefined ? "–" : rate + "%"}</b></div>
          <dl><div><dt>On-time rate</dt><dd>{rate === undefined ? "–" : rate + "%"}</dd></div><div><dt>Average days late</dt><dd>{sum.avgLate === undefined ? "–" : sum.avgLate + " d"}</dd></div><div><dt>Delivered in {sum.lastQuarter}</dt><dd>{sum.delivered} of {sum.due}</dd></div></dl></div>}</section>
  );
}

/** The stage dates at a glance: how many Epics have dates that do not fit and how many had a date changed; a click filters to them. */
function StageDatesCard({ lp }: { lp: LP }) {
  const { f, setF } = lp, opts = sdateOptions(lp), d = lp.settings.executive.stages.dates;
  const row = (value: string, text: (n: number) => string) => { const o = opts.find(x => x.value === value); if (!o) return null; const on = f.sdate.includes(value);
    return <button type="button" key={value} className={"exm-sdr" + (on ? " on" : "")} aria-pressed={on} onClick={() => setF({ ...f, sdate: toggle(f.sdate, value) })}><b>{o.count}</b><span>{text(o.count)}</span></button>; };
  return (
    <section className="exm-card" aria-label="Stage dates"><h3>Stage dates <small>{d.track && d.consistency ? "checks and changes" : d.consistency ? "checks" : "changes"}</small></h3>
      <div className="exm-sdrs">{row(SDATE.problems, n => (n === 1 ? "Epic has dates that do not fit" : "Epics have dates that do not fit"))}{row(SDATE.changed, n => (n === 1 ? "Epic had a date changed" : "Epics had a date changed"))}</div>
      {opts.every(o => o.count === 0) && <div className="exm-mut">All the stage dates fit and none were changed.</div>}</section>
  );
}

export function OverviewPage({ lp, go }: { lp: LP; go(t: Tab, status?: ExecStatus[]): void }) {
  const { f, setF } = lp, base = lp.all.filter(i => pass(i, f, "status")), c = byStatus(base), snaps = lp.snaps ?? [], act = base.length - c.idle, score = health(c);
  const whole = isEmpty({ ...f, status: [] }), trend = snaps.length > 1 && lp.all.length > 0 && whole, prev = snaps.length > 1 ? health(snaps[snaps.length - 2]) : undefined;
  const att = lp.items.filter(i => i.status === "red" || i.status === "amber").sort((a, b) => (a.status === b.status ? 0 : a.status === "red" ? -1 : 1) || b.r.slip - a.r.slip);
  const st = lp.settings.executive.stages, [dim, setDim] = React.useState(lp.fields[0]);
  React.useEffect(() => { if (!lp.fields.includes(dim)) setDim(lp.fields[0]); }, [lp.fields.join("|")]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="exm-page">
      <div className="exm-g">
        <section className="exm-card hero s4" aria-label="Portfolio health"><div className="t">Portfolio health</div><div className="r"><div className="big"><Num to={score} suffix="%" /></div>{trend && <Spark values={snaps.slice(-8).map(x => health(x))} color="#fff" w={96} h={44} />}</div>
          {trend && prev !== undefined ? <Delta d={score - prev} good /> : <span className="dl flat" title={whole ? "The trend compares this week with last week. The dashboard keeps one snapshot a week, so the first week has nothing to compare with and the change appears from next week." : "The trend is kept for the whole portfolio, so it is hidden while a filter is on."}>{whole ? "trend appears next week" : "trend: no filters only"}</span>}
          <div className="ft"><div><b>{base.length}</b><span>Epics</span></div><div><b>{act}</b><span>in delivery</span></div><div><b>{c.red + c.amber}</b><span>need you</span></div></div></section>
        <div className="s8 exm-sts">{ORDER.map(s => <button key={s} type="button" className={"exm-sc" + (f.status.includes(s) ? " on" : f.status.length ? " dim" : "")} aria-pressed={f.status.includes(s)} style={{ ["--c" as string]: COLOR[s] }} onClick={() => setF({ ...f, status: toggle(f.status, s) })}>
          <Sw s={s} size={30} /><div className="n"><Num to={c[s]} /></div><div className="l">{STATUS_NAME[s]}</div><div className="p">{pctOf(c[s], base.length)}% of Epics</div><div className="prog"><i style={{ width: pctOf(c[s], base.length) + "%" }} /></div></button>)}</div>
      </div>
      <div className="exm-g">
        <section className="exm-card flush s8"><h3>Needs your attention <button type="button" className="lk" onClick={() => go("epics", ["red", "amber"])}>View all {att.length}</button></h3>
          <EpicTable lp={lp} items={att.slice(0, 7)} cols={["status", "title", "stage", "why", "goLive", "slip"]} compact /></section>
        <div className="s4 col">
          <section className="exm-card"><h3>Delivery pipeline <button type="button" className="lk" onClick={() => go("pipeline")}>Open</button></h3>
            {stagesOn(st) ? st.stages.map(s => { const a = base.filter(i => i.stage === s.name); return <div key={s.name} className="exm-pr"><span>{s.name}</span>{a.length ? <Mix c={byStatus(a)} n={a.length} /> : <div className="exm-stk" />}<b>{a.length}</b></div>; })
              : <div className="exm-mut">Set up the delivery stages in Settings to see where Epics are.</div>}</section>
          {stageDatesOn(st) && <StageDatesCard lp={lp} />}
          <DeliveryMini lp={lp} />
        </div>
      </div>
      <div className="exm-g"><section className="exm-card s12"><h3>Go-live timeline <small>next 6 months · by {dimLabel(lp.fields[0]).toLowerCase()} · click a dot</small></h3><Timeline lp={lp} items={lp.items} /></section></div>
      <div className="exm-g"><div className="s7"><ByFieldCard lp={lp} dim={dim} onDim={setDim} /></div><div className="s5"><QuarterCard lp={lp} /></div></div>
    </div>
  );
}

export function PipelinePage({ lp }: { lp: LP }) {
  const st = lp.settings.executive.stages;
  const list = lp.items.filter(i => i.r.status !== "done" && i.status !== "idle" && (i.status === "red" || (st.stuckRule && (i.r.stageDays ?? 0) > st.stuckDays) || (st.lagRule && (i.r.stageLag ?? 0) >= st.lagAmber)));
  return (
    <div className="exm-page"><PipelineCard lp={lp} />
      {stagesOn(st) && <section className="exm-card flush"><h3>Stuck, behind or at risk <small>{list.length} Epics · click a stage above to filter</small></h3><EpicTable lp={lp} items={list} cols={["status", "title", "stage", "why", "goLive", "slip"]} /></section>}</div>
  );
}

export function EpicsPage({ lp, sel }: { lp: LP; sel?: number }) {
  return <div className="exm-page"><section className="exm-card flush"><h3>All Epics <small>{lp.items.length} of {lp.all.length} · click a header to sort · ↑ ↓ move, Enter opens</small></h3><EpicTable lp={lp} items={lp.items} sel={sel} cols={["status", "title", "dim", "stage", "pct", "goLive", "forecast", "slip", "extra"]} /></section></div>;
}

export function InsightsPage({ lp }: { lp: LP }) {
  const [dim, setDim] = React.useState(lp.fields[0]);
  React.useEffect(() => { if (!lp.fields.includes(dim)) setDim(lp.fields[0]); }, [lp.fields.join("|")]);   // eslint-disable-line react-hooks/exhaustive-deps
  const moved = lp.items.filter(i => i.sum.moves > 0).sort((a, b) => b.sum.moves - a.sum.moves).slice(0, 6);
  return (
    <div className="exm-page">
      <div className="exm-g"><div className="s8"><ByFieldCard lp={lp} dim={dim} onDim={setDim} /></div><div className="s4"><DeliveryMini lp={lp} /></div></div>
      <div className="exm-g"><div className="s7"><QuarterCard lp={lp} /></div>{lp.historyOn && <section className="exm-card flush s5"><h3>Go-live changes <small>moved most often</small></h3><EpicTable lp={lp} items={moved} cols={["title", "goLive", "moves"]} compact /></section>}</div>
      <DeliveryCard lp={lp} />
    </div>
  );
}
export { quarterLabel };
