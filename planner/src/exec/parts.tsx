import * as React from "react";
import { IconClose, IconOpen } from "../../../src/shared/icons";
import { dimLabel, ExecStatus, STATUS_NAME } from "../core/executive";
import { Hist } from "../core/history";
import { HistoryTimeline } from "../hub/HistoryTimeline";
import { Item, SHOWN } from "./model";

export const COLOR: Record<ExecStatus, string> = { green: "#16a34a", amber: "#d97706", red: "#dc2626", unknown: "#94a3b8", idle: "#64748b", done: "#2563eb" };
export const SYM: Record<ExecStatus, string> = { green: "✓", amber: "▲", red: "!", unknown: "?", idle: "○", done: "●" };
export const Sw = ({ s, size }: { s: ExecStatus; size?: number }) => <i className={"ex-sw " + s} aria-hidden="true" style={size ? { width: size, height: size } : undefined}>{SYM[s]}</i>;
export const StatusPill = ({ s }: { s: ExecStatus }) => <span className="ex-pill" style={{ ["--pc" as string]: COLOR[s] }}><Sw s={s} />{STATUS_NAME[s]}</span>;
export const pct = (n: number, d: number) => (d ? Math.round(n / d * 100) : 0);

/** A small line of the last few weeks. */
export function Spark({ values, color, w = 84, h = 26 }: { values: number[]; color: string; w?: number; h?: number }) {
  if (values.length < 2) return null;
  const mx = Math.max(...values, 1), mn = Math.min(...values), pts = values.map((v, k) => `${(k / (values.length - 1) * w).toFixed(1)},${(h - 2 - (v - mn) / (mx - mn || 1) * (h - 4)).toFixed(1)}`).join(" ");
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true"><polyline fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" points={pts} /></svg>;
}
/** The change since last week: `good` says whether an increase is good news. */
export function Delta({ d, good }: { d?: number; good?: boolean }) {
  if (d === undefined) return null;
  const tone = good === undefined || d === 0 ? "flat" : (d > 0) === good ? "up" : "down";
  return <span className={"ex-delta " + tone} title="Change since last week">{d === 0 ? "no change" : `${d > 0 ? "▲ +" : "▼ "}${d}`} <span className="vs">vs last week</span></span>;
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
  const R = 70, C = 2 * Math.PI * R; let off = 0;
  const parts = SHOWN.filter(s => p.counts[s] > 0);
  return (
    <svg viewBox="0 0 330 190" width="100%" role="img" aria-label="Epics by status">
      <g transform="translate(95,95) rotate(-90)">{parts.map(s => { const len = p.counts[s] / (p.total || 1) * C, el = <circle key={s} className={"seg" + (p.selected.length && !p.selected.includes(s) ? " dimmed" : "")} r={R} fill="none" stroke={COLOR[s]} strokeWidth={24} strokeLinecap="round" strokeDasharray={`${Math.max(2, len - 3)} ${C - Math.max(2, len - 3)}`} strokeDashoffset={-off} onClick={() => p.onPick(s)}><title>{STATUS_NAME[s]}: {p.counts[s]}</title></circle>; off += len; return el; })}</g>
      <text x="95" y="93" textAnchor="middle" className="big" style={{ pointerEvents: "none" }}>{p.total}</text><text x="95" y="111" textAnchor="middle" style={{ pointerEvents: "none" }}>Epics</text>
      {SHOWN.map((s, k) => <g key={s} className={"seg" + (p.selected.length && !p.selected.includes(s) ? " dimmed" : "")} transform={`translate(200,${22 + k * 26})`} onClick={() => p.onPick(s)} role="button" tabIndex={0} onKeyDown={e => { if (e.key === "Enter") p.onPick(s); }} aria-pressed={p.selected.includes(s)}><rect width="14" height="14" rx="3" fill={COLOR[s]} /><text x="22" y="11">{STATUS_NAME[s]} · {p.counts[s]}</text></g>)}
    </svg>
  );
}

/** Horizontal stacked bars, one per value, split by status; a click on a bar picks the value, a click on a segment also the status. */
export function StackedBars(p: { rows: { label: string; counts: Record<ExecStatus, number> }[]; selected: string[]; selectedStatus: ExecStatus[]; onPick(label: string, status?: ExecStatus): void }) {
  const rows = p.rows, mx = Math.max(1, ...rows.map(r => SHOWN.reduce((a, s) => a + r.counts[s], 0))), LW = 130, W = 420 - LW - 34;
  return (
    <svg viewBox={`0 0 420 ${rows.length * 30 + 6}`} width="100%" role="img" aria-label="Epics by status for each value">
      {rows.map((r, k) => { const y = k * 30 + 4, tot = SHOWN.reduce((a, s) => a + r.counts[s], 0), dim = p.selected.length > 0 && !p.selected.includes(r.label); let x = LW;
        return <g key={r.label} className={dim ? "dimmed" : ""}>
          <text x="0" y={y + 15} className="seg" onClick={() => p.onPick(r.label)}>{r.label.length > 19 ? r.label.slice(0, 18) + "…" : r.label}<title>{r.label}</title></text>
          {SHOWN.filter(s => r.counts[s]).map(s => { const w = r.counts[s] / mx * W, el = <rect key={s} className={"seg" + (p.selectedStatus.length && !p.selectedStatus.includes(s) ? " dimmed" : "")} x={x} y={y} width={Math.max(1, w - 1)} height="20" rx="6" fill={COLOR[s]} onClick={() => p.onPick(r.label, s)}><title>{r.label} · {STATUS_NAME[s]}: {r.counts[s]}</title></rect>; x += w; return el; })}
          <text x={x + 5} y={y + 15}>{tot}</text></g>; })}
    </svg>
  );
}

/** Vertical stacked columns, one per value (for example a quarter). */
export function Columns(p: { cols: { label: string; counts: Record<ExecStatus, number> }[]; selected: string[]; selectedStatus: ExecStatus[]; onPick(label: string, status?: ExecStatus): void }) {
  const cols = p.cols, H = 170, W = 420, bw = W / Math.max(1, cols.length), mx = Math.max(1, ...cols.map(c => SHOWN.reduce((a, s) => a + c.counts[s], 0)));
  return (
    <svg viewBox={`0 0 ${W} ${H + 34}`} width="100%" role="img" aria-label="Epics by go-live quarter">
      {cols.map((c, k) => { const tot = SHOWN.reduce((a, s) => a + c.counts[s], 0), dim = p.selected.length > 0 && !p.selected.includes(c.label); let y = H;
        return <g key={c.label} className={dim ? "dimmed" : ""}>
          {SHOWN.filter(s => c.counts[s]).map(s => { const hh = c.counts[s] / mx * (H - 22); y -= hh; return <rect key={s} className={"seg" + (p.selectedStatus.length && !p.selectedStatus.includes(s) ? " dimmed" : "")} x={k * bw + 8} y={y} width={Math.max(4, bw - 16)} height={Math.max(1, hh - 1)} rx="5" fill={COLOR[s]} onClick={() => p.onPick(c.label, s)}><title>{c.label} · {STATUS_NAME[s]}: {c.counts[s]}</title></rect>; })}
          <text x={k * bw + bw / 2} y={y - 4} textAnchor="middle">{tot || ""}</text>
          <text x={k * bw + bw / 2} y={H + 16} textAnchor="middle" className="seg" onClick={() => p.onPick(c.label)}>{c.label.length > 9 ? c.label.slice(0, 8) + "…" : c.label}<title>{c.label}</title></text></g>; })}
    </svg>
  );
}
