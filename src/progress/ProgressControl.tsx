import * as React from "react";
import "./progress.css";
import { ProgressModel, StageIcon } from "../core/progress";

const SVG = (p: { children: React.ReactNode }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p.children}</svg>;
/** One icon per kind of stage: the marker shows the stage the work item is in. */
const ICONS: Record<StageIcon | "check", React.ReactNode> = {
  design: <SVG><path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z" /><path d="M14 7l3 3" /></SVG>,
  code: <SVG><path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14" /></SVG>,
  puzzle: <SVG><path d="M10 4.5a2 2 0 0 1 4 0V6h3.5A1.5 1.5 0 0 1 19 7.5V11h-1.5a2 2 0 0 0 0 4H19v3.5a1.5 1.5 0 0 1-1.5 1.5H14v-1.5a2 2 0 0 0-4 0V20H6.5A1.5 1.5 0 0 1 5 18.5V15h1.5a2 2 0 0 0 0-4H5V7.5A1.5 1.5 0 0 1 6.5 6H10V4.5z" /></SVG>,
  clipboard: <SVG><rect x="5" y="4.5" width="14" height="16.5" rx="2" /><path d="M9 4.5V3.5h6v1M8.5 13l2.5 2.5 4.5-5" /></SVG>,
  cloud: <SVG><path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 9.5" /><path d="M12 21v-8M8.8 15.8L12 12.6l3.2 3.2" /></SVG>,
  rocket: <SVG><path d="M12 3c3.5 2.5 5 6 5 9.5L15 16H9l-2-3.5C7 9 8.5 5.5 12 3z" /><circle cx="12" cy="9.5" r="1.6" /><path d="M9 16l-2.5 4M15 16l2.5 4M12 17.5v3.5" /></SVG>,
  dot: <SVG><circle cx="12" cy="12" r="3.5" /></SVG>,
  check: <SVG><path d="M5 12.5l4.5 4.5L19 7.5" /></SVG>,
};
const FLAG = <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M3 1.5h1.5V15H3V1.5zM5.5 2h8l-2 3.2 2 3.3h-8V2z" /></svg>;

// the room the plot keeps on the left and right of the track (the marker and the finish flag stick out of it)
const PAD_L = 22, PAD_R = 42;
let canvas: HTMLCanvasElement | undefined;
/** The width of a text in a font, from the browser (0 where there is no canvas, as in tests: then everything is taken to fit). */
function textWidth(text: string, font: string): number {
  try { canvas = canvas ?? document.createElement("canvas"); const c = canvas.getContext("2d"); if (!c) return 0; c.font = font; return c.measureText(text).width; } catch { return 0; }
}

/**
 * The Delivery Progress bar: a track of the stages with a marker where the work item is, a speech bubble that says how it is going, the stage names, and two quiet lines.
 * It is built so nothing can overlap or wrap: the bubble is kept inside the frame, long text is cut with an ellipsis (the whole text is in its title), the stage names that do not fit are hidden
 * (the current one stays), and the footer lines drop under each other instead of squeezing. Draws nothing when the control is off for this work item.
 */
