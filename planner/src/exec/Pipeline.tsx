import * as React from "react";
import { stagesOn } from "../core/stages";
import { byStatus, pass, SHOWN, toggle } from "./model";
import { COLOR } from "./parts";
import { STATUS_NAME } from "../core/executive";
import { LP } from "./layouts";

/** The delivery pipeline: one column per stage with the status of its Epics, the time they have spent there and how many are stuck or behind for the stage. Clicking a stage filters the page. */
export function PipelineCard({ lp }: { lp: LP }) {
  const st = lp.settings.executive.stages, on = stagesOn(st);
  const base = React.useMemo(() => lp.all.filter(i => pass(i, lp.f, "stage")), [lp.all, lp.f]);          // the other filters apply
  const cols = React.useMemo(() => st.stages.map(d => {
    const a = base.filter(i => i.stage === d.name), c = byStatus(a), days = a.map(i => i.r.stageDays).filter((x): x is number => x !== undefined);
    return { d, a, c, avg: days.length ? Math.round(days.reduce((x, y) => x + y, 0) / days.length) : undefined, stuck: st.stuckRule ? a.filter(i => i.r.stageDays !== undefined && i.r.stageDays > st.stuckDays).length : 0, behind: st.lagRule ? a.filter(i => (i.r.stageLag ?? 0) >= st.lagAmber).length : 0 };
  }), [base, st]);
  if (!on) return <section className="ex-card ex-pipeline"><h4>Delivery pipeline <span>not set up yet</span></h4><div className="muted ex-pempty">Choose the stages and map the field or state to them in Settings › Executive Dashboard › Delivery stages and progress. The pipeline, the progress of every Epic and the stage checks then use them.</div></section>;
  const inP = base.filter(i => i.stage).length, ign = base.filter(i => i.r.stageKind === "ignore").length, unm = base.filter(i => i.r.stageKind === "unmapped").length, none = base.filter(i => i.r.stageKind === "none").length;
  const worst = [...cols].filter(c => c.a.length && (c.stuck || c.behind)).sort((a, b) => (b.stuck + b.behind) / b.a.length - (a.stuck + a.behind) / a.a.length)[0];
  const f = lp.f, anyDays = cols.some(c => c.avg !== undefined);
  return (
    <section className="ex-card ex-pipeline" aria-label="Delivery pipeline">
      <h4>Delivery pipeline <span>{inP} Epics in a stage{ign ? ` · ${ign} ignored` : ""}{unm ? ` · ${unm} unmapped` : ""}{none ? ` · ${none} without a stage` : ""}</span></h4>
      {worst ? <div className="ex-bn" role="status">⚠ <b>{worst.d.name}</b> is where work is piling up: {worst.a.length} Epics{worst.avg !== undefined ? `, ${worst.avg} days on average` : ""}{worst.stuck ? <>, <b>{worst.stuck}</b> stuck over {st.stuckDays} days</> : null}{worst.behind ? <>{worst.stuck ? " and " : ", "}<b>{worst.behind}</b> behind for the stage</> : null}.</div>
        : <div className="ex-bn ok" role="status">No stage has Epics stuck or behind.</div>}
      <div className="ex-pipe" style={{ gridTemplateColumns: `repeat(${Math.max(1, cols.length)}, minmax(0, 1fr))` }}>
        {cols.map(c => <button key={c.d.name} type="button" className={"ex-pcol" + (f.stage.includes(c.d.name) ? " on" : f.stage.length ? " dim" : "")} aria-pressed={f.stage.includes(c.d.name)} onClick={() => lp.setF({ ...f, stage: toggle(f.stage, c.d.name) })}>
          <div className="ph"><b>{c.d.name}</b><span>{c.a.length} Epics</span></div>
          <div className="pbar" aria-hidden="true">{SHOWN.filter(s => c.c[s]).map(s => <i key={s} style={{ flex: c.c[s], background: COLOR[s] }} title={`${STATUS_NAME[s]}: ${c.c[s]}`}>{c.c[s] / Math.max(1, c.a.length) > .14 ? (s === "done" ? "✓ " : "") + c.c[s] : ""}</i>)}</div>
          <div className="pk"><div><span>Avg time in stage</span><b>{c.avg === undefined ? "–" : c.avg + " d"}</b></div>
            {st.stuckRule && <div><span>Stuck &gt; {st.stuckDays} d</span><b className={c.stuck ? "red" : ""}>{c.stuck}</b></div>}
            {st.lagRule && <div><span>Behind for stage</span><b className={c.behind ? "amb" : ""}>{c.behind}</b></div>}</div>
          <div className="pp"><span>Counts as</span><b>{c.d.pct}% done</b></div></button>)}
      </div>
      <div className="ex-dlegend">{SHOWN.filter(s => s !== "unknown").map(s => <span key={s}><i style={{ background: COLOR[s] }} />{STATUS_NAME[s]}</span>)}<span style={{ marginLeft: "auto" }}>click a stage to filter{anyDays ? " · time in stage comes from the work item history" : " · time in stage needs the history of the stage field to be read"}</span></div>
    </section>
  );
}
