import * as React from "react";
import { IconClose, IconOpen } from "../../../src/shared/icons";
import { dimLabel, ExecStatus, STATUS_NAME } from "../core/executive";
import { Hist } from "../core/history";
import { HistoryTimeline } from "../hub/HistoryTimeline";
import { Item, SHOWN } from "./model";

export const COLOR: Record<ExecStatus, string> = { green: "#1fae5a", amber: "#d97706", red: "#dc2626", unknown: "#94a3b8", idle: "#64748b", done: "#166534" };
export const SYM: Record<ExecStatus, string> = { green: "●", amber: "▲", red: "!", unknown: "?", idle: "○", done: "✓" };
export const Sw = ({ s, size }: { s: ExecStatus; size?: number }) => <i className={"ex-sw " + s} aria-hidden="true" style={size ? { width: size, height: size } : undefined}>{SYM[s]}</i>;
export const StatusPill = ({ s }: { s: ExecStatus }) => <span className="ex-pill" style={{ ["--pc" as string]: COLOR[s] }}><Sw s={s} />{STATUS_NAME[s]}</span>;
export const pct = (n: number, d: number) => (d ? Math.round(n / d * 100) : 0);

/** A small line of the last few weeks. */
/** Subtle motion is on unless the person asks their system for reduced motion (or there is no browser, as in tests). */
export const motionOk = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
/** A number that counts up from 0 when it first appears and moves from the old to the new value when it changes. */
export function Num({ to, suffix = "" }: { to: number; suffix?: string }) {
  const [v, setV] = React.useState(() => (motionOk() ? 0 : to)), prev = React.useRef<number | undefined>(undefined), raf = React.useRef(0);
  React.useEffect(() => {
    const first = prev.current === undefined, from = first ? 0 : prev.current!; prev.current = to;
    if (!motionOk() || from === to) { setV(to); return; }
    const ms = first ? 700 : 450, t0 = performance.now();
    const f = (t: number) => { const k = Math.min(1, (t - t0) / ms); setV(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf.current = requestAnimationFrame(f); };
    raf.current = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf.current);
  }, [to]);
  return <>{v}{suffix}</>;
}
export function Spark({ values, color, w = 84, h = 26 }: { values: number[]; color: string; w?: number; h?: number }) {
  if (values.length < 2) return null;
  const mx = Math.max(...values, 1), mn = Math.min(...values), pts = values.map((v, k) => `${(k / (values.length - 1) * w).toFixed(1)},${(h - 2 - (v - mn) / (mx - mn || 1) * (h - 4)).toFixed(1)}`).join(" ");
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true"><polyline fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" points={pts} /></svg>;
}
/** The change since last week: `good` says whether an increase is good news. */
export function Delta({ d, good, rebuilt }: { d?: number; good?: boolean; rebuilt?: boolean }) {
  if (d === undefined) return null;
  const tone = good === undefined || d === 0 ? "flat" : (d > 0) === good ? "up" : "down";
  return <span className={"ex-delta " + tone} title={rebuilt ? "Change since last week (earlier weeks are rebuilt from the work item history)" : "Change since last week"}>{d === 0 ? "no change" : `${d > 0 ? "▲ +" : "▼ "}${d}`} <span className="vs">vs last week</span></span>;
}

