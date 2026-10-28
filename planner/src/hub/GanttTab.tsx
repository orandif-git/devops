import * as React from "react";
import { toCsv } from "../../../src/core/csv";
import { epicsInView, Filters } from "../core/model";
import { barOf, buildGantt, Category, GanttRow, GroupBy, windowOf } from "../core/timeline";
import { epicTiles, passes, TILES } from "../core/epicStats";
import { progressOf } from "../core/progress";
import { dimLabel } from "../core/executive";
import { daysBetween, signed } from "../core/history";
import { fmtDate } from "../core/dates";
import { IconAlert, IconCalendar, IconCheck, IconClock, IconClose, IconDensity, IconDownload, IconFlag, IconGauge, IconLayers, IconPause, IconStats } from "./icons";
import { deltaOf, Metric, series, Snapshot } from "../core/snapshots";
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

const TILE_ICON: Record<string, () => React.ReactElement> = { epics: IconLayers, progress: IconGauge, ok: IconCheck, late: IconAlert, new: IconFlag, done: IconCheck, due30: IconClock, hold: IconPause, slip: IconClock, nodates: IconCalendar, duration: IconCalendar, hours: IconClock };
const TILE_COLOR: Record<string, string> = { epics: "#4f46e5", progress: "#0ea5e9", ok: "#16a34a", late: "#dc2626", new: "#64748b", done: "#2563eb", due30: "#d97706", hold: "#ea580c", slip: "#dc2626", nodates: "#64748b", duration: "#4f46e5", hours: "#4f46e5" };
/** the tiles that have a weekly measure, so they can show a trend and the change since last week */
const TILE_METRIC: Record<string, { m: Metric; good?: boolean }> = { epics: { m: "total" }, progress: { m: "progress", good: true }, ok: { m: "green", good: true }, late: { m: "late", good: false }, due30: { m: "due30" }, hold: { m: "hold", good: false }, done: { m: "done", good: true }, new: { m: "idle" } };
const Spark = ({ values, color }: { values: number[]; color: string }) => { if (values.length < 2) return null; const mx = Math.max(...values, 1), mn = Math.min(...values), w = 70, h = 26;
  return <svg className="gs-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true"><polyline fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" points={values.map((v, k) => `${(k / (values.length - 1) * w).toFixed(1)},${(h - 2 - (v - mn) / (mx - mn || 1) * (h - 4)).toFixed(1)}`).join(" ")} /></svg>; };

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
  /** the timeline header: months, or quarters only; and the spacing of the rows */
  zoom?: "m" | "q"; onZoom?(z: "m" | "q"): void; density?: "comfortable" | "compact"; onDensity?(d: "comfortable" | "compact"): void;
}) {
  const L = p.loaded;
  const [ownGroup, setOwnGroup] = React.useState<GroupBy>("area");
  const groupFields = p.settings.ganttGroupFields;
  const wanted = (p.group ?? ownGroup) as GroupBy, group: GroupBy = wanted.startsWith("f:") && !groupFields.includes(wanted.slice(2)) ? "area" : wanted;     // a field taken out of Settings falls back to Area
  const setGroup = (v: GroupBy) => (p.onGroup ? p.onGroup(v) : setOwnGroup(v));
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
  const ff = p.filters, trend = !q && !legend.length && !ff.team && !ff.states.length && !ff.search && !Object.values(ff.extra).some(v => v.length);       // the trend is the whole portfolio, so only while nothing narrows the view
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
  const rowH = p.density === "compact" ? 36 : 50, barTop = (rowH - 20) / 2 - (p.density === "compact" ? 0 : 4);
  const qspans: number[] = [], qlabels: string[] = [];
  for (const m of p.months) { const lab = `Q${Math.floor((+m.slice(5) - 1) / 3) + 1} ${m.slice(2, 4)}`; if (qlabels[qlabels.length - 1] === lab) qspans[qspans.length - 1]++; else { qlabels.push(lab); qspans.push(1); } }
  const head = (
    <div className="tl-head"><div />
      <div className="tl-q" style={{ gridTemplateColumns: qspans.map(n => `${n}fr`).join(" ") }}>{qlabels.map((l, k) => <span key={k}>{l}</span>)}</div>
      <div />
      <div className={"tl-mo" + (p.zoom === "q" ? " off" : "")} style={{ gridTemplateColumns: `repeat(${mm}, 1fr)` }}>{p.months.map(m => <span key={m}>{MON[+m.slice(5) - 1]}{mm > 12 || m.endsWith("-01") ? " " + m.slice(2, 4) : ""}</span>)}</div></div>
  );
  return (
    <div className={"gantt-wrap" + (p.density === "compact" ? " dense" : "")}>
      <div className="gs-strip" role="group" aria-label="Epic statistics">{tileIds.filter(id => stats[id]).map(id => { const t = TILES.find(x => x.id === id)!, v = stats[id], on = !!v.filter && legend.includes(v.filter), Ic = TILE_ICON[id] ?? IconLayers, c = TILE_COLOR[id] ?? "#4f46e5", tm = TILE_METRIC[id], snaps: Snapshot[] = p.loaded.snapshots ?? [];
        const d = trend && tm ? deltaOf(snaps, tm.m) : undefined, body = <><div className="top"><span className="ic" style={{ background: c }}><Ic /></span>{trend && tm && <Spark values={series(snaps, tm.m)} color={c} />}</div><div className="l">{t.label}</div><div className="v">{v.value}</div>
          <div className="d"><span>{v.detail}</span>{d !== undefined && <span className={"gs-delta " + (d === 0 || tm?.good === undefined ? "flat" : (d > 0) === tm.good ? "up" : "down")} title="Whole portfolio, change since last week">{d === 0 ? "no change" : `${d > 0 ? "▲ +" : "▼ "}${d}`}</span>}</div></>;
        return v.filter ? <button key={id} type="button" className={"tile gs" + (on ? " on" : "")} aria-pressed={on} title={t.hint} onClick={() => toggleKey(v.filter!)}>{body}</button> : <div key={id} className="tile gs" title={t.hint}>{body}</div>; })}</div>
      <div className="toolbar filters">
        <label>Group by <select value={group} onChange={e => setGroup(e.target.value as GroupBy)}><option value="area">Area</option><option value="state">State</option><option value="team">Team with most hours</option>{groupFields.map(f => <option key={f} value={"f:" + f}>{dimLabel(f)}</option>)}<option value="none">Nothing</option></select></label>
        <button className="btn" onClick={exportCsv} disabled={!total}><IconDownload /> Export CSV</button>
        <span className="muted">{total} Epics shown</span>
        {p.onZoom && <div className="ex-seg two" role="group" aria-label="Zoom" style={{ ["--i" as string]: p.zoom === "q" ? 1 : 0 }}><button className={p.zoom !== "q" ? "on" : ""} onClick={() => p.onZoom!("m")}>Months</button><button className={p.zoom === "q" ? "on" : ""} onClick={() => p.onZoom!("q")}>Quarters</button></div>}
        {p.onDensity && <button className="pill" aria-pressed={p.density === "compact"} title="Row spacing" onClick={() => p.onDensity!(p.density === "compact" ? "comfortable" : "compact")}><IconDensity /> {p.density === "compact" ? "Compact" : "Comfortable"}</button>}
        {p.onTiles && <span className="cc-anchor"><button className="pill" aria-expanded={menu} onClick={() => setMenu(!menu)}><IconStats /> Statistics</button>
          {menu && <div className="cc-drawer" role="dialog" aria-label="Choose the statistics" style={{ width: 280 }}><button className="modal-x" aria-label="Close statistics" title="Close" onClick={() => setMenu(false)}><IconClose /></button><h4>Statistics shown above the chart</h4>
            {TILES.map(t => <label key={t.id} title={t.hint} style={{ display: "flex", gap: 6, padding: "2px 0" }}><input type="checkbox" checked={tileIds.includes(t.id)} onChange={e => p.onTiles!(e.target.checked ? TILES.map(x => x.id).filter(id => id === t.id || tileIds.includes(id)) : tileIds.filter(x => x !== t.id))} />{t.label}</label>)}</div>}</span>}
      </div>
      <div className="keyrow" role="group" aria-label="Filter the Epics by state">{key.cats.flatMap(k => k.states.map(s => <button key={k.c + s} type="button" className={"kbtn" + (legend.includes("s:" + s) ? " on" : legend.length ? " dim" : "")} aria-pressed={legend.includes("s:" + s)} title={`Show only ${s} Epics (${LABEL[k.c]})`} onClick={() => toggleKey("s:" + s)}><i style={{ background: BAR_BG(k.c) }} />{s}</button>))}
        {key.late && <button type="button" className={"kbtn" + (legend.includes("t:late") ? " on" : legend.length ? " dim" : "")} aria-pressed={legend.includes("t:late")} title="Show only the late Epics" onClick={() => toggleKey("t:late")}><i style={{ background: LATE }} />Late: target date passed, not completed</button>}
        {key.est && <span className="muted">dashed outline = dates taken from the hours (no start/target date)</span>}
        {legend.length > 0 && <button type="button" className="lk" onClick={() => p.onLegend?.([])}>Clear filter</button>}</div>
      {!settingsDates(p.settings) && <div className="muted">No Epic start or target date field is chosen in Settings, so bars use the months with hours.</div>}
      {!rows.length ? <div className="card muted">No Epics in this period match the filters.</div> : (
        <div className="card" style={{ padding: 0 }}>
          <VirtualRows rows={rows} header={head} maxHeight={640} height={r => (r.kind === "group" ? 30 : rowH)}
            overlay={nowPct !== undefined ? <div className="today" style={{ left: `calc(var(--tlw, 200px) + (100% - var(--tlw, 200px)) * ${nowPct / 100})` }}><span>Today</span></div> : undefined}
            render={r => r.kind === "group" ? <div className="tl-grp">{r.name} <span className="muted">({r.n})</span></div> : (() => {
              const g = r.r; const b = barOf(g.start, g.end, w)!;
              const hh = p.settings.history.enabled ? L.history?.[p.settings.epicTargetField]?.[g.epic.id] : undefined, moved = !!hh && hh.baseline !== hh.current, bo = moved ? barOf(hh!.baseline, hh!.baseline, w) : null;
              const label = labelField ? (g.epic.extra[labelField] ?? "") : "", inside = b.left + b.width > 78;
              return (
                <div className="tl-row">
                  <div className="tl-name"><div className="tl-t"><span className="idc">{g.epic.id}</span><a href="#" className="lk" title={g.epic.title} onClick={e => { e.preventDefault(); setDialog(g.epic.id); }}>{g.epic.title}</a></div><small>{g.epic.state} · {g.people} people · {g.hours} h</small></div>
                  <div className="tl-lane" style={{ backgroundSize: `calc(100% / ${mm}) 100%` }}>
                    <div className={"gb" + (g.derived ? " est" : "")} tabIndex={0} role="button" aria-label={`Epic ${g.epic.id}, ${fmtDate(p.settings, g.start)} to ${fmtDate(p.settings, g.end)}`} style={{ left: b.left + "%", width: b.width + "%", top: barTop, background: g.late ? LATE : BAR_BG(g.category), borderRadius: `${b.clippedStart ? 0 : 4}px ${b.clippedEnd ? 0 : 4}px ${b.clippedEnd ? 0 : 4}px ${b.clippedStart ? 0 : 4}px` }}
                      onClick={() => setDialog(g.epic.id)} onKeyDown={ev => { if (ev.key === "Enter") setDialog(g.epic.id); }}
                      onPointerMove={ev => setTip({ x: ev.clientX, y: ev.clientY, title: `${g.epic.id} · ${g.epic.title}`, lines: [`${g.epic.state} · ${g.epic.areaPath}`, `${fmtDate(p.settings, g.start)} → ${fmtDate(p.settings, g.end)}${g.derived ? " (from the hours)" : ""}`, `${g.people} people · ${g.hours} h in the period`, g.late ? "Late: target date has passed" : "", label ? `${labelField.split(".").pop()}: ${label}` : "", hh && hh.changes.length ? `Target date moved ${hh.changes.length}× (${signed(daysBetween(hh.baseline, hh.current))} days); originally ${fmtDate(p.settings, hh.baseline)}` : ""].filter(Boolean) })}
                      onPointerLeave={() => setTip(undefined)}>{b.width > (p.settings.dateFormat ? 16 : 9) ? <span>{p.settings.dateFormat ? `${fmtDate(p.settings, g.start)} → ${fmtDate(p.settings, g.end)}` : `${g.start.slice(5)} → ${g.end.slice(5)}`}</span> : null}{label && inside && <span className="gbl">{label}</span>}</div>
                    {moved && bo && <><div className={"gline " + (hh!.baseline < hh!.current ? "later" : "earlier")} style={{ top: barTop + 23, left: Math.min(bo.left, b.left + b.width) + "%", width: Math.max(.2, Math.abs(b.left + b.width - bo.left)) + "%" }} /><div className="gorig" style={{ top: barTop + 19, left: `calc(${bo.left}% - 5px)` }} title={`Original target date ${fmtDate(p.settings, hh!.baseline)}`} /><span className="gmv" style={{ top: barTop + 20, left: `calc(${bo.left}% + 10px)` }}>{hh!.changes.length}× {signed(daysBetween(hh!.baseline, hh!.current))}d</span></>}
                    {label && !inside && <span className="gl" style={{ top: barTop + 3, left: `calc(${b.left + b.width}% + 6px)` }}>{label}</span>}
                  </div>
                </div>);
            })()} />
        </div>)}
      {tip && <div className="tip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 280), top: tip.y + 14 }}><b>{tip.title}</b>{tip.lines.map((l, i) => <div key={i} className="muted">{l}</div>)}</div>}
      {dialog !== undefined && epicById.get(dialog) && <EpicDialog history={{ field: p.settings.epicTargetField, hist: L.history?.[p.settings.epicTargetField]?.[dialog!], allRead: !!(p.settings.history.enabled && L.history) }} settings={p.settings} epic={epicById.get(dialog)!} project={p.project.name} bookings={L.bookings} months={p.months} onClose={() => setDialog(undefined)} />}
    </div>
  );
}
const settingsDates = (s: PlannerSettings) => !!(s.epicStartField || s.epicTargetField);
