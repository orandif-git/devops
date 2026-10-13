import * as React from "react";
import { Band } from "../core/aggregate";
import { buildPeople, cellOf, epicsInView, Filters, groupByTeam, heatmapCsv, monthSummary, PersonRow, shortName } from "../core/model";
import { PlannerSettings, Thresholds } from "../core/types";
import { Loaded } from "../data/loadAll";
import { SavedQuery } from "../data/queries";
import { LoadProgress } from "../data/epics";
import { downloadFile } from "../../../src/shared/ado";
import { EpicDialog } from "./EpicDialog";
import { FilterBar } from "./FilterBar";

const RAG: Record<Exclude<Band, "none">, { color: string; icon: string; label: string }> = {
  spare: { color: "#9ec5f4", icon: "", label: "Spare capacity" }, healthy: { color: "#0ca30c", icon: "✓", label: "Healthy" },
  full: { color: "#fab219", icon: "▲", label: "Nearly full" }, over: { color: "#d03b3b", icon: "!", label: "Over capacity" },
};
const BLUES = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95"];
const blueFor = (r: number) => (r <= .10 ? 0 : r <= .25 ? 1 : r <= .40 ? 2 : r <= .55 ? 3 : r <= .70 ? 4 : r <= .85 ? 5 : 6);
const NOCAP = "repeating-linear-gradient(45deg, var(--line) 0 4px, transparent 4px 8px)";
const OVER_HATCH = "repeating-linear-gradient(45deg,#7a1613 0 4px,#4d0e0c 4px 8px)";
const BANDS: Exclude<Band, "none">[] = ["spare", "healthy", "full", "over"];
const MONTH_NAME = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthLabel = (m: string) => MONTH_NAME[+m.slice(5) - 1] + (m.slice(2, 4) !== String(new Date().getFullYear()).slice(2) ? " " + m.slice(2, 4) : "");

function paint(mode: "rag" | "shades", c: ReturnType<typeof cellOf>): { background?: string; color?: string; text: string; label: string } {
  if (c.noCapacity) return { background: NOCAP, color: "var(--fg2)", text: "?", label: "No capacity entered" };
  if (c.ratio === null) return { text: "", label: "" };
  if (mode === "rag") {
    const b = RAG[c.band as Exclude<Band, "none">];
    return { background: b.color, color: c.band === "full" ? "#0b0b0b" : c.band === "spare" ? "#0d366b" : "#fff", text: b.icon, label: b.label };
  }
  if (c.band === "over") return { background: OVER_HATCH, color: "#fff", text: "!", label: "Over capacity" };
  const i = blueFor(c.ratio);
  return { background: BLUES[i], color: i <= 2 ? "#184f95" : "#fff", text: "", label: RAG[c.band as Exclude<Band, "none">].label };
}

