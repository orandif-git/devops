import * as React from "react";
import "./progress.css";
import { fmtDay, ProgressModel } from "../core/progress";

/** The compact stepper. Hover or focus a step to read its dates and how long it took in the line under it (always in the frame: nothing pops up, so nothing is cut off). Draws nothing when the control is off for this work item. */
export function ProgressControl({ model }: { model: ProgressModel }) {
  const [hot, setHot] = React.useState<number>(-1);
  if (model.kind === "hidden") return null;
  const { steps } = model, flagged = model.flags.length > 0, worst = model.flags.some(f => f.level === "r") ? "r" : "w";
  return (
    <div className="dp" role="group" aria-label="Delivery progress">
      <div className="dp-row">
        <div className="dp-steps">{steps.map((s, i) => <React.Fragment key={s.name}>
          {i > 0 && <span className={"dp-ln" + (s.mark === "skip" ? " sk" : steps[i - 1].mark !== "todo" && s.mark !== "todo" ? " on" : "")} />}
          <span className={"dp-st " + s.mark + (s.bad ? " bad" : "") + (hot === i ? " hot" : "")} tabIndex={0} onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot(-1)} onFocus={() => setHot(i)} onBlur={() => setHot(-1)} aria-label={`${s.name}: ${s.mark === "cur" ? "current stage" : s.mark === "done" ? "done" : s.mark === "skip" ? "skipped" : s.mark === "rework" ? "back in this stage" : "not reached"}`}>
            <i aria-hidden="true">{s.mark === "skip" ? "–" : s.mark === "done" ? "✓" : i + 1}</i>{s.name}
</span>
        </React.Fragment>)}</div>
        <span className="dp-sp" />
        <span className="dp-chips">
          {model.steps.every(x => x.mark === "done" || x.mark === "skip") ? <span className="dp-chip g">✓ Delivered{model.delivered !== undefined ? " " + fmtDay(model.delivered) : ""}</span> : model.days !== undefined && model.current ? <span className="dp-chip t">{model.days} d in {model.current}</span> : null}
          {flagged && <span className={"dp-chip " + worst} title={model.flags.map(f => f.text).join(" ")}>⚠ {model.flags.length}</span>}
        </span>
      </div>
      {steps.some(x => x.tip.length > 0) && (() => { const k = hot >= 0 ? hot : steps.findIndex(x => x.mark === "cur" || x.mark === "rework"), d = k >= 0 ? steps[k] : undefined; return <div className="dp-detail" aria-live="polite">{d && d.tip.length > 0 ? <><b>{d.name}</b>{d.tip.map(t => <span key={t}>{t}</span>)}</> : <span className="mut">Point at a stage to see its dates.</span>}</div>; })()}
      {model.note && <div className="dp-note">{model.note}</div>}
      {flagged && <div className="dp-flags">{model.flags.map(f => <div key={f.text} className={"dp-flag" + (f.level === "r" ? " r" : "")} role="note"><span aria-hidden="true">{f.level === "r" ? "⛔" : "⚠"}</span><span>{f.text}</span></div>)}</div>}
    </div>
  );
}
