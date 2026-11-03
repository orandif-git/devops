import * as React from "react";
import "./progress.css";
import { fmtDay, ProgressModel, ProgressStep, StepMark } from "../core/progress";

const WORD: Record<StepMark, string> = { done: "completed", cur: "in progress", late: "in progress, past its planned end", todo: "not started", skip: "skipped", rework: "back in this stage" };

/**
 * The stepper: one row of stages, one short line under each. The words (Started, Planned end, so far, …) are in one detail line under the stepper, for the stage in progress or the one pointed at.
 * Nothing pops up and nothing wraps: when the frame is narrow the per-stage lines are left out (the detail line still has everything) and the chip moves down to the detail line.
 * Draws nothing when the control is off for this work item.
 */
export function ProgressControl({ model }: { model: ProgressModel }) {
  const [hot, setHot] = React.useState<number>(-1), [w, setW] = React.useState(0);
  const root = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = root.current; if (!el) return;
    const size = () => setW(Math.round(el.getBoundingClientRect().width));
    size(); if (typeof ResizeObserver === "undefined") { window.addEventListener("resize", size); return () => window.removeEventListener("resize", size); }
    const ro = new ResizeObserver(size); ro.observe(el); return () => ro.disconnect();
  }, [model.kind]);
  if (model.kind === "hidden") return null;
  const { steps } = model, n = Math.max(1, steps.length), flagged = model.flags.length > 0, worst = model.flags.some(f => f.level === "r") ? "r" : "w";
  const wide = w === 0 || w >= 620, colW = (wide ? w - 190 : w) / n, lines = w === 0 || colW >= 92;   // w is 0 before the first measure (and in tests)
  const allDone = steps.every(x => x.mark === "done" || x.mark === "skip");
  const chips = <span className="dp-chips">
    {allDone ? <span className="dp-chip g">✓ Delivered{model.delivered !== undefined ? " " + fmtDay(model.delivered) : ""}</span>
      : model.days !== undefined && model.current ? <span className={"dp-chip " + (model.overdue ? "r" : "t")} title={model.overdue ? `Past its planned end by ${model.overdue} d` : undefined}>{model.overdue ? "⚠ " : ""}{model.days} d in {model.current}</span> : null}
    {flagged && <span className={"dp-chip " + worst} title={model.flags.map(f => f.text).join(" ")}>⚠ {model.flags.length}</span>}
  </span>;
  const focus = hot >= 0 ? hot : steps.findIndex(x => x.mark === "cur" || x.mark === "late" || x.mark === "rework");
  const d: ProgressStep | undefined = focus >= 0 ? steps[focus] : undefined;
  const parts = d && d.tip.length > 0 ? d.tip : hot < 0 && model.summary ? model.summary : undefined, title = d && d.tip.length > 0 ? d.name : undefined;
  const hasDetail = steps.some(x => x.tip.length > 0) || !!model.summary;
  return (
    <div className={"dp" + (lines ? "" : " dp-nolines") + (wide ? "" : " dp-narrow")} role="group" aria-label="Delivery progress" ref={root}>
      <div className="dp-row">
        <div className="dp-steps" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>{steps.map((s, i) => (
          <span key={s.name} className={"dp-st " + s.mark + (s.bad ? " bad" : "") + (s.planned ? " plan" : "") + (hot === i ? " hot" : "")} tabIndex={0} title={[s.name, ...s.tip].join(" · ")}
            onMouseEnter={() => setHot(i)} onMouseLeave={() => setHot(-1)} onFocus={() => setHot(i)} onBlur={() => setHot(-1)}
            aria-label={`${s.name}: ${WORD[s.mark]}${s.line ? ", " + s.line : ""}`}>
            <span className="dp-t"><i aria-hidden="true">{s.mark === "skip" ? "–" : s.mark === "done" ? "✓" : i + 1}</i>{i < steps.length - 1 && <span className="dp-ln" aria-hidden="true" />}</span>
            <span className="dp-nm">{s.name}</span>
            {s.line && <span className="dp-ls">{s.line}</span>}
          </span>))}
        </div>
        {wide && chips}
      </div>
      {(hasDetail || !wide) && <div className="dp-foot">
        <div className="dp-detail" aria-live="polite" title={parts ? [title, ...parts].filter(Boolean).join(" · ") : undefined}>{parts ? <>{title && <b>{title}</b>}{parts.map((t, k) => <span key={k}>{t}</span>)}</> : hasDetail ? <span className="mut">Point at a stage to see its dates.</span> : null}</div>
        {!wide && chips}
      </div>}
      {model.note && <div className="dp-note">{model.note}</div>}
      {flagged && <div className="dp-flags">{model.flags.map(f => <div key={f.text} className={"dp-flag" + (f.level === "r" ? " r" : "")} role="note"><span aria-hidden="true">{f.level === "r" ? "⛔" : "⚠"}</span><span>{f.text}</span></div>)}</div>}
    </div>
  );
}
