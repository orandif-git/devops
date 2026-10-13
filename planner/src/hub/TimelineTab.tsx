import * as React from "react";
import { buildPeople, cellOf, epicsInView, Filters, groupByTeam, NO_TEAM, PersonRow, shortName } from "../core/model";
import { layoutTasks, windowOf } from "../core/timeline";
import { PlannerSettings, Task } from "../core/types";
import { Loaded } from "../data/loadAll";
import { EpicDialog } from "./EpicDialog";
import { VirtualRows } from "./VirtualRows";

const SHADES = [["#b7d3f6", "#184f95"], ["#6da7ec", "#0d366b"], ["#256abf", "#ffffff"], ["#0d366b", "#ffffff"]] as const;
const shade = (a?: number) => SHADES[a === undefined || a > 75 ? 3 : a > 50 ? 2 : a > 25 ? 1 : 0];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LANE = 18, PAD = 8;

type Row = { kind: "group"; team: string } | { kind: "person"; p: PersonRow; placed: ReturnType<typeof layoutTasks>["placed"]; lanes: number; over: string[] };

/** One row per person; each bar is a task (a grid row) on an Epic from its start to its end date, darker for a higher allocation. */
export function TimelineTab(p: { project: { id: string; name: string }; settings: PlannerSettings; loaded: Loaded; months: string[]; filters: Filters; onPerson?(key: string): void }) {
  const L = p.loaded;
  const w = React.useMemo(() => windowOf(p.months), [p.months]);
  const [dialog, setDialog] = React.useState<number>();
  const [tip, setTip] = React.useState<{ x: number; y: number; title: string; lines: string[] }>();
  const epicById = React.useMemo(() => new Map(L.epics.map(e => [e.id, e])), [L]);
  const rows: Row[] = React.useMemo(() => {
    const inView = epicsInView(L.epics, p.filters);
    const byPerson = new Map<string, Task[]>();
    for (const t of L.tasks) if (inView.has(t.epicId)) byPerson.set(t.person, [...(byPerson.get(t.person) ?? []), t]);
    const people = buildPeople(L.bookings, L.epics, L.avail, p.months, { ...p.filters, showIdle: p.filters.showIdle });
    const out: Row[] = [];
    for (const g of groupByTeam(people)) {
      const list = g.people.map(pp => { const { placed, lanes } = layoutTasks(byPerson.get(pp.key) ?? [], w); const over = p.months.filter(m => cellOf(pp, m, p.settings.thresholds).band === "over"); return { pp, placed, lanes, over }; })
        .filter(x => x.placed.length > 0 || p.filters.showIdle);
      if (!list.length) continue;
      out.push({ kind: "group", team: g.team });
      for (const x of list) out.push({ kind: "person", p: x.pp, placed: x.placed, lanes: x.lanes, over: x.over });
    }
    return out;
  }, [L, p.months, p.filters, p.settings.thresholds, w]);
  const nowPct = (() => { const t = new Date().toISOString().slice(0, 10); return t >= w.start && t <= w.end ? ((Date.parse(t) - Date.parse(w.start)) / 86400000) / w.days * 100 : undefined; })();
  const mm = p.months.length;
  const head = (
    <div className="tl-head"><div />
      <div className="tl-mo" style={{ gridTemplateColumns: `repeat(${mm}, 1fr)` }}>{p.months.map(m => <span key={m}>{MON[+m.slice(5) - 1]}{mm > 12 || m.endsWith("-01") ? " " + m.slice(2, 4) : ""}</span>)}</div></div>
  );
  return (
    <div>
      <div className="muted" style={{ marginBottom: 6 }}>Each bar is a task on an Epic (start to end date from the grid). Darker means a higher allocation; a red “!” marks a person over capacity in some month. Click a bar to open the Epic.</div>
      <div className="keyrow"><span>Allocation</span><span className="ramp">{SHADES.map(([c], i) => <i key={i} style={{ background: c }} />)}</span><span>25 % → 100 %</span><span><span className="sw" style={{ background: "#d03b3b", color: "#fff" }}>!</span> over capacity in some month</span><span>dashed = estimated from effort</span></div>
      {!rows.length ? <div className="card muted">No people match the filters.</div> : (
        <div className="card" style={{ padding: 0 }}>
          <VirtualRows rows={rows} header={head} maxHeight={640}
            height={r => (r.kind === "group" ? 28 : PAD * 2 + r.lanes * LANE)}
            overlay={nowPct !== undefined ? <div className="today" style={{ left: `calc(200px + (100% - 200px) * ${nowPct / 100})` }}><span>Today</span></div> : undefined}
            render={r => r.kind === "group" ? <div className="tl-grp">{r.team}</div> : (
              <div className="tl-row">
                <div className="tl-name" style={p.onPerson ? { cursor: "pointer" } : undefined} onClick={p.onPerson ? () => p.onPerson!(r.p.key) : undefined}><b title={r.p.name}>{shortName(r.p.name)}</b>{r.over.length > 0 && <span className="sw over" title={`Over capacity in ${r.over.join(", ")}`} style={{ background: "#d03b3b", color: "#fff" }}>!</span>}</div>
                <div className="tl-lane" style={{ backgroundSize: `calc(100% / ${mm}) 100%` }}>
                  {r.placed.map((x, i) => { const [bg, fg] = shade(x.task.allocation); const e = epicById.get(x.task.epicId);
                    return <div key={i} className={"gb pt" + (x.task.estimated ? " est" : "")} tabIndex={0} role="button" style={{ left: x.left + "%", width: x.width + "%", top: PAD + x.lane * LANE, background: bg, color: fg }}
                      aria-label={`${shortName(r.p.name)}, Epic ${x.task.epicId}, ${x.task.start} to ${x.task.end}`}
                      onClick={() => setDialog(x.task.epicId)} onKeyDown={ev => { if (ev.key === "Enter") setDialog(x.task.epicId); }}
                      onPointerMove={ev => setTip({ x: ev.clientX, y: ev.clientY, title: `${x.task.epicId} · ${e?.title ?? ""}`, lines: [shortName(r.p.name), `${x.task.start} → ${x.task.end}`, [x.task.label, x.task.allocation !== undefined ? `${x.task.allocation}% allocation` : "", x.task.effort !== undefined ? `${x.task.effort} h` : ""].filter(Boolean).join(" · ")].filter(Boolean) })}
                      onPointerLeave={() => setTip(undefined)}>{x.task.epicId}{x.task.allocation !== undefined ? ` · ${x.task.allocation}%` : ""}</div>; })}
                </div>
              </div>)} />
        </div>)}
      <div className="muted" style={{ marginTop: 6 }}>{rows.filter(r => r.kind === "person").length} people shown{rows.some(r => r.kind === "group" && r.team === NO_TEAM) ? " (some without team capacity)" : ""}.</div>
      {tip && <div className="tip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 280), top: tip.y + 14 }}><b>{tip.title}</b>{tip.lines.map((l, i) => <div key={i} className="muted">{l}</div>)}</div>}
      {dialog !== undefined && epicById.get(dialog) && <EpicDialog epic={epicById.get(dialog)!} project={p.project.name} bookings={L.bookings} months={p.months} onClose={() => setDialog(undefined)} />}
    </div>
  );
}