/** A slicer: a button with a pop-up list of values and counts; several values can be chosen. */
export function Slicer(p: { label: string; options: { value: string; count: number; color?: string }[]; selected: string[]; onChange(v: string[]): void; icon?: React.ReactNode }) {
  const [open, setOpen] = React.useState(false), [q, setQ] = React.useState("");
  const ref = React.useRef<HTMLSpanElement>(null);
  React.useEffect(() => { if (!open) return; const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); }; document.addEventListener("mousedown", h); document.addEventListener("keydown", k); return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); }; }, [open]);
  const shown = p.options.filter(o => !q || o.value.toLowerCase().includes(q.toLowerCase()));
  return (
    <span className="ex-slicer" ref={ref}>
      <button className={"ex-chip" + (p.selected.length ? " on" : "")} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="k">{p.label}</span>{p.selected.length ? <b>{p.selected.length === 1 ? p.selected[0] : `${p.selected.length} selected`}</b> : <span className="all">All</span>}<span aria-hidden="true">▾</span></button>
      {open && <div className="ex-pop" role="dialog" aria-label={p.label}>
        {p.options.length > 8 && <input type="search" autoFocus placeholder={`Find in ${p.label.toLowerCase()}…`} aria-label={`Find in ${p.label}`} value={q} onChange={e => setQ(e.target.value)} />}
        <div className="ex-list">{shown.map(o => <label key={o.value}><input type="checkbox" checked={p.selected.includes(o.value)} onChange={() => p.onChange(p.selected.includes(o.value) ? p.selected.filter(x => x !== o.value) : [...p.selected, o.value])} />
          {o.color && <i className="dot" style={{ background: o.color }} />}<span className="t">{o.value}</span><span className="n">{o.count}</span></label>)}
          {!shown.length && <div className="muted">No match.</div>}</div>
        {p.selected.length > 0 && <button className="lk" onClick={() => p.onChange([])}>Clear {p.label.toLowerCase()}</button>}
      </div>}
    </span>
  );
}

