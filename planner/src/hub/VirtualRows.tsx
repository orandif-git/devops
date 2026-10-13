import * as React from "react";
import { visibleRange } from "../core/timeline";

/** A long list that draws only the rows in view (plus a few more), so hundreds of people or Epics scroll smoothly. */
export function VirtualRows<T>(p: { rows: T[]; height(r: T, i: number): number; render(r: T, i: number): React.ReactNode; header?: React.ReactNode; maxHeight?: number; overlay?: React.ReactNode }) {
  const box = React.useRef<HTMLDivElement>(null);
  const [top, setTop] = React.useState(0);
  const [h, setH] = React.useState(0);
  React.useEffect(() => {
    const el = box.current; if (!el) return;
    const measure = () => setH(el.clientHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure); ro.observe(el); return () => ro.disconnect();
  }, []);
  const heights = React.useMemo(() => p.rows.map((r, i) => p.height(r, i)), [p.rows]);   // eslint-disable-line react-hooks/exhaustive-deps
  const view = h || p.maxHeight || 600;
  const v = React.useMemo(() => visibleRange(heights, top, top + view), [heights, top, view]);
  return (
    <div ref={box} className="vs" style={{ maxHeight: p.maxHeight ?? 640 }} onScroll={e => setTop(e.currentTarget.scrollTop)}>
      {p.header}
      <div style={{ position: "relative", height: v.total }}>
        {p.overlay}
        {p.rows.slice(v.from, v.to).map((r, k) => { const i = v.from + k; return <div key={i} style={{ position: "absolute", left: 0, right: 0, top: v.offsets[i], height: heights[i] }}>{p.render(r, i)}</div>; })}
      </div>
    </div>
  );
}
