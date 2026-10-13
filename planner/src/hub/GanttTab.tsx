import * as React from "react";
import { toCsv } from "../../../src/core/csv";
import { epicsInView, Filters } from "../core/model";
import { barOf, buildGantt, Category, GanttRow, GroupBy, windowOf } from "../core/timeline";
import { PlannerSettings } from "../core/types";
import { Loaded } from "../data/loadAll";
import { downloadFile } from "../../../src/shared/ado";
import { EpicDialog } from "./EpicDialog";
import { VirtualRows } from "./VirtualRows";

const COLOR: Record<Category, string> = { active: "#2a78d6", hold: "#eb6834", done: "#1baf7a", new: "#2a78d6", other: "#898781" };
const LABEL: Record<Category, string> = { active: "Active", hold: "On hold", done: "Done", new: "New (not started)", other: "Other state" };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const BAR_BG = (c: Category) => (c === "new" ? "repeating-linear-gradient(45deg,#2a78d6 0 4px,#6da7ec 4px 8px)" : COLOR[c]);

type Row = { kind: "group"; name: string; n: number } | { kind: "epic"; r: GanttRow };

/** Epics as bars from the start-date field to the target-date field, grouped, coloured by state, with a flag for late ones. */
export function GanttTab(p: { project: { id: string; name: string }; settings: PlannerSettings; loaded: Loaded; months: string[]; filters: Filters }) {
  const L = p.loaded;
  const [group, setGroup] = React.useState<GroupBy>("area");
  const [dialog, setDialog] = React.useState<number>();
  const [tip, setTip] = React.useState<{ x: number; y: number; title: string; lines: string[] }>();
  const w = React.useMemo(() => windowOf(p.months), [p.months]);
  const today = new Date().toISOString().slice(0, 10);
  const epicById = React.useMemo(() => new Map(L.epics.map(e => [e.id, e])), [L]);
  const groups = React.useMemo(() => buildGantt({ epics: L.epics, bookings: L.bookings, months: p.months, inView: epicsInView(L.epics, p.filters), group, teamOf: k => L.avail.team(k), today }), [L, p.months, p.filters, group, today]);
  const rows: Row[] = React.useMemo(() => groups.flatMap(g => [...(group === "none" ? [] : [{ kind: "group" as const, name: g.name, n: g.rows.length }]), ...g.rows.map(r => ({ kind: "epic" as const, r }))] as Row[]), [groups, group]);
  const present = React.useMemo(() => Array.from(new Set(groups.flatMap(g => g.rows.map(r => r.category)))), [groups]);
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
      <div className="toolbar filters">
        <label>Group by <select value={group} onChange={e => setGroup(e.target.value as GroupBy)}><option value="area">Area</option><option value="state">State</option><option value="team">Team with most hours</option><option value="none">Nothing</option></select></label>
        <button className="btn" onClick={exportCsv} disabled={!total}>Export CSV</button>
        <span className="muted">{total} Epics in this period</span>
      </div>
      <div className="keyrow">{present.map(c => <span key={c}><i style={{ background: BAR_BG(c) }} />{LABEL[c]}</span>)}<span><span className="late">Late</span> target date passed, not done</span><span>dashed outline = dates taken from the hours (no start/target date)</span></div>
      {!settingsDates(p.settings) && <div className="muted">No Epic start or target date field is chosen in Settings, so bars use the months with hours.</div>}
      {!rows.length ? <div className="card muted">No Epics in this period match the filters.</div> : (
        <div className="card" style={{ padding: 0 }}>
          <VirtualRows rows={rows} header={head} maxHeight={640} height={r => (r.kind === "group" ? 28 : 34)}
            overlay={nowPct !== undefined ? <div className="today" style={{ left: `calc(200px + (100% - 200px) * ${nowPct / 100})` }}><span>Today</span></div> : undefined}
            render={r => r.kind === "group" ? <div className="tl-grp">{r.name} <span className="muted">({r.n})</span></div> : (() => {
              const g = r.r; const b = barOf(g.start, g.end, w)!;
              return (
                <div className="tl-row">
                  <div className="tl-name"><a href="#" className="lk" title={g.epic.title} onClick={e => { e.preventDefault(); setDialog(g.epic.id); }}>{g.epic.id} · {g.epic.title}</a><small>{g.epic.state} · {g.people} people · {g.hours} h</small></div>
                  <div className="tl-lane" style={{ backgroundSize: `calc(100% / ${mm}) 100%` }}>
                    <div className={"gb" + (g.derived ? " est" : "")} tabIndex={0} role="button" aria-label={`Epic ${g.epic.id}, ${g.start} to ${g.end}`} style={{ left: b.left + "%", width: b.width + "%", top: 7, background: BAR_BG(g.category), borderRadius: `${b.clippedStart ? 0 : 4}px ${b.clippedEnd ? 0 : 4}px ${b.clippedEnd ? 0 : 4}px ${b.clippedStart ? 0 : 4}px` }}
                      onClick={() => setDialog(g.epic.id)} onKeyDown={ev => { if (ev.key === "Enter") setDialog(g.epic.id); }}
                      onPointerMove={ev => setTip({ x: ev.clientX, y: ev.clientY, title: `${g.epic.id} · ${g.epic.title}`, lines: [`${g.epic.state} · ${g.epic.areaPath}`, `${g.start} → ${g.end}${g.derived ? " (from the hours)" : ""}`, `${g.people} people · ${g.hours} h in the period`, g.late ? "Late: target date has passed" : ""].filter(Boolean) })}
                      onPointerLeave={() => setTip(undefined)}>{b.width > 9 ? `${g.start.slice(5)} → ${g.end.slice(5)}` : ""}</div>
                    {g.late && <span className="late flag">Late</span>}
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