/** The side panel with the detail of one Epic. */
export function Drawer(p: { item?: Item; onClose(): void; onDetails(id: number): void; day(t?: number): string; dims: string[]; res?: boolean; hist?: Hist; histState?: "ok" | "loading" | "error" | "none"; histError?: string }) {
  const i = p.item;
  React.useEffect(() => { if (!i) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") p.onClose(); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [i]);   // eslint-disable-line react-hooks/exhaustive-deps
  const r = i?.r;
  return (
    <aside className={"ex-drawer" + (i ? " open" : "")} role="complementary" aria-label="Epic details" aria-hidden={!i}>
      {i && r && <>
        <button className="modal-x" aria-label="Close details" title="Close (Esc)" onClick={p.onClose}><IconClose /></button>
        <h3>{i.title}</h3><div className="muted">{i.id} · {i.state}</div>
        <p><StatusPill s={i.status} /></p>
        {r.check && <div className="ex-check" role="note">⚠ {r.check}</div>}
        <ul className="ex-why">{r.reasons.filter(x => x !== r.check).map(x => <li key={x}>{x}</li>)}</ul>
        <div className="ex-tiles"><div>Progress<b>{r.pct === undefined ? "–" : r.pct + "%"}</b></div><div>Forecast<b>{r.forecast !== undefined && i.status !== "done" ? p.day(r.forecast) : "–"}{r.slip > 0 && i.status !== "done" && <span className="ex-slip"> +{r.slip}d</span>}</b></div>{p.res && <div>Hours booked<b>{i.hours.toLocaleString()} h</b></div>}</div>
        <dl className="ex-kv">
          {p.dims.map(d => <React.Fragment key={d}><dt>{dimLabel(d)}</dt><dd>{r.dims[d]}</dd></React.Fragment>)}
          {p.res && <><dt>Team</dt><dd>{i.team}</dd></>}
          {r.declaredText && <><dt>Declared status</dt><dd>{r.declaredText}{r.compare && r.compare !== "same" ? ` · owner is more ${r.compare === "optimistic" ? "optimistic" : "cautious"} than the data` : r.compare === "same" ? " · matches the data" : ""}</dd></>}
          {r.dataStatus !== i.status && <><dt>Status from the data</dt><dd>{STATUS_NAME[r.dataStatus]}</dd></>}
          {r.limits.from.length > 0 && <><dt>Limits used</dt><dd>{r.limits.from.join("; ")}</dd></>}
          <dt>Start</dt><dd>{p.day(r.start)}</dd><dt>Go-live</dt><dd>{p.day(r.goLive)}</dd>
          <dt>Confidence</dt><dd>{r.conf === null ? "–" : r.conf + " %"}</dd>
          {r.over.length > 0 && <><dt>Over capacity</dt><dd>{r.over.join(", ")}</dd></>}
        </dl>
        <HistoryTimeline hist={p.hist} state={p.histState ?? "loading"} error={p.histError} day={p.day} />
        <button className="btn primary" onClick={() => p.onDetails(i.id)}><IconOpen /> Open the Epic details</button>
      </>}
    </aside>
  );
}

/** A thin bar: progress, with a mark for how much of the time has gone. */
export const ProgressBar = ({ i }: { i: Item }) => { const e = i.r.elapsed, c = COLOR[i.status];
  return <span className="ex-bar" title={i.r.pct === undefined ? "No progress value" : `${i.r.pct}% done${e !== undefined ? `, ${Math.round(e * 100)}% of the time used` : ""}`}><i style={{ width: (i.r.pct ?? 0) + "%", background: c }} />{e !== undefined && <u style={{ left: Math.min(100, e * 100) + "%" }} />}</span>; };

export { SHOWN };

/** Donut of the status counts; a click picks (or drops) that status. */
export function Donut(p: { counts: Record<ExecStatus, number>; selected: ExecStatus[]; onPick(s: ExecStatus): void; total: number }) {
  const R = 62, C = 2 * Math.PI * R; let off = 0;
  const parts = SHOWN.filter(s => p.counts[s] > 0);
  return (
    <div className="ex-donut">
      <svg viewBox="0 0 170 170" role="img" aria-label="Epics by status">
        <g transform="translate(85,85) rotate(-90)">{parts.map(s => { const len = p.counts[s] / (p.total || 1) * C, el = <circle key={s} className={"seg" + (p.selected.length && !p.selected.includes(s) ? " dimmed" : "")} r={R} fill="none" stroke={COLOR[s]} strokeWidth={20} strokeLinecap="round" strokeDasharray={`${Math.max(2, len - 3)} ${C - Math.max(2, len - 3)}`} strokeDashoffset={-off} onClick={() => p.onPick(s)}><title>{s === "done" ? "✓ " : ""}{STATUS_NAME[s]}: {p.counts[s]}</title></circle>; off += len; return el; })}</g>
        <text x="85" y="88" textAnchor="middle" className="big" style={{ pointerEvents: "none" }}>{p.total}</text><text x="85" y="106" textAnchor="middle" style={{ pointerEvents: "none" }}>Epics</text>
      </svg>
      <ul className="ex-legend" aria-label="Status legend">{SHOWN.map(s => <li key={s}><button type="button" className={p.selected.length && !p.selected.includes(s) ? "dimmed" : ""} aria-pressed={p.selected.includes(s)} onClick={() => p.onPick(s)}><i style={{ background: COLOR[s] }}>{s === "done" ? "✓" : ""}</i><span>{STATUS_NAME[s]}</span><b>{p.counts[s]}</b></button></li>)}</ul>
    </div>
  );
}

/** Horizontal stacked bars, one per value, split by status; a click on a bar picks the value, a click on a segment also the status. */
export function StackedBars(p: { rows: { label: string; counts: Record<ExecStatus, number> }[]; selected: string[]; selectedStatus: ExecStatus[]; onPick(label: string, status?: ExecStatus): void }) {
  const uid = React.useRef(Math.random().toString(36).slice(2, 7)).current;
  const rows = p.rows, LW = 148, W = 420 - LW - 78;                           // every bar is the same width: the segments show the share of each status, the number after it the size
  return (
    <svg viewBox={`0 0 420 ${rows.length * 28 + 6}`} width="100%" role="img" aria-label="Epics by status for each value">
      {rows.map((r, k) => { const y = k * 28 + 3, tot = SHOWN.reduce((a, s) => a + r.counts[s], 0), dim = p.selected.length > 0 && !p.selected.includes(r.label), risk = tot ? Math.round(r.counts.red / tot * 100) : 0; let x = LW;
        const parts = SHOWN.filter(s => r.counts[s]);
        return <g key={r.label} className={dim ? "dimmed" : ""}>
          <clipPath id={`${uid}b${k}`}><rect x={LW} y={y} width={W} height="20" rx="10" ry="10" /></clipPath>
          <text x="0" y={y + 14} className="seg" onClick={() => p.onPick(r.label)}>{r.label.length > 24 ? r.label.slice(0, 23) + "…" : r.label}<title>{r.label}</title></text>
          <g clipPath={`url(#${uid}b${k})`}>{parts.map((s, n) => { const w = r.counts[s] / tot * W, el = <g key={s}><rect className={"seg" + (p.selectedStatus.length && !p.selectedStatus.includes(s) ? " dimmed" : "")} x={x} y={y} width={w} height="20" fill={COLOR[s]} onClick={() => p.onPick(r.label, s)}><title>{r.label} · {s === "done" ? "✓ " : ""}{STATUS_NAME[s]}: {r.counts[s]}</title></rect>
            {n < parts.length - 1 && <line x1={x + w} x2={x + w} y1={y} y2={y + 20} stroke="#fff" strokeWidth="2" pointerEvents="none" />}
            {w >= 16 && <text className="inl" x={x + w / 2} y={y + 14} textAnchor="middle">{s === "done" && w >= 30 ? "✓ " : ""}{r.counts[s]}</text>}</g>; x += w; return el; })}</g>
          <text x={LW + W + 8} y={y + 14} style={{ fontWeight: 600 }}>{tot}</text>
          <text x="418" y={y + 14} textAnchor="end" className={risk ? "risk" : ""}>{risk ? `${risk}%` : "–"}</text></g>; })}
    </svg>
  );
}

/** Vertical stacked columns, one per value (for example a quarter). */
export function Columns(p: { cols: { label: string; counts: Record<ExecStatus, number> }[]; selected: string[]; selectedStatus: ExecStatus[]; onPick(label: string, status?: ExecStatus): void }) {
  const uid = React.useRef(Math.random().toString(36).slice(2, 7)).current;
  const cols = p.cols, H = 170, W = 420, bw = W / Math.max(1, cols.length), mx = Math.max(1, ...cols.map(c => SHOWN.reduce((a, s) => a + c.counts[s], 0)));
  return (
    <svg viewBox={`0 0 ${W} ${H + 34}`} width="100%" role="img" aria-label="Epics by go-live quarter">
      {cols.map((c, k) => { const tot = SHOWN.reduce((a, s) => a + c.counts[s], 0), dim = p.selected.length > 0 && !p.selected.includes(c.label), w = Math.min(56, Math.max(8, bw - 24)), x = k * bw + (bw - w) / 2, full = tot / mx * (H - 22), parts = SHOWN.filter(s => c.counts[s]); let y = H;
        return <g key={c.label} className={dim ? "dimmed" : ""}>
          <clipPath id={`${uid}c${k}`}><rect x={x} y={H - full} width={w} height={Math.max(2, full)} rx={Math.min(9, Math.max(1, full / 2))} ry={Math.min(9, Math.max(1, full / 2))} /></clipPath>
          <g clipPath={`url(#${uid}c${k})`}>{parts.map((s, n) => { const hh = c.counts[s] / mx * (H - 22); y -= hh;
            return <g key={s}><rect className={"seg" + (p.selectedStatus.length && !p.selectedStatus.includes(s) ? " dimmed" : "")} x={x} y={y} width={w} height={Math.max(1, hh)} fill={COLOR[s]} onClick={() => p.onPick(c.label, s)}><title>{c.label} · {s === "done" ? "✓ " : ""}{STATUS_NAME[s]}: {c.counts[s]}</title></rect>
              {n < parts.length - 1 && <line x1={x} x2={x + w} y1={y} y2={y} stroke="#fff" strokeWidth="2" pointerEvents="none" />}
              {hh >= 16 && <text className="inl" x={x + w / 2} y={y + hh / 2 + 4} textAnchor="middle">{s === "done" ? "✓ " : ""}{c.counts[s]}</text>}</g>; })}</g>
          <text x={k * bw + bw / 2} y={H - full - 6} textAnchor="middle" style={{ fontWeight: 600 }}>{tot || ""}</text>
          <text x={k * bw + bw / 2} y={H + 16} textAnchor="middle" className="seg" onClick={() => p.onPick(c.label)}>{c.label === "No go-live date" ? "No date" : c.label.length > 9 ? c.label.slice(0, 8) + "…" : c.label}<title>{c.label}</title></text></g>; })}
    </svg>
  );
}
