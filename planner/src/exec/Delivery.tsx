import * as React from "react";
import { IconDown, IconUp } from "../../../src/shared/icons";
import { parseDay } from "../core/execPeriod";
import { Delivered, quarterLabel, quartersIn, summarizeDelivery } from "../core/delivery";
import { COLOR } from "./parts";
import { pass } from "./model";
import { LP } from "./layouts";

const sgn = (n: number) => (n > 0 ? "+" : "") + n;
/** How Epics that reached Done compare with their go-live date: tiles, a column per quarter and the biggest delays. Every part, window and limit comes from the settings. */
export function DeliveryCard({ lp }: { lp: LP }) {
  const d = lp.settings.executive.delivery, grace = d.graceDays, p = lp.f.period;
  const window = React.useMemo(() => (p ? quartersIn(parseDay(p.from)!, parseDay(p.to)! + 86399999) : undefined), [p?.from, p?.to]);   // eslint-disable-line react-hooks/exhaustive-deps
  const base = React.useMemo(() => lp.all.filter(i => pass(i, lp.f, "period")), [lp.all, lp.f]);             // the other filters apply; the period sets the window instead
  const sum = React.useMemo(() => summarizeDelivery({ items: base.map(i => ({ id: i.id, title: i.title, goLive: i.r.goLive, moves: i.sum.moves, done: i.r.dataStatus === "done" })), all: base.map(i => ({ goLive: i.r.goLive })), doneAt: lp.deliveredAt ?? {}, s: d, now: new Date(), window }), [base, lp.deliveredAt, d, window]);
  if (!d.enabled) return null;
  const open = lp.showDelivery, show = (k: string) => d.show.includes(k), tiles = ["rate", "late", "delivered", "predict"].filter(show);
  const name = window ? `${window[0].label} – ${window[window.length - 1].label}` : `last ${d.quarters} quarters`;
  const dRate = sum.rate !== undefined && sum.ratePrev !== undefined ? sum.rate - sum.ratePrev : undefined, dLate = sum.avgLate !== undefined && sum.avgLatePrev !== undefined ? sum.avgLate - sum.avgLatePrev : undefined;
  const Tile = (p: { id: string; label: string; v: React.ReactNode; note: React.ReactNode }) => <div className="ex-dpt" key={p.id}><div className="l">{p.label}</div><div className="v">{p.v}</div><div className="d">{p.note}</div></div>;
  const panels = (tiles.length ? 1 : 0) + (show("chart") ? 1 : 0) + (show("delays") ? 1 : 0);
  const mx = Math.max(1, ...sum.columns.map(c => c.total)), H = 130, W = 420, bw = W / Math.max(1, sum.columns.length);
  return (
    <section className="ex-card ex-delivery" aria-label="Delivery performance">
      <h4><button type="button" className="ex-fold" aria-expanded={open} onClick={() => lp.onDelivery(!open)} title={open ? "Hide" : "Show"}>{open ? <IconUp size={14} /> : <IconDown size={14} />}</button> Delivery performance <span>Epics that reached Done · {name}</span></h4>
      {open && (!lp.deliveredAt
        ? <div className="muted ex-dpempty">{d.source === "history" ? "The date an Epic reached Done is read from the work item history. Switch “Read the history of the go-live date” on (Settings › General) and refresh." : "Choose the date field that holds the completed date (Settings › Executive Dashboard › Delivery performance)."}</div>
        : sum.known === 0 ? <div className="muted ex-dpempty">No Epic that reached Done in this window has a go-live date to compare with yet.</div>
        : <>
          <div className="ex-dp" style={{ gridTemplateColumns: panels === 3 ? "34% 1fr 28%" : panels === 2 ? "1fr 1fr" : "1fr" }}>
            {tiles.length > 0 && <div className="ex-dptiles">
              {show("rate") && <Tile id="rate" label="On-time delivery rate" v={sum.rate === undefined ? "–" : sum.rate + "%"} note={<>{dRate !== undefined && <span className={dRate >= 0 ? "up" : "dn"}>{dRate >= 0 ? "▲ " : "▼ "}{sgn(dRate)} pts</span>} {dRate !== undefined ? "vs the quarters before" : `${sum.recentCount} delivered, on or before go-live${grace ? ` + ${grace} d` : ""}`}</>} />}
              {show("late") && <Tile id="late" label="Average days late" v={sum.avgLate === undefined ? "–" : sum.avgLate + " d"} note={<>{dLate !== undefined && <span className={dLate <= 0 ? "up" : "dn"}>{dLate <= 0 ? "▼ " : "▲ "}{sgn(dLate)} d</span>} for Epics delivered late</>} />}
              {show("delivered") && <Tile id="delivered" label={`Delivered in ${sum.lastQuarter}`} v={<>{sum.delivered} <span className="of">of {sum.due} due</span></>} note={sum.due ? `${Math.round(100 * sum.delivered / sum.due)}% of the Epics with a go-live that quarter` : "no Epic had its go-live that quarter"} />}
              {show("predict") && <Tile id="predict" label={`Delivered within ±${d.predictDays} days`} v={sum.predictable === undefined ? "–" : sum.predictable + "%"} note="how predictable go-live dates are" />}
            </div>}
            {show("chart") && <div><h5>Delivered by quarter <span>on-time rate above each column</span></h5>
              <svg viewBox={`0 0 ${W} ${H + 34}`} width="100%" role="img" aria-label="Epics delivered by quarter">
                {sum.columns.map((c, k) => { const w = Math.min(44, bw - 16), x = k * bw + (bw - w) / 2, full = c.total / mx * (H - 30); let y = H;
                  const parts: [number, string][] = [[c.on, COLOR.green], [c.late1, COLOR.amber], [c.late2, COLOR.red]];
                  return <g key={c.label}><clipPath id={`dq${k}`}><rect x={x} y={H - full} width={w} height={Math.max(2, full)} rx={Math.min(9, Math.max(1, full / 2))} /></clipPath>
                    <g clipPath={`url(#dq${k})`}>{parts.filter(a => a[0]).map(([n, col], j, arr) => { const hh = n / mx * (H - 30); y -= hh; return <g key={col}><rect x={x} y={y} width={w} height={hh} fill={col}><title>{c.label}: {n}</title></rect>{j < arr.length - 1 && <line x1={x} x2={x + w} y1={y} y2={y} stroke="#fff" strokeWidth="2" />}{hh >= 15 && <text className="inl" x={x + w / 2} y={y + hh / 2 + 4} textAnchor="middle">{n}</text>}</g>; })}</g>
                    {c.total > 0 && <><text x={x + w / 2} y={H - full - 15} textAnchor="middle" style={{ fontWeight: 700, fill: "var(--fg)" }}>{c.rate}%</text><text x={x + w / 2} y={H - full - 4} textAnchor="middle" style={{ fontSize: 10 }}>{c.total}</text></>}
                    <text x={x + w / 2} y={H + 18} textAnchor="middle">{c.label}</text></g>; })}
              </svg>
              <div className="ex-dlegend"><span><i style={{ background: COLOR.green }} />On time{grace ? ` (up to ${grace} d late)` : ""}</span><span><i style={{ background: COLOR.amber }} />Late up to {d.severeDays} days</span><span><i style={{ background: COLOR.red }} />Late over {d.severeDays} days</span></div></div>}
            {show("delays") && <div><h5>Biggest delays <span>{d.recent} quarters</span></h5>
              {sum.worst.length ? <table className="ex-dpt2"><tbody>{sum.worst.map((e: Delivered) => <tr key={e.id}><td>{e.title}<div className="muted">{quarterLabel(e.doneAt)} · go-live moved {e.moves}×</div></td><td className="r">+{e.late} d</td></tr>)}</tbody></table> : <div className="muted">Nothing was delivered late.</div>}</div>}
          </div>
          <div className="ex-dpnote"><span>Delivery date: {d.source === "history" ? "the date the Epic reached Done (work item history)" : `the field “${d.dateField || "(not set)"}”`}.</span><span>On time = delivered on or before its go-live date{grace ? ` plus ${grace} days` : ""}.</span><span>{p ? "The Period filter sets the quarters shown." : "Other filters apply."}</span></div>
        </>)}
    </section>
  );
}