export function ProgressControl({ model }: { model: ProgressModel }) {
  const root = React.useRef<HTMLDivElement>(null), bar = React.useRef<HTMLDivElement>(null), bub = React.useRef<HTMLDivElement>(null);
  const curLab = React.useRef<HTMLSpanElement>(null);
  const [w, setW] = React.useState(0), [bp, setBp] = React.useState<{ left: number; arrow: number; max: number } | undefined>(), [cl, setCl] = React.useState<{ left: number; max: number } | undefined>();
  React.useEffect(() => {
    const el = root.current; if (!el) return;
    const size = () => setW(Math.round(el.getBoundingClientRect().width));
    size(); if (typeof ResizeObserver === "undefined") { window.addEventListener("resize", size); return () => window.removeEventListener("resize", size); }
    const ro = new ResizeObserver(size); ro.observe(el); return () => ro.disconnect();
  }, [model.kind]);
  const pos = model.kind === "shown" ? model.pos : 0, text = model.kind === "shown" ? model.label + model.text : "";
  // the speech bubble sits over the marker, but never outside the frame
  React.useLayoutEffect(() => {
    const b = bar.current, e = bub.current; if (!b || !e) return;
    const bw = b.getBoundingClientRect().width; if (!bw) { setBp(undefined); return; }
    const inner = e.querySelector(".dp-bt") as HTMLElement | null, room = bw + PAD_L + PAD_R - 4, width = Math.min((inner ? inner.scrollWidth : e.scrollWidth) + 26, room), cx = bw * pos / 100;
    const left = Math.min(Math.max(cx - width / 2, -PAD_L + 2), bw + PAD_R - 2 - width);
    setBp({ left: Math.round(left), arrow: Math.round(Math.min(Math.max(cx - left, 14), width - 14)), max: Math.round(room) });
  }, [w, pos, text]);
  const stages0 = model.kind === "shown" ? model.stages : [], due0 = stages0.some(x => x.due);
  // do all the stage names fit under their part of the track? if not, only the current one is shown (centred under its part, kept inside the frame)
  const barW = Math.max(0, w - PAD_L - PAD_R), colW = stages0.length ? barW / stages0.length : 0;
  const labels = React.useMemo(() => {
    if (!w || !stages0.length) return true;
    const font = root.current ? getComputedStyle(root.current).fontFamily : "Segoe UI, sans-serif";
    const need = Math.max(...stages0.map(x => textWidth(x.name, `700 12px ${font}`)), due0 ? textWidth("Should be here", `700 10.5px ${font}`) : 0);
    return need === 0 || need + 6 <= colW;
  }, [w, stages0.map(x => x.name).join("|"), due0]);   // eslint-disable-line react-hooks/exhaustive-deps
  const cur0 = model.kind === "shown" ? model.current : -1;
  React.useLayoutEffect(() => {
    const e = curLab.current, b = bar.current; if (!e || !b || labels) { setCl(undefined); return; }
    const bw = b.getBoundingClientRect().width; if (!bw) { setCl(undefined); return; }
    const room = bw + PAD_L + PAD_R - 4, width = Math.min(e.scrollWidth, room), cx = bw * (cur0 + 0.5) / stages0.length;
    setCl({ left: Math.round(Math.min(Math.max(cx - width / 2, -PAD_L + 2), bw + PAD_R - 2 - width)), max: Math.round(room) });
  }, [w, labels, cur0, stages0.length]);
  if (model.kind === "hidden") return null;
  const { stages, current, rag, flags } = model, n = Math.max(1, stages.length), done = rag === "done", flagged = flags.length > 0;
  const seg = 100 / n, within = current >= 0 && !done ? Math.min(100, Math.max(0, (pos - current * seg) / seg * 100)) : 0;
  const icon = done ? ICONS.check : current >= 0 ? ICONS[stages[current].icon] : ICONS.dot;
  const due = stages.findIndex(x => x.due);
  return (
    <div className={`dp dp-${rag}`} role="group" aria-label={`Delivery Progress: ${model.summary}`} ref={root}>
      <div className="dp-plot">
        <div className="dp-bar" ref={bar} style={{ marginLeft: PAD_L, marginRight: PAD_R }}>
          <div className="dp-bub" ref={bub} title={model.label + (model.text ? " · " + model.text : "")}
            style={bp ? { left: bp.left, maxWidth: bp.max } : { left: `${pos}%`, transform: "translateX(-50%)" }}>
            <i className="dp-ar" style={bp ? { left: bp.arrow } : { left: "50%" }} />
            <span className="dp-bt">{model.label && <b>{model.label}</b>}{model.label && model.text ? " · " : ""}{model.text}</span>
          </div>
          <div className="dp-track">{stages.map((s, i) => (
            <span key={i} className={`dp-seg ${s.state}${s.bad ? " bad" : ""}`} title={s.title}>{s.state === "current" && !done && <u style={{ width: `${within}%` }} />}</span>))}
          </div>
          {due >= 0 && <i className="dp-due" style={{ left: `${(due + 0.5) * seg}%` }} title="Where the dates say it should be" />}
          <span className="dp-knob" style={{ left: `${pos}%` }} title={current >= 0 ? stages[current].title : undefined}>{icon}</span>
          {!done && <span className="dp-end" title={model.finish || "Go-live"}>{FLAG}</span>}
        </div>
      </div>
      {labels ? (
        <div className="dp-labels" style={{ marginLeft: PAD_L, marginRight: PAD_R, gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {stages.map((s, i) => (
            <div key={i} className={`dp-lab ${s.state}${s.due ? " due" : ""}`} title={s.title}>
              <span className="dp-nm">{s.name}</span>
              {due >= 0 && <em>{s.due ? "Should be here" : ""}</em>}
            </div>))}
        </div>
      ) : (
        <div className="dp-labels dp-labels-one" style={{ marginLeft: PAD_L, marginRight: PAD_R }}>
          {current >= 0 && <span className="dp-curlab" ref={curLab} title={stages[current].title} style={cl ? { left: cl.left, maxWidth: cl.max } : { left: `${(current + 0.5) * seg}%`, transform: "translateX(-50%)" }}>{stages[current].name}</span>}
        </div>
      )}
      {(model.since || model.finish) && <div className="dp-foot">
        {model.since && <span title={model.since}>{model.since}</span>}
        {model.finish && <span title={model.finish}>{model.finish}</span>}
      </div>}
      {model.note && <div className="dp-note">{model.note}</div>}
      {flagged && <div className="dp-flags">{flags.map(f => <div key={f.text} className={"dp-flag" + (f.level === "r" ? " r" : "")} role="note"><span aria-hidden="true">{f.level === "r" ? "⛔" : "⚠"}</span><span>{f.text}</span></div>)}</div>}
    </div>
  );
}
