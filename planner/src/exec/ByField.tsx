import * as React from "react";
import { dimLabel, ExecStatus, NO_VALUE, STATUS_NAME } from "../core/executive";
import { autoChart, looksOrdered, naturalSort, orderedSort, PIE_MAX } from "../core/byField";
import { ChartType } from "../core/types";
import { byStatus, Item, pass, SHOWN, toggle } from "./model";
import { COLOR, StackedBars } from "./parts";
import type { LP } from "./layouts";

interface Row { label: string; items: Item[]; counts: Record<ExecStatus, number>; n: number; risk: number; avg: number | undefined; other?: boolean }
const SWITCH: [ChartType, string][] = [["auto", "Auto"], ["bars", "Bars"], ["columns", "Columns"], ["pie", "Pie"], ["table", "Table"]];
const PALETTE = ["#7a1a3c", "#a8325c", "#c9657f", "#e0a0b3", "#475467", "#7c8798", "#a9b1bf", "#d3d8e0", "#eceef2"];   // neutral burgundy and grey: the status colours keep their meaning
const BODY_H = 292;

const rowOf = (label: string, items: Item[], other?: boolean): Row => {
  const counts = byStatus(items), n = items.length, p = items.map(i => i.r.pct).filter((v): v is number => v !== undefined);
  return { label, items, counts, n, risk: n ? Math.round(counts.red / n * 100) : 0, avg: p.length ? Math.round(p.reduce((a, b) => a + b, 0) / p.length) : undefined, other };
};
const Mix = ({ r }: { r: Row }) => <span className="ex-mini" aria-hidden="true">{SHOWN.filter(s => r.counts[s]).map(s => <i key={s} style={{ width: `${r.counts[s] / r.n * 100}%`, background: COLOR[s] }} title={`${STATUS_NAME[s]}: ${r.counts[s]}`} />)}</span>;
const risk = (r: Row) => (r.risk ? `${r.risk}%` : "–");

