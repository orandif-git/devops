import * as React from "react";
import "./stageDates.css";
import { stageDatesOn } from "../core/stages";
import { sdateOptions, SDATE, pass, toggle } from "./model";
import type { LP } from "./layouts";

/**
 * The stage dates at a glance: how many Epics have stage dates to check (a start date missing, dates out of order, a skipped stage, or rework) and how many had a date changed after it was entered.
 * These are records to look at, not always mistakes: a skipped stage or an Epic that went back a stage can be real. A click filters the whole dashboard. Used by both designs.
 */
export function StageDatesCard({ lp, className }: { lp: LP; className: string }) {
  const { f, setF } = lp, st = lp.settings.executive.stages;
  if (!stageDatesOn(st)) return null;
  const d = st.dates, opts = sdateOptions(lp), base = lp.all.filter(i => pass(i, f, "sdate")), check = d.consistency ? base.filter(i => i.dateIssues > 0) : [];
  const kinds: [string, number][] = [["missing", "with a start date missing"], ["order", "with dates out of order"], ["skipped", "with a skipped stage"], ["rework", "back in an earlier stage (rework)"]]
    .map(([k, t]) => [t, check.filter(i => i.r.stageDates?.issues.some(y => y.kind === k)).length] as [string, number]).filter(x => x[1] > 0);
  const btn = (value: string, one: string, many: string) => { const o = opts.find(x => x.value === value); if (!o) return null; const on = f.sdate.includes(value);
    return <button type="button" key={value} className={"sdc-b" + (on ? " on" : "")} aria-pressed={on} onClick={() => setF({ ...f, sdate: toggle(f.sdate, value) })}><b>{o.count}</b><span>{o.count === 1 ? one : many}</span></button>; };
  return (
    <section className={className + " sdc"} aria-label="Stage dates">
      <h4 className="sdc-h">Stage dates <span>{d.track && d.consistency ? "to check · changed" : d.consistency ? "to check" : "changed"}</span></h4>
      <div className="sdc-bs">{btn(SDATE.problems, "Epic has stage dates to check", "Epics have stage dates to check")}{btn(SDATE.changed, "Epic had a stage date changed", "Epics had a stage date changed")}</div>
      {kinds.length > 0 && <div className="sdc-k">{kinds.map(([t, n]) => `${n} ${t}`).join(" · ")}</div>}
      {d.consistency && <div className="sdc-n">“To check” means the dates do not fit the stage the Epic is in. It is a record to look at, not always a mistake: a skipped stage or an Epic that went back a stage can be real. Open an Epic to see which dates.</div>}
      {opts.every(o => o.count === 0) && <div className="sdc-n">All the stage dates fit and none were changed.</div>}
    </section>
  );
}