/** The utilization heatmap: people by month, banded by how much of their available hours is booked. */
export function HeatmapTab(p: {
  project: { id: string; name: string }; settings: PlannerSettings; loaded?: Loaded; months: string[]; busy: boolean; progress?: LoadProgress; error: string;
  queries: SavedQuery[]; queryId: string; onQuery(id: string): void; onReload(force: boolean): void; filters: Filters; onFilters(f: Filters): void;
}) {
  const filters = p.filters;
  const [mode, setMode] = React.useState(p.settings.colourMode);
  const [th, setTh] = React.useState<Thresholds>(p.settings.thresholds);
  const [popover, setPopover] = React.useState(false);
  const [table, setTable] = React.useState(false);
  const [hl, setHl] = React.useState<Band | null>(null);
  const [sel, setSel] = React.useState<{ person: string; month: string }>();
  const [dialog, setDialog] = React.useState<number>();
  const [tip, setTip] = React.useState<{ x: number; y: number; title: string; lines: string[] }>();
  const nowMonth = new Date().toISOString().slice(0, 7);
  const [focus, setFocus] = React.useState(() => (p.months.includes(nowMonth) ? nowMonth : p.months[0]));
  React.useEffect(() => { if (!p.months.includes(focus)) setFocus(p.months.includes(nowMonth) ? nowMonth : p.months[0]); }, [p.months]);   // eslint-disable-line react-hooks/exhaustive-deps

  const L = p.loaded;
  const people: PersonRow[] = React.useMemo(() => (L ? buildPeople(L.bookings, L.epics, L.avail, p.months, filters) : []), [L, p.months, filters]);
  const groups = React.useMemo(() => groupByTeam(people), [people]);
  const summary = React.useMemo(() => monthSummary(people, focus, th), [people, focus, th]);
  const epicById = React.useMemo(() => new Map((L?.epics ?? []).map(e => [e.id, e])), [L]);
  const inView = React.useMemo(() => (L ? epicsInView(L.epics, filters).size : 0), [L, filters]);
  const selected = sel ? people.find(x => x.key === sel.person) : undefined;

  const exportCsv = () => downloadFile(`resource-utilization-${p.months[0]}-${p.months[p.months.length - 1]}.csv`, "﻿" + heatmapCsv(people, p.months, th), "text/csv");

  if (!L) return (
    <div>
      <div className="toolbar"><button className="btn primary" disabled={p.busy} onClick={() => p.onReload(false)}>{p.busy ? "Loading…" : "Load the planner"}</button>
        {p.progress && <span className="muted">{p.progress.phase === "query" ? "Finding the Epics…" : p.progress.phase === "check" ? `Checking for changes (${p.progress.done}/${p.progress.total})` : `Reading Epics (${p.progress.done}/${p.progress.total})`}</span>}</div>
      {p.error && <div className="err" role="alert">{p.error}</div>}
    </div>
  );

  const month = (m: string) => (
    <button key={m} className={"mh" + (m === focus ? " on" : "")} title="Use this month for the figures above" onClick={() => setFocus(m)}>{monthLabel(m)}</button>
  );
  const cellEl = (pp: PersonRow, m: string) => {
    const c = cellOf(pp, m, th); const v = paint(mode, c);
    const dim = hl !== null && c.band !== hl;
    const open = () => setSel({ person: pp.key, month: m });
    const pct = c.ratio === null ? "" : isFinite(c.ratio) ? `${Math.round(c.ratio * 100)}%` : "no capacity";
    return (
      <div key={m} className={"cell" + (sel?.person === pp.key && sel.month === m ? " sel" : "")} tabIndex={v.label ? 0 : -1} role={v.label ? "button" : undefined}
        aria-label={v.label ? `${shortName(pp.name)}, ${m}: ${c.hours} of ${c.available ?? "?"} hours, ${v.label}` : undefined}
        style={{ background: v.background, color: v.color, opacity: dim ? .2 : 1 }}
        onClick={v.label ? open : undefined} onKeyDown={e => { if (v.label && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(); } }}
        onPointerMove={v.label ? e => setTip({ x: e.clientX, y: e.clientY, title: `${pct ? pct + " · " : ""}${shortName(pp.name)}`, lines: [`${c.hours} h booked of ${c.available ?? "?"} h available`, `${pp.team} · ${m}`, v.label] }) : undefined}
        onPointerLeave={() => setTip(undefined)}>{v.text}</div>
    );
  };

  return (
    <div>
      <FilterBar settings={p.settings} loaded={L} months={p.months} filters={filters} onFilters={p.onFilters} queries={p.queries} queryId={p.queryId} onQuery={p.onQuery} />
      <div className="toolbar filters">
        <label>Colour <select value={mode} onChange={e => setMode(e.target.value as "rag" | "shades")}><option value="rag">Traffic light</option><option value="shades">Shades</option></select></label>
        <span style={{ position: "relative" }}><button className="btn" onClick={() => setPopover(!popover)}>Thresholds…</button>
          {popover && <div className="pop">
            <b>Bands (share of available hours)</b>
            {(["spare", "healthy", "full"] as const).map(k => <label key={k}>{{ spare: "Spare below %", healthy: "Healthy up to %", full: "Nearly full up to %" }[k]}<input type="number" value={th[k]} onChange={e => setTh({ ...th, [k]: Number(e.target.value) })} /></label>)}
            <div className="muted">For this session. The default is set in Settings.</div></div>}</span>
        <button className="btn" onClick={() => setTable(!table)}>{table ? "Heatmap view" : "Table view"}</button>
        <button className="btn" onClick={exportCsv} disabled={!people.length}>Export CSV</button>
        <button className="btn" disabled={p.busy} onClick={() => p.onReload(false)}>{p.busy ? "Refreshing…" : "Refresh"}</button>
        <span className="muted">{L.epics.length} Epics read · refreshed {new Date(L.at).toLocaleTimeString()} · {(L.load.ms / 1000).toFixed(1)} s</span>
      </div>
      {p.error && <div className="err" role="alert">{p.error}</div>}
      {L.stats.unscheduled + L.stats.errored > 0 && <div className="muted">{L.stats.unscheduled} row(s) have no monthly hours and {L.stats.errored} have a scheduling error, so they are not counted (see Data check).</div>}

      <div className="kpis">
        <div className="tile"><div className="l">Utilization, {focus}</div><div className="v">{summary.utilization === null ? "–" : Math.round(summary.utilization * 100) + "%"}</div><div className="d">{summary.hours} of {summary.available} available hours</div></div>
        <div className="tile"><div className="l">Over capacity in {focus}</div><div className="v">{summary.over}</div><div className="d">people above {th.full}%</div></div>
        <div className="tile"><div className="l">Free capacity in {focus}</div><div className="v">{summary.free.toLocaleString()} h</div><div className="d">available hours not yet booked</div></div>
        <div className="tile"><div className="l">Epics in {focus}</div><div className="v">{summary.epics}</div><div className="d">of {inView} in this view</div></div>
      </div>
      {mode === "rag" && (
        <div className="card strip">
          <div className="muted" style={{ fontSize: 12 }}>{focus}: how the {people.length} people are spread across the bands. Click a band to highlight it; click again to clear.</div>
          <div className="row" style={{ marginTop: 6 }}>
            {BANDS.map(b => <button key={b} className={"btn bandbtn" + (hl === b ? " on" : "")} aria-pressed={hl === b} onClick={() => setHl(hl === b ? null : b)}><span className="sw" style={{ background: RAG[b].color, color: b === "full" ? "#0b0b0b" : b === "spare" ? "#0d366b" : "#fff" }}>{RAG[b].icon}</span><b>{summary.counts[b]}</b> {RAG[b].label}</button>)}
            {summary.counts.none > 0 && <span className="muted">{summary.counts.none} with hours but no capacity entered</span>}
          </div>
        </div>
      )}

      <div className="layout">
        <div className="card">
          {!people.length ? <div className="muted">No people match the filters.</div> : table ? (
            <table className="tv"><thead><tr><th>Person</th><th>Team</th>{p.months.map(m => <th key={m}>{monthLabel(m)}</th>)}</tr></thead>
              <tbody>{people.map(pp => <tr key={pp.key}><td>{shortName(pp.name)}</td><td>{pp.team}</td>{p.months.map(m => { const c = cellOf(pp, m, th); return <td key={m}>{c.ratio === null ? (c.noCapacity ? `${c.hours} h, no capacity` : "") : isFinite(c.ratio) ? Math.round(c.ratio * 100) + "%" : `${c.hours} h`}</td>; })}</tr>)}</tbody></table>
          ) : (
            <div className="hm" style={{ gridTemplateColumns: `180px repeat(${p.months.length}, minmax(34px, 1fr))` }}>
              <div />{p.months.map(month)}
              {groups.map(g => <React.Fragment key={g.team}><div className="team">{g.team}</div>
                {g.people.map(pp => <React.Fragment key={pp.key}><div className="n" title={pp.name}>{shortName(pp.name)}</div>{p.months.map(m => cellEl(pp, m))}</React.Fragment>)}</React.Fragment>)}
            </div>
          )}
          <div className="legend">
            {mode === "rag" ? BANDS.map(b => <span key={b} className="lg"><span className="sw" style={{ background: RAG[b].color, color: b === "full" ? "#0b0b0b" : b === "spare" ? "#0d366b" : "#fff" }}>{RAG[b].icon}</span>{RAG[b].label} ({{ spare: `under ${th.spare}%`, healthy: `${th.spare}–${th.healthy}%`, full: `${th.healthy}–${th.full}%`, over: `above ${th.full}%` }[b]})</span>)
              : <><span className="lg">0 %<span className="ramp">{BLUES.map(c => <i key={c} style={{ background: c }} />)}</span>{th.full} % of available hours</span><span className="lg"><span className="sw" style={{ background: OVER_HATCH, color: "#fff" }}>!</span>Over capacity (above {th.full}%)</span></>}
            <span className="lg"><span className="sw" style={{ background: NOCAP, color: "var(--fg2)" }}>?</span>Hours but no capacity entered</span>
          </div>
        </div>
        <div className="card panel">
          {!selected || !sel ? <><h3 style={{ margin: 0 }}>Select a cell</h3><div className="muted">The Epics and hours behind a person's month appear here. Click an Epic to open it.</div></> : (() => {
            const c = cellOf(selected, sel.month, th);
            return <>
              <h3 style={{ margin: 0 }}>{shortName(selected.name)}</h3><div className="muted">{selected.team} · {sel.month}</div>
              <div className="big">{c.hours} / {c.available ?? "?"} h{c.ratio !== null && isFinite(c.ratio) ? ` · ${Math.round(c.ratio * 100)}%` : ""}</div>
              <div className="meter"><i style={{ width: Math.min(100, (c.ratio !== null && isFinite(c.ratio) ? c.ratio : 1) * 100) + "%", background: c.band === "over" ? "#d03b3b" : "var(--accent)" }} /></div>
              <table className="mini"><thead><tr><th>Epic</th><th>Hours</th></tr></thead><tbody>
                {(selected.epics[sel.month] ?? []).sort((a, b) => b.hours - a.hours).map(e => { const ep = epicById.get(e.epicId); return <tr key={e.epicId}><td><a href="#" className="lk" onClick={ev => { ev.preventDefault(); setDialog(e.epicId); }}>{e.epicId}</a> · {ep?.title ?? ""}</td><td>{e.hours}</td></tr>; })}
                {!(selected.epics[sel.month] ?? []).length && <tr><td colSpan={2} className="muted">No hours this month.</td></tr>}</tbody></table>
            </>;
          })()}
        </div>
      </div>
      {tip && <div className="tip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 280), top: tip.y + 14 }}><b>{tip.title}</b>{tip.lines.map((l, i) => <div key={i} className="muted">{l}</div>)}</div>}
      {dialog !== undefined && epicById.get(dialog) && <EpicDialog epic={epicById.get(dialog)!} project={p.project.name} bookings={L.bookings} months={p.months} onClose={() => setDialog(undefined)} />}
    </div>
  );
}