/** The By-field card: Epics by status for the values of a category field, as bars, columns, a pie or a sortable table. "Auto" picks by the number of values. */
export function ByFieldCard({ lp, dim, onDim }: { lp: LP; dim: string; onDim(d: string): void }) {
  const { f, setF } = lp;
  const bodyRef = React.useRef<HTMLDivElement>(null), [wide, setWide] = React.useState(true);
  React.useEffect(() => { const el = bodyRef.current; if (!el || typeof ResizeObserver === "undefined") return; const ro = new ResizeObserver(() => setWide(el.clientWidth >= 560)); ro.observe(el); return () => ro.disconnect(); }, []);
  const [showAll, setShowAll] = React.useState(false), [q, setQ] = React.useState(""), [sort, setSort] = React.useState<{ k: string; up: boolean }>({ k: "n", up: false });
  React.useEffect(() => { setShowAll(false); setQ(""); setSort({ k: "n", up: false }); }, [dim]);
  const forDim = lp.all.filter(i => pass(i, f, { dim }));
  const groups = new Map<string, Item[]>(); for (const i of forDim) { const v = i.r.dims[dim] || NO_VALUE; groups.set(v, [...(groups.get(v) ?? []), i]); }
  const allValues = Array.from(new Set(lp.all.map(i => i.r.dims[dim] || NO_VALUE)));
  const ordered = looksOrdered(allValues.filter(v => v !== NO_VALUE));
  const rows = Array.from(groups, ([v, a]) => rowOf(v, a)).filter(r => SHOWN.some(s => r.counts[s]));
  const bySize = [...rows].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  const inOrder = ordered ? [...rows].sort((a, b) => (a.label === NO_VALUE ? 1 : 0) - (b.label === NO_VALUE ? 1 : 0) || orderedSort(a.label, b.label)) : bySize;
  const nv = rows.length, auto = autoChart(nv, ordered), mode: ChartType = f.chart[dim] ?? lp.settings.executive.chartTypes[dim] ?? "auto", use = mode === "auto" ? auto : mode;
  const sel = f.dims[dim] ?? [];
  const pickValue = (label: string, s?: ExecStatus) => { if (label.startsWith("Other (")) return; setF({ ...f, dims: { ...f.dims, [dim]: toggle(sel, label) }, status: s ? toggle(f.status, s) : f.status }); };
  const dimmed = (l: string) => sel.length > 0 && !sel.includes(l);
  const setMode = (m: ChartType) => setF({ ...f, chart: { ...f.chart, [dim]: m } });

  const withOther = (list: Row[], max: number, label: (n: number) => string): Row[] => {
    if (list.length <= max) return list;
    const top = list.slice(0, max), rest = list.slice(max), items = rest.flatMap(r => r.items);
    return [...top, { ...rowOf(label(rest.length), items, true) }];
  };
  let body: React.ReactNode;
  if (use === "bars") {
    const base = ordered ? inOrder : bySize, list = showAll ? base : withOther(base, 8, n => `Other (${n} types)`);
    body = <>
      <StackedBars w={wide ? 840 : 420} rowH={Math.max(28, Math.min(44, Math.floor((BODY_H - 4) / Math.max(1, list.length))))} rows={list.map(r => ({ label: r.label, counts: r.counts }))} selected={sel} selectedStatus={f.status} onPick={pickValue} />
      {base.length > 8 && <button type="button" className="ex-more" onClick={() => setShowAll(!showAll)}>{showAll ? "Show the top 8" : `Show all ${base.length}`}</button>}</>;
  } else if (use === "columns") {
    const list = (ordered ? inOrder : bySize).slice(0, 12), mx = Math.max(1, ...list.map(r => r.n));
    body = <div className="ex-vcols">{list.map(r => (
      <div key={r.label} className={"ex-vcol" + (dimmed(r.label) ? " dim" : "")} role="button" tabIndex={0} aria-label={`${r.label}: ${r.n} Epics`} onClick={() => pickValue(r.label)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickValue(r.label); } }}>
        <div className="rk">{r.risk ? `${r.risk}% at risk` : ""}</div><div className="t">{r.n}</div>
        <div className="stk" style={{ height: Math.max(24, r.n / mx * (BODY_H - 70)) }}>{SHOWN.filter(s => r.counts[s]).map(s => <i key={s} style={{ flex: r.counts[s], background: COLOR[s] }} title={`${STATUS_NAME[s]}: ${r.counts[s]}`}>{r.counts[s]}</i>)}</div>
        <div className="x" title={r.label}>{r.label}</div></div>))}
      {rows.length > 12 && <div className="ex-vmore">+{rows.length - 12} more values: use Bars or Table</div>}</div>;
  } else if (use === "pie") {
    const list = withOther(bySize, PIE_MAX, n => `Other (${n} values)`), total = forDim.length || 1;
    let ang = -Math.PI / 2; const C = 120, R = 112, ri = 66, pt = (a: number, r: number) => `${(C + r * Math.cos(a)).toFixed(2)} ${(C + r * Math.sin(a)).toFixed(2)}`;
    const picked = list.find(r => sel.length === 1 && r.label === sel[0]);
    const paths = list.map((r, k) => { const a1 = ang, a2 = ang + r.n / total * Math.PI * 2 - (list.length > 1 ? 0.012 : 0); ang += r.n / total * Math.PI * 2; const big = a2 - a1 > Math.PI ? 1 : 0;
      return <path key={r.label} d={list.length === 1 ? `M${pt(-Math.PI / 2, R)}A${R} ${R} 0 1 1 ${pt(Math.PI / 2, R)}A${R} ${R} 0 1 1 ${pt(-Math.PI / 2, R)}L${pt(-Math.PI / 2, ri)}A${ri} ${ri} 0 1 0 ${pt(Math.PI / 2, ri)}A${ri} ${ri} 0 1 0 ${pt(-Math.PI / 2, ri)}Z` : `M${pt(a1, R)}A${R} ${R} 0 ${big} 1 ${pt(a2, R)}L${pt(a2, ri)}A${ri} ${ri} 0 ${big} 0 ${pt(a1, ri)}Z`}
        fill={PALETTE[k]} className={"seg" + (dimmed(r.label) ? " dimmed" : "")} onClick={() => pickValue(r.label)}><title>{`${r.label}: ${r.n} Epics (${Math.round(r.n / total * 100)}%)`}</title></path>; });
    body = <div className="ex-pie"><svg viewBox="0 0 240 240" role="img" aria-label={`Share of Epics by ${dimLabel(dim)}`}>{paths}
      <text x="120" y="118" textAnchor="middle" className="big">{picked ? picked.n : forDim.length}</text><text x="120" y="138" textAnchor="middle">{picked ? `${Math.round(picked.n / total * 100)}% of Epics` : "Epics"}</text></svg>
      <div className="pl"><div className="ph"><span /><span>{dimLabel(dim)}</span><span>Epics</span><span>Share</span><span>Status mix</span><span>At risk</span></div>
        {list.map((r, k) => <div key={r.label} className={"pr" + (dimmed(r.label) ? " dim" : "") + (r.other ? " other" : "")} role={r.other ? undefined : "button"} tabIndex={r.other ? undefined : 0} onClick={() => pickValue(r.label)} onKeyDown={e => { if (e.key === "Enter") pickValue(r.label); }}>
          <i className="sw" style={{ background: PALETTE[k] }} /><span className="l" title={r.label}>{r.label}</span><b>{r.n}</b><span className="sh">{Math.round(r.n / total * 100)}%</span><Mix r={r} /><span className="rk">{risk(r)}</span></div>)}</div></div>;
  } else {
    const list = rows.filter(r => r.label.toLowerCase().includes(q.toLowerCase())).sort((a, b) => { const g = (r: Row) => (sort.k === "label" ? r.label : sort.k === "risk" ? r.risk : sort.k === "avg" ? r.avg ?? -1 : sort.k === "n" ? r.n : r.counts[sort.k as ExecStatus]); const x = g(a), y = g(b); return (typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number)) * (sort.up ? 1 : -1); });
    const H: [string, string][] = [["label", dimLabel(dim)], ["n", "Epics"], ["", "Status mix"], ["green", STATUS_NAME.green], ["amber", STATUS_NAME.amber], ["red", STATUS_NAME.red], ["idle", STATUS_NAME.idle], ["done", STATUS_NAME.done], ["risk", "% at risk"], ["avg", "Avg progress"]];
    body = <div className="ex-vtable"><div className="tools"><input aria-label={`Search ${nv} values`} placeholder={`Search ${nv} values`} value={q} onChange={e => setQ(e.target.value)} /><span>{list.length} shown · click a header to sort, a row to filter</span></div>
      <div className={"scrw" + (list.length > 8 ? " more" : "")}><div className="scr"><table><thead><tr>{H.map(([k, l]) => <th key={l} className={sort.k === k && k ? "s" + (sort.up ? " up" : "") : ""} onClick={() => k && setSort({ k, up: sort.k === k ? !sort.up : false })}>{l}</th>)}</tr></thead>
        <tbody>{list.map(r => <tr key={r.label} className={dimmed(r.label) ? "dim" : ""} tabIndex={0} aria-label={`${r.label}: ${r.n} Epics`} onClick={() => pickValue(r.label)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickValue(r.label); } }}><td>{r.label}</td><td><b>{r.n}</b></td><td><Mix r={r} /></td>
          {(["green", "amber", "red", "idle", "done"] as ExecStatus[]).map(s => <td key={s} className={r.counts[s] ? "" : "z"}>{r.counts[s] || "–"}</td>)}<td className={r.risk >= 30 ? "hi" : ""}>{risk(r)}</td><td>{r.avg === undefined ? "–" : `${r.avg}%`}</td></tr>)}</tbody></table></div></div></div>;
  }
  return (
    <section className="ex-card ex-byfield" aria-label="Epics by field value">
      <div className="ex-bfh">
        {lp.fields.length > 1 ? <select aria-label="Chart by" value={dim} onChange={e => onDim(e.target.value)}>{lp.fields.map(d => <option key={d} value={d}>By {dimLabel(d).toLowerCase()}</option>)}</select> : <b>By {dimLabel(dim).toLowerCase()}</b>}
        <span className="m">{nv} {nv === 1 ? "value" : "values"} · % at risk</span><span className="sp" />
        {mode === "auto" && <span className="m">Auto → {auto}</span>}
        {use === "pie" && nv > 12 && <span className="m warn" role="status">Pie suits up to 8 values: Table or Bars show all {nv}</span>}
        <div className="ex-bfsw" role="group" aria-label="Chart type">{SWITCH.map(([m, l]) => <button key={m} type="button" className={mode === m ? "on" : ""} aria-pressed={mode === m} onClick={() => setMode(m)}>{l}</button>)}</div></div>
      <div className="ex-bfb" ref={bodyRef}>{body}</div>
    </section>
  );
}
