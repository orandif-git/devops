import * as React from "react";
import { toCsv } from "../../../src/core/csv";
import { epicsInView, Filters } from "../core/model";
import { barOf, buildGantt, Category, GanttRow, GroupBy, windowOf } from "../core/timeline";
import { epicTiles, passes, TILES } from "../core/epicStats";
import { progressOf } from "../core/progress";
import { PlannerSettings } from "../core/types";
import { Loaded } from "../data/loadAll";
import { downloadFile } from "../../../src/shared/ado";
import { EpicDialog } from "./EpicDialog";
import { VirtualRows } from "./VirtualRows";

const LATE = "#d13438";
const COLOR: Record<Category, string> = { active: "#2a78d6", hold: "#eb6834", done: "#1baf7a", new: "#2a78d6", removed: "#8a8886", other: "#898781" };
const LABEL: Record<Category, string> = { active: "Active", hold: "On hold", done: "Done", new: "New (not started)", removed: "Cancelled / removed", other: "Other state" };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const BAR_BG = (c: Category) => (c === "new" ? "repeating-linear-gradient(45deg,#2a78d6 0 4px,#6da7ec 4px 8px)" : COLOR[c]);

type Row = { kind: "group"; name: string; n: number } | { kind: "epic"; r: GanttRow };

/** Epics as bars from the start-date field to the target-date field, grouped, coloured by state, with a flag for late ones. */
export function GanttTab(p: {
  project: { id: string; name: string }; settings: PlannerSettings; loaded: Loaded; months: string[]; filters: Filters;
  /** Epic keyword search (id, title, state, area, the label field) */
  search?: string;
  /** selected key entries ("s:<state>" or "t:<statistic>"); the Epics matching any of them are shown */
  legend?: string[]; onLegend?(keys: string[]): void;
  /** the statistics shown above the chart (ids, in order) and a way to change them */
  tiles?: string[]; onTiles?(ids: string[]): void;
  /** the grouping, when the page keeps it (saved views) */
  group?: string; onGroup?(g: string): void;
}) {
  const L = p.loaded;
  const [ownGroup, setOwnGroup] = React.useState<GroupBy>("area");
  const group = (p.group ?? ownGroup) as GroupBy, setGroup = (v: GroupBy) => (p.onGroup ? p.onGroup(v) : setOwnGroup(v));
  const [dialog, setDialog] = React.useState<number>();
  const [tip, setTip] = React.useState<{ x: number; y: number; title: string; lines: string[] }>();
  const w = React.useMemo(() => windowOf(p.months), [p.months]);
  const today = new Date().toISOString().slice(0, 10);
  const epicById = React.useMemo(() => new Map(L.epics.map(e => [e.id, e])), [L]);
  const all = React.useMemo(() => buildGantt({ epics: L.epics, bookings: L.bookings, months: p.months, inView: epicsInView(L.epics, p.filters), group, teamOf: k => L.avail.team(k), today, stateGroups: L.stateGroups }), [L, p.months, p.filters, group, today]);
  const labelField = p.settings.ganttLabelField;
  const legend = p.legend ?? [], tileIds = p.tiles ?? p.settings.plan.ganttTiles;
  const [menu, setMenu] = React.useState(false);
  const q = (p.search ?? "").trim().toLowerCase();
  const hit = (r: GanttRow) => !q || [String(r.epic.id), r.epic.title, r.epic.state, r.epic.areaPath, labelField ? r.epic.extra[labelField] ?? "" : ""].some(x => x.toLowerCase().includes(q));
  const searched = React.useMemo(() => all.map(g => ({ ...g, rows: g.rows.filter(hit) })).filter(g => g.rows.length), [all, q, labelField]);   // eslint-disable-line react-hooks/exhaustive-deps
  const groups = React.useMemo(() => searched.map(g => ({ ...g, rows: g.rows.filter(r => passes(r, legend, today)) })).filter(g => g.rows.length), [searched, legend, today]);
  const stats = React.useMemo(() => epicTiles(searched.flatMap(g => g.rows), L.epics.filter(e => epicsInView(L.epics, p.filters).has(e.id)), today, e => progressOf(e, p.settings.executive, L.gridDone?.[e.id], p.settings.sources)?.pct), [searched, L, p.filters, p.settings, today]);
  const toggleKey = (k: string) => p.onLegend?.(legend.includes(k) ? legend.filter(x => x !== k) : [...legend, k]);
  const rows: Row[] = React.useMemo(() => groups.flatMap(g => [...(group === "none" ? [] : [{ kind: "group" as const, name: g.name, n: g.rows.length }]), ...g.rows.map(r => ({ kind: "epic" as const, r }))] as Row[]), [groups, group]);
  /** the Epic states behind each bar colour, so the key names real states (not the colour groups) */
  const key = React.useMemo(() => {
    const m = new Map<Category, Set<string>>(); let late = false, est = false;
    for (const r of searched.flatMap(g => g.rows)) { (m.get(r.category) ?? m.set(r.category, new Set()).get(r.category)!).add(r.epic.state || "(no state)"); late = late || r.late; est = est || r.derived; }
    return { cats: Array.from(m, ([c, s]) => ({ c, states: Array.from(s).sort() })), late, est };
  }, [searched]);
  const nowPct = today >= w.start && today <= w.end ? ((Date.parse(today) - Date.parse(w.start)) / 86400000) / w.days * 100 : undefined;
  const mm = p.months.length;
  const total = groups.reduce((a, g) => a + g.rows.length, 0);
  const exportCsv = () => downloadFile(`epic-timeline-${p.months[0]}-${p.months[mm - 1]}.csv`, "﻿" + toCsv([["Epic", "Title", "State", "Area", "Start", "Target", "Dates from", "People", "Hours in period", "Late"],
    ...groups.flatMap(g => g.rows.map(r => [r.epic.id, r.epic.title, r.epic.state, r.epic.areaPath, r.start, r.end, r.derived ? "hours" : "fields", r.people, r.hours, r.late ? "yes" : ""]))]), "text/csv");
  const head = (
    <div className="tl-head"><div />
      <div className="tl-mo" style={{ gridTemplateColumns: `repeat(${mm}, 1fr)` }}>{p.months.map(m => <span key={m}>{MON[+m.slice(5) - 1]}{mm > 12 || m.endsWith("-01") ? " " + m.slice(2, 4) : ""}</span>)}</div></div>
  );
  return (
    <div>
      <div className="gs-strip" role="group" aria-label="Epic statistics">{tileIds.filter(id => stats[id]).map(id => { const t = TILES.find(x => x.id === id)!, v = stats[id], on = !!v.filter && legend.includes(v.filter);
        return v.filter ? <button key={id} type="button" className={"tile gs" + (on ? " on" : "")} aria-pressed={on} title={t.hint} onClick={() => toggleKey(v.filter!)}><div className="l">{t.label}</div><div className="v">{v.value}</div><div className="d">{v.detail}</div></button>
          : <div key={id} className="tile gs" title={t.hint}><div className="l">{t.label}</div><div className="v">{v.value}</div><div className="d">{v.detail}</div></div>; })}</div>
      <div className="toolbar filters">
        <label>Group by <select value={group} onChange={e => setGroup(e.target.value as GroupBy)}><option value="area">Area</option><option value="state">State</option><option value="team">Team with most hours</option><option value="none">Nothing</option></select></label>
        <button className="btn" onClick={exportCsv} disabled={!total}>Export CSV</button>
        <span className="muted">{total} Epics shown</span>
        {p.onTiles && <span className="cc-anchor"><button className="pill" aria-expanded={menu} onClick={() => setMenu(!menu)}>▦ Statistics</button>
          {menu && <div className="cc-drawer" role="dialog" aria-label="Choose the statistics" style={{ width: 280 }}><h4>Statistics shown above the chart</h4>
            {TILES.map(t => <label key={t.id} title={t.hint} style={{ display: "flex", gap: 6, padding: "2px 0" }}><input type="checkbox" checked={tileIds.includes(t.id)} onChange={e => p.onTiles!(e.target.checked ? TILES.map(x => x.id).filter(id => id === t.id || tileIds.includes(id)) : tileIds.filter(x => x !== t.id))} />{t.label}</label>)}</div>}</span>}
      </div>
      <div className="keyrow" role="group" aria-label="Filter the Epics by state">{key.cats.flatMap(k => k.states.map(s => <button key={k.c + s} type="button" className={"kbtn" + (legend.includes("s:" + s) ? " on" : legend.length ? " dim" : "")} aria-pressed={legend.includes("s:" + s)} title={`Show only ${s} Epics (${LABEL[k.c]})`} onClick={() => toggleKey("s:" + s)}><i style={{ background: BAR_BG(k.c) }} />{s}</button>))}
        {key.late && <button type="button" className={"kbtn" + (legend.includes("t:late") ? " on" : legend.length ? " dim" : "")} aria-pressed={legend.includes("t:late")} title="Show only the late Epics" onClick={() => toggleKey("t:late")}><i style={{ background: LATE }} />Late: target date passed, not completed</button>}
        {key.est && <span className="muted">dashed outline = dates taken from the hours (no start/target date)</span>}
        {legend.length > 0 && <button type="button" className="lk" onClick={() => p.onLegend?.([])}>Clear filter</button>}</div>
      {!settingsDates(p.settings) && <div className="muted">No Epic start or target date field is chosen in Settings, so bars use the months with hours.</div>}
      {!rows.length ? <div className="card muted">No Epics in this period match the filters.</div> : (
        <div className="card" style={{ padding: 0 }}>
          <VirtualRows rows={rows} header={head} maxHeight={640} height={r => (r.kind === "group" ? 28 : 34)}
            overlay={nowPct !== undefined ? <div className="today" style={{ left: `calc(200px + (100% - 200px) * ${nowPct / 100})` }}><span>Today</span></div> : undefined}
            render={r => r.kind === "group" ? <div className="tl-grp">{r.name} <span className="muted">({r.n})</span></div> : (() => {
              const g = r.r; const b = barOf(g.start, g.end, w)!;
              const label = labelField ? (g.epic.extra[labelField] ?? "") : "", inside = b.left + b.width > 78;
              return (
                <div className="tl-row">
                  <div className="tl-name"><a href="#" className="lk" title={g.epic.title} onClick={e => { e.preventDefault(); setDialog(g.epic.id); }}>{g.epic.id} · {g.epic.title}</a><small>{g.epic.state} · {g.people} people · {g.hours} h</small></div>
                  <div className="tl-lane" style={{ backgroundSize: `calc(100% / ${mm}) 100%` }}>
                    <div className={"gb" + (g.derived ? " est" : "")} tabIndex={0} role="button" aria-label={`Epic ${g.epic.id}, ${g.start} to ${g.end}`} style={{ left: b.left + "%", width: b.width + "%", top: 7, background: g.late ? LATE : BAR_BG(g.category), borderRadius: `${b.clippedStart ? 0 : 4}px ${b.clippedEnd ? 0 : 4}px ${b.clippedEnd ? 0 : 4}px ${b.clippedStart ? 0 : 4}px` }}
                      onClick={() => setDialog(g.epic.id)} onKeyDown={ev => { if (ev.key === "Enter") setDialog(g.epic.id); }}
                      onPointerMove={ev => setTip({ x: ev.clientX, y: ev.clientY, title: `${g.epic.id} · ${g.epic.title}`, lines: [`${g.epic.state} · ${g.epic.areaPath}`, `${g.start} → ${g.end}${g.derived ? " (from the hours)" : ""}`, `${g.people} people · ${g.hours} h in the period`, g.late ? "Late: target date has passed" : "", label ? `${labelField.split(".").pop()}: ${label}` : ""].filter(Boolean) })}
                      onPointerLeave={() => setTip(undefined)}>{b.width > 9 ? <span>{`${g.start.slice(5)} → ${g.end.slice(5)}`}</span> : null}{label && inside && <span className="gbl">{label}</span>}</div>
                    {label && !inside && <span className="gl" style={{ left: `calc(${b.left + b.width}% + 6px)` }}>{label}</span>}
                  </div>
                </div>);
            })()} />
        </div>)}
      {tip && <div className="tip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 280), top: tip.y + 14 }}><b>{tip.title}</b>{tip.lines.map((l, i) => <div key={i} className="muted">{l}</div>)}</div>}
      {dialog !== undefined && epicById.get(dialog) && <EpicDialog epic={epicById.get(dialog)!} project={p.project.name} bookings={L.bookings} months={p.months} onClose={() => setDialog(undefined)} />}
    </div>
  );
}
const settingsDates = (s: PlannerSettings) => !!(s.epicStartField || s.epicTargetField);
