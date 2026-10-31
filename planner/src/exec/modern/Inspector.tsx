import * as React from "react";
import { IconClose, IconOpen } from "../../../../src/shared/icons";
import { dimLabel, STATUS_NAME } from "../../core/executive";
import type { Hist } from "../../core/history";
import { stageDatesOn, stagesOn } from "../../core/stages";
import { HistoryTimeline } from "../../hub/HistoryTimeline";
import type { LP } from "../layouts";
import type { Item } from "../model";
import { COLOR, Sw } from "../parts";
import { DateHistState, dateEvents } from "./stageDateUi";

const BAR = ["#9aa5b8", "#a8325c", "#7a1a3c", "#5b1530", "#166534", "#0f766e", "#475569"];
const iso = (v: string) => Date.parse(v + "T00:00:00Z");

/** The Epic panel on the right: status, the stage it is in, how long each stage took (when the stage dates are set up), why the status is what it is, the histories, and a way to open the Epic. */
export function Inspector(p: { item?: Item; lp: LP; project: string; onClose(): void; onDetails(id: number): void; onOpenEpic(id: number): void; hist?: Hist; histState?: "ok" | "loading" | "error" | "none"; histError?: string; dateHist?: Record<string, Hist>; dateHistState?: DateHistState; dateHistError?: string }) {
  const i = p.item, lp = p.lp, st = lp.settings.executive.stages, r = i?.r, sd = r?.stageDates;
  const names = st.stages.map(s => s.name), cur = r?.stageIdx, expected = cur !== undefined && (r?.stageLag ?? 0) > 0 ? cur + (r?.stageLag ?? 0) : undefined;
  const dates = stageDatesOn(st) && !!sd, events = dates && st.dates.track ? dateEvents(st, p.dateHist) : [];
  const total = sd ? sd.rows.reduce((a, x) => a + (x.dur ?? 0), 0) : 0, delivered = i && lp.deliveredAt ? lp.deliveredAt[i.id] : undefined;
  return (
    <aside className={"exm-insp" + (i ? " on" : "")} aria-label="Epic details" aria-hidden={!i}>
      {i && r && <div className="in">
        <div className="ih"><span>#{i.id} · {i.state}</span><button type="button" className="ibt" aria-label="Close details" title="Close (Esc)" onClick={p.onClose}><IconClose /></button></div>
        <span className="exm-spill" style={{ ["--pc" as string]: COLOR[i.status] }}><Sw s={i.status} size={16} />{STATUS_NAME[i.status]}</span>
        <h2>{i.title}</h2>
        {stagesOn(st) && cur !== undefined && <div className="stp" aria-label="Delivery stage">{names.map((n, k) => { const row = sd?.rows[k]; return <div key={n} className={(row?.skipped ? "skip " : "") + (k < cur || i.status === "done" ? "done" : k === cur ? "cur" : "")}><i>{row?.skipped ? "–" : k < cur || i.status === "done" ? "✓" : k + 1}</i>{n}{expected === k && <span className="fl">due here</span>}{dates && <span className="dd">{row?.skipped ? "skipped" : row?.start !== undefined ? (row.fromHistory ? "~" : "") + lp.day(row.start) : row?.missing ? "date missing" : "–"}</span>}</div>; })}</div>}
        <div className="pg"><span>Progress</span><b>{r.pct === undefined ? "–" : r.pct + "%"}</b></div><div className="exm-prog big"><i style={{ width: (r.pct ?? 0) + "%", background: COLOR[i.status] }} /></div>
        <div className="kvs"><div><span>Go-live</span><b>{lp.day(r.goLive)}</b></div><div><span>Forecast</span><b className={r.slip > 0 && i.status !== "done" ? "bad" : ""}>{i.status === "done" ? "Delivered" : lp.day(r.forecast)}{r.slip > 0 && i.status !== "done" && <small> +{r.slip} d</small>}</b></div>
          {lp.fields.slice(0, 2).map(d => <div key={d}><span>{dimLabel(d)}</span><b>{r.dims[d]}</b></div>)}
          {r.stage && <div><span>Stage</span><b>{r.stage}{r.stageDays !== undefined && <small className="mut"> {r.stageDays} d</small>}</b></div>}
          {i.status === "done" && delivered !== undefined && <div><span>Delivered</span><b>{lp.day(delivered)}</b></div>}
          {r.declaredText && <div><span>Declared status</span><b>{r.declaredText}</b></div>}</div>
        {dates && sd && <>
          <h4>How long each stage took</h4>
          {total > 0 ? <div className="exm-dur" role="img" aria-label="Duration of each stage">{sd.rows.map(x => x.skipped ? <i key={x.name} className="skip" style={{ width: "7%" }} title={`${x.name}: skipped`}>skip</i> : x.dur ? <i key={x.name} style={{ width: `${x.dur / total * 93}%`, background: BAR[x.idx % BAR.length] }} title={`${x.name}: ${x.dur} d`}>{x.dur / total > 0.1 ? x.dur + " d" : ""}</i> : null)}</div> : <div className="exm-mut">Not enough dates yet to show durations.</div>}
          <h4>Stage dates</h4>
          <table className="exm-sd"><thead><tr><th>Stage</th><th>Started</th><th>Ended</th><th className="r">Duration</th></tr></thead><tbody>{sd.rows.filter(x => x.idx <= Math.max(sd.cur, sd.maxIdx) || x.start !== undefined).map(x => {
            const edits = st.dates.track && x.startField ? p.dateHist?.[x.startField]?.changes.length ?? 0 : 0, typ = lp.stageTypical?.[x.name], tags: React.ReactNode[] = [];
            if (edits) tags.push(<span key="e" className="tag e">edited {edits}×</span>);
            if (st.dates.consistency && x.order) tags.push(<span key="o" className="tag w">before the stage above</span>);
            if (st.dates.consistency && x.missing) tags.push(<span key="m" className="tag w">date missing</span>);
            if (x.skipped) tags.push(<span key="s" className="tag m">skipped</span>);
            if (x.fromHistory) tags.push(<span key="h" className="tag c">from history</span>);
            if (x.endFromHistory) tags.push(<span key="eh" className="tag c">end from history</span>);
            if (x.endsWith && x.end !== undefined) tags.push(<span key="n" className="tag c">= {x.endsWith} start</span>);
            if (st.dates.consistency && x.rework) tags.push(<span key="r" className="tag e">back in this stage</span>);
            if (typ !== undefined && x.dur !== undefined && !x.skipped && !x.order) tags.push(<span key="t" className={"tag " + (x.dur > typ * 1.3 ? "w" : "m")}>typical {typ} d</span>);
            return <React.Fragment key={x.name}><tr><td>{x.name}{x.open && <span className="tag m">now</span>}</td><td>{x.rework ? "since " : x.fromHistory ? "~" : ""}{lp.day(x.start)}</td><td>{x.end !== undefined ? (x.endFromHistory ? "~" : "") + lp.day(x.end) : x.open ? "open" : "–"}</td><td className="r"><b>{x.skipped ? "0 d" : x.dur !== undefined ? x.dur + " d" : "–"}</b></td></tr>
              {tags.length > 0 && <tr><td colSpan={4} className="tg">{tags}</td></tr>}</React.Fragment>; })}</tbody></table>
          {st.dates.consistency && sd.issues.map(x => <div key={x.kind + x.stage} className={"exm-warn" + (x.kind === "order" ? " r" : "")} role="note"><span aria-hidden="true">{x.kind === "order" ? "⛔" : "⚠"}</span><span>{x.text}{x.kind === "missing" && st.dates.fallback && sd.rows[sd.cur]?.fromHistory ? " Time in stage is read from the history instead." : ""}</span></div>)}
        </>}
        <h4>Why this status</h4>
        <ul className="why">{r.reasons.map(t => <li key={t}><span style={{ color: COLOR[i.status] }}>●</span><span>{t}</span></li>)}</ul>
        {dates && st.dates.track && <><h4>Stage date history</h4>
          {p.dateHistState === "loading" ? <div className="exm-mut">Reading the history…</div> : p.dateHistState === "error" ? <div className="err">Could not read the history: {p.dateHistError}</div>
            : !events.length ? <div className="exm-mut">No stage date has been entered or changed yet.</div>
            : <ul className="exm-sdh">{events.map((e, k) => <li key={k}><i className="dt" /><span><b>{e.label}:</b> {e.from ? <>{lp.day(iso(e.from))} → <b>{lp.day(iso(e.to))}</b> <span className="exm-mut">({iso(e.to) > iso(e.from) ? "later" : "earlier"})</span></> : <>set to <b>{lp.day(iso(e.to))}</b></>}{st.dates.late && e.late !== undefined && e.late >= st.dates.lateDays && <span className="tag l">recorded {e.late} d late</span>}<small>{e.by}, {lp.day(Date.parse(e.at))}{e.from ? "" : " · first entry"}</small></span></li>)}</ul>}</>}
        <HistoryTimeline hist={p.hist} state={p.histState ?? "loading"} error={p.histError} day={lp.day} />
        <button type="button" className="exm-btn primary" onClick={() => p.onOpenEpic(i.id)}><IconOpen /> Open Epic</button>
        <button type="button" className="exm-btn" onClick={() => p.onDetails(i.id)}>Epic details</button>
      </div>}
    </aside>
  );
}
