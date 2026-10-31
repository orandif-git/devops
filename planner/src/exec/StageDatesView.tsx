import * as React from "react";
import "./stageDates.css";
import type { Hist } from "../core/history";
import { stageDatesOn } from "../core/stages";
import type { StageSettings } from "../core/stages";
import type { Item } from "./model";
import { DateHistState, dateEvents } from "./modern/stageDateUi";

const BAR = ["#9aa5b8", "#a8325c", "#7a1a3c", "#5b1530", "#166534", "#0f766e", "#475569"];
const iso = (v: string) => Date.parse(v + "T00:00:00Z");
export interface StageDatesProps { item: Item; st: StageSettings; day(t?: number): string; typical?: Record<string, number>; dateHist?: Record<string, Hist>; state?: DateHistState; error?: string }

/** How long each stage took and the dates of each stage, with what each date was derived from and what looks wrong. Used by both designs of the Epic panel. */
export function StageDatesSection(p: StageDatesProps) {
  const { item: i, st } = p, sd = i.r.stageDates;
  if (!stageDatesOn(st) || !sd) return null;
  const total = sd.rows.reduce((a, x) => a + (x.dur ?? 0), 0);
  return (
    <div className="sdv">
      <h4 className="sdv-h">How long each stage took</h4>
      {total > 0 ? <div className="sdv-dur" role="img" aria-label="Duration of each stage">{sd.rows.map(x => x.skipped ? <i key={x.name} className="skip" style={{ width: "7%" }} title={`${x.name}: skipped`}>skip</i> : x.dur ? <i key={x.name} style={{ width: `${x.dur / total * 93}%`, background: BAR[x.idx % BAR.length] }} title={`${x.name}: ${x.dur} d`}>{x.dur / total > 0.1 ? x.dur + " d" : ""}</i> : null)}</div> : <div className="sdv-mut">Not enough dates yet to show durations.</div>}
      <h4 className="sdv-h">Stage dates</h4>
      <table className="sdv-t"><thead><tr><th>Stage</th><th>Started</th><th>Ended</th><th className="r">Duration</th></tr></thead><tbody>{sd.rows.filter(x => x.idx <= Math.max(sd.cur, sd.maxIdx) || x.start !== undefined).map(x => {
        const edits = st.dates.track && x.startField ? p.dateHist?.[x.startField]?.changes.length ?? 0 : 0, typ = p.typical?.[x.name], tags: React.ReactNode[] = [];
        if (edits) tags.push(<span key="e" className="tag e">edited {edits}×</span>);
        if (st.dates.consistency && x.order) tags.push(<span key="o" className="tag w">before the stage above</span>);
        if (st.dates.consistency && x.missing) tags.push(<span key="m" className="tag w">date missing</span>);
        if (x.skipped) tags.push(<span key="s" className="tag m">skipped</span>);
        if (x.fromHistory) tags.push(<span key="h" className="tag c">from history</span>);
        if (x.endFromHistory) tags.push(<span key="eh" className="tag c">end from history</span>);
        if (x.endsWith && x.end !== undefined) tags.push(<span key="n" className="tag c">= {x.endsWith} start</span>);
        if (st.dates.consistency && x.rework) tags.push(<span key="r" className="tag e">back in this stage</span>);
        if (typ !== undefined && x.dur !== undefined && !x.skipped && !x.order) tags.push(<span key="t" className={"tag " + (x.dur > typ * 1.3 ? "w" : "m")}>typical {typ} d</span>);
        return <React.Fragment key={x.name}><tr><td>{x.name}{x.open && <span className="tag m">now</span>}</td><td>{x.rework ? "since " : x.fromHistory ? "~" : ""}{p.day(x.start)}</td><td>{x.end !== undefined ? (x.endFromHistory ? "~" : "") + p.day(x.end) : x.open ? "open" : "–"}</td><td className="r"><b>{x.skipped ? "0 d" : x.dur !== undefined ? x.dur + " d" : "–"}</b></td></tr>
          {tags.length > 0 && <tr><td colSpan={4} className="tg">{tags}</td></tr>}</React.Fragment>; })}</tbody></table>
      {st.dates.consistency && sd.issues.map(x => <div key={x.kind + x.stage} className={"sdv-warn" + (x.kind === "order" ? " r" : "")} role="note"><span aria-hidden="true">{x.kind === "order" ? "⛔" : "⚠"}</span><span>{x.text}{x.kind === "missing" && st.dates.fallback && sd.rows[sd.cur]?.fromHistory ? " Time in stage is read from the history instead." : ""}</span></div>)}
    </div>
  );
}

/** Who entered and changed the stage dates of an Epic, and when, with “recorded late” where a date was entered long after the date itself. */
export function StageDateHistory(p: StageDatesProps) {
  const { item: i, st } = p;
  if (!stageDatesOn(st) || !i.r.stageDates || !st.dates.track) return null;
  const events = dateEvents(st, p.dateHist);
  return (
    <div className="sdv"><h4 className="sdv-h">Stage date history</h4>
      {p.state === "loading" ? <div className="sdv-mut">Reading the history…</div> : p.state === "error" ? <div className="err">Could not read the history: {p.error}</div>
        : !events.length ? <div className="sdv-mut">No stage date has been entered or changed yet.</div>
        : <ul className="sdv-hist">{events.map((e, k) => <li key={k}><i className="dt" /><span><b>{e.label}:</b> {e.from ? <>{p.day(iso(e.from))} → <b>{p.day(iso(e.to))}</b> <span className="sdv-mut">({iso(e.to) > iso(e.from) ? "later" : "earlier"})</span></> : <>set to <b>{p.day(iso(e.to))}</b></>}{st.dates.late && e.late !== undefined && e.late >= st.dates.lateDays && <span className="tag l">recorded {e.late} d late</span>}<small>{e.by}, {p.day(Date.parse(e.at))}{e.from ? "" : " · first entry"}</small></span></li>)}</ul>}
    </div>
  );
}
