import * as React from "react";
import { IconClose, IconOpen } from "../../../../src/shared/icons";
import { dimLabel, STATUS_NAME } from "../../core/executive";
import type { Hist } from "../../core/history";
import { stageDatesOn, stagesOn } from "../../core/stages";
import { HistoryTimeline } from "../../hub/HistoryTimeline";
import type { LP } from "../layouts";
import type { Item } from "../model";
import { COLOR, Sw } from "../parts";
import { DateHistState } from "./stageDateUi";
import { StageDateHistory, StageDatesSection } from "../StageDatesView";


/** The Epic panel on the right: status, the stage it is in, how long each stage took (when the stage dates are set up), why the status is what it is, the histories, and a way to open the Epic. */
export function Inspector(p: { item?: Item; lp: LP; project: string; onClose(): void; onDetails(id: number): void; onOpenEpic(id: number): void; hist?: Hist; histState?: "ok" | "loading" | "error" | "none"; histError?: string; dateHist?: Record<string, Hist>; dateHistState?: DateHistState; dateHistError?: string }) {
  const i = p.item, lp = p.lp, st = lp.settings.executive.stages, r = i?.r, sd = r?.stageDates;
  const names = st.stages.map(s => s.name), cur = r?.stageIdx, expected = cur !== undefined && (r?.stageLag ?? 0) > 0 ? cur + (r?.stageLag ?? 0) : undefined;
  const dates = stageDatesOn(st) && !!sd, delivered = i && lp.deliveredAt ? lp.deliveredAt[i.id] : undefined;
  const ref = React.useRef<HTMLElement>(null);
  React.useEffect(() => { ref.current?.scrollTo?.(0, 0); }, [i?.id]);   // each Epic opens at its top
  return (
    <aside ref={ref} className={"exm-insp" + (i ? " on" : "")} aria-label="Epic details" aria-hidden={!i}>
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
        {r.stageDates && <StageDatesSection item={i} st={st} day={lp.day} typical={lp.stageTypical} dateHist={p.dateHist} state={p.dateHistState} error={p.dateHistError} />}
        <h4>Why this status</h4>
        <ul className="why">{r.reasons.map(t => <li key={t}><span style={{ color: COLOR[i.status] }}>●</span><span>{t}</span></li>)}</ul>
        {r.stageDates && <StageDateHistory item={i} st={st} day={lp.day} dateHist={p.dateHist} state={p.dateHistState} error={p.dateHistError} />}
        <HistoryTimeline hist={p.hist} state={p.histState ?? "loading"} error={p.histError} day={lp.day} />
        <button type="button" className="exm-btn primary" onClick={() => p.onOpenEpic(i.id)}><IconOpen /> Open Epic</button>
        <button type="button" className="exm-btn" onClick={() => p.onDetails(i.id)}>Epic details</button>
      </div>}
    </aside>
  );
}
