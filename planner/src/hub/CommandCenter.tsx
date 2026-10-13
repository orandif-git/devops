import * as React from "react";
import { Band } from "../core/aggregate";
import { buildPeople, cellOf, epicsInView, Filters, groupByTeam, heatmapCsv, monthSummary, noFilters, NO_TEAM, PersonRow, shortName } from "../core/model";
import { Period, PlannerSettings } from "../core/types";
import { Loaded } from "../data/loadAll";
import { SavedQuery } from "../data/queries";
import { LoadProgress } from "../data/epics";
import { downloadFile } from "../../../src/shared/ado";
import { EpicDialog } from "./EpicDialog";
import { BANDS, monthLabel, paint, RAG } from "./HeatmapTab";
import { TimelineTab } from "./TimelineTab";
import { GanttTab } from "./GanttTab";

type View = "heat" | "time" | "gantt";
const bandText = (b: Exclude<Band, "none">) => (b === "full" ? "#0b0b0b" : b === "spare" ? "#0d366b" : "#fff");
const Sw = ({ b }: { b: Exclude<Band, "none"> }) => <span className="sw" aria-hidden="true" style={{ background: RAG[b].color, color: bandText(b) }}>{RAG[b].icon}</span>;
const pctOf = (r: number | null) => (r === null ? "–" : !isFinite(r) ? "no capacity" : Math.round(r * 100) + "%");

/** One screen: compact filters with chips, KPI strip with band buttons, a Heatmap / Timeline / Gantt switch, and a detail panel. */
export function CommandCenter(p: {
  project: { id: string; name: string }; settings: PlannerSettings; loaded?: Loaded; months: string[]; busy: boolean; progress?: LoadProgress; error: string;
  queries: SavedQuery[]; queryId: string; onQuery(id: string): void; onReload(force: boolean): void;
  filters: Filters; onFilters(f: Filters): void; period: Period; onPeriod(v: Period): void;
}) {
  const L = p.loaded, f = p.filters, th = p.settings.thresholds;
  const [view, setView] = React.useState<View>("heat");
  const [drawer, setDrawer] = React.useState(false);
  const [hl, setHl] = React.useState<Band | null>(null);
  const [shut, setShut] = React.useState<Record<string, boolean>>({});
  const [sel, setSel] = React.useState<{ person: string; month: string }>();
  const [dialog, setDialog] = React.useState<number>();
  const [hov, setHov] = React.useState<string>();
  const [tip, setTip] = React.useState<{ x: number; y: number; title: string; lines: string[] }>();
  const nowMonth = new Date().toISOString().slice(0, 7);
  const [focus, setFocus] = React.useState(() => (p.months.includes(nowMonth) ? nowMonth : p.months[0]));
  React.useEffect(() => { if (!p.months.includes(focus)) setFocus(p.months.includes(nowMonth) ? nowMonth : p.months[0]); }, [p.months]);   // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { if (drawer) setDrawer(false); else setSel(undefined); } };
    document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k);
  }, [drawer]);
  const set = (patch: Partial<Filters>) => p.onFilters({ ...f, ...patch });

  const people = React.useMemo(() => (L ? buildPeople(L.bookings, L.epics, L.avail, p.months, f) : []), [L, p.months, f]);
  const groups = React.useMemo(() => groupByTeam(people), [people]);
  const summary = React.useMemo(() => monthSummary(people, focus, th), [people, focus, th]);
  const epicById = React.useMemo(() => new Map((L?.epics ?? []).map(e => [e.id, e])), [L]);
  const teams = React.useMemo(() => Array.from(new Set((L ? buildPeople(L.bookings, L.epics, L.avail, p.months, noFilters()) : []).map(x => x.team))).sort((a, b) => (a === NO_TEAM ? 1 : 0) - (b === NO_TEAM ? 1 : 0) || a.localeCompare(b)), [L, p.months]);
  const states = React.useMemo(() => Array.from(new Set((L?.epics ?? []).map(e => e.state))).sort(), [L]);
  const extraValues = (field: string) => Array.from(new Set((L?.epics ?? []).map(e => e.extra[field] ?? ""))).sort();
  const selected = sel ? people.find(x => x.key === sel.person) : undefined;
  const inView = L ? epicsInView(L.epics, f).size : 0;

  if (!L) return (
    <div>
      <div className="toolbar"><button className="btn primary" disabled={p.busy} onClick={() => p.onReload(false)}>{p.busy ? "Loading…" : "Load the planner"}</button>
        {p.progress && <span className="muted">{p.progress.phase === "query" ? "Finding the Epics…" : p.progress.phase === "check" ? `Checking for changes (${p.progress.done}/${p.progress.total})` : `Reading Epics (${p.progress.done}/${p.progress.total})`}</span>}</div>
      {p.error && <div className="err" role="alert">{p.error}</div>}
    </div>
  );

  const extraCount = f.states.length + Object.values(f.extra).reduce((n, v) => n + v.length, 0) + (f.showIdle ? 0 : 1);
  const chips: { label: string; clear(): void }[] = [
    ...(p.queryId ? [{ label: "Query: " + (p.queries.find(q => q.id === p.queryId)?.name ?? "saved query"), clear: () => p.onQuery("") }] : []),
    ...(f.team ? [{ label: "Team: " + f.team, clear: () => set({ team: "" }) }] : []),
    ...f.states.map(s => ({ label: "State: " + s, clear: () => set({ states: f.states.filter(x => x !== s) }) })),
    ...Object.entries(f.extra).flatMap(([k, v]) => v.map(x => ({ label: `${k.split(".").pop()}: ${x || "(empty)"}`, clear: () => set({ extra: { ...f.extra, [k]: v.filter(y => y !== x) } }) }))),
    ...(hl ? [{ label: "Band: " + RAG[hl as Exclude<Band, "none">].label, clear: () => setHl(null) }] : []),
  ];
  const clearAll = () => { p.onFilters({ ...noFilters(), search: f.search }); setHl(null); if (p.queryId) p.onQuery(""); };
  const exportCsv = () => downloadFile(`resource-utilization-${p.months[0]}-${p.months[p.months.length - 1]}.csv`, "﻿" + heatmapCsv(people, p.months, th), "text/csv");

  const heat = (
    <div className="cc-scroll"><div className="hm" style={{ gridTemplateColumns: `180px repeat(${p.months.length}, minmax(34px, 1fr))` }}>
      <div />{p.months.map(m => <button key={m} className={"mh" + (m === focus ? " on" : m === hov ? " hov" : "")} title="Use this month for the figures above" onClick={() => setFocus(m)}>{monthLabel(m)}</button>)}
      {groups.map(g => { const gs = monthSummary(g.people, focus, th); const closed = shut[g.team];
        return <React.Fragment key={g.team}>
          <button className={"cc-team" + (closed ? " shut" : "")} aria-expanded={!closed} onClick={() => setShut({ ...shut, [g.team]: !closed })}>
            <span className="car">▾</span>{g.team}<span className="cc-mini">{g.people.length} people · {pctOf(gs.utilization)} in {monthLabel(focus)}{gs.over > 0 && <span className="cc-flag"><Sw b="over" />{gs.over} over</span>}</span></button>
          {!closed && g.people.map(pp => <React.Fragment key={pp.key}>
            <button className={"n cc-nm" + (sel?.person === pp.key ? " sel" : "")} title={pp.name} onClick={() => setSel({ person: pp.key, month: focus })}>{shortName(pp.name)}</button>
            {p.months.map(m => {
              const c = cellOf(pp, m, th), v = paint(p.settings.colourMode, c), dim = hl !== null && c.band !== hl;
              const open = () => { setSel({ person: pp.key, month: m }); setFocus(m); };
              return <div key={m} className={"cell" + (sel?.person === pp.key && sel.month === m ? " sel" : "")} tabIndex={v.label ? 0 : -1} role={v.label ? "button" : undefined}
                aria-label={v.label ? `${shortName(pp.name)}, ${m}: ${c.hours} of ${c.available ?? "?"} hours, ${v.label}` : undefined}
                style={{ background: v.background, color: v.color, opacity: dim ? .18 : 1 }}
                onClick={v.label ? open : undefined} onKeyDown={e => { if (v.label && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(); } }}
                onPointerEnter={() => setHov(m)} onPointerLeave={() => { setHov(undefined); setTip(undefined); }}
                onPointerMove={v.label ? e => setTip({ x: e.clientX, y: e.clientY, title: `${pctOf(c.ratio)} · ${shortName(pp.name)}`, lines: [`${c.hours} h booked of ${c.available ?? "?"} h available`, `${pp.team} · ${m}`, v.label] }) : undefined}>{v.text}</div>;
            })}</React.Fragment>)}
        </React.Fragment>; })}
    </div></div>
  );

  return (
    <div className="cc">
      <div className="cc-bar">
        <label className="pill"><span className="k">Period</span><select value={p.period.kind} onChange={e => p.onPeriod({ ...p.period, kind: e.target.value as Period["kind"] })}>
          <option value="year">This calendar year</option><option value="quarter">This quarter</option><option value="last12">Last 12 months</option><option value="next12">Next 12 months</option><option value="custom">Custom…</option></select></label>
        {p.period.kind === "custom" && <label className="pill"><span className="k">From–to</span>
          <input aria-label="From month" value={p.period.from ?? ""} placeholder="YYYY-MM" style={{ width: 70 }} onChange={e => p.onPeriod({ ...p.period, from: e.target.value })} />–
          <input aria-label="To month" value={p.period.to ?? ""} placeholder="YYYY-MM" style={{ width: 70 }} onChange={e => p.onPeriod({ ...p.period, to: e.target.value })} /></label>}
        <label className="pill"><span className="k">Team</span><select value={f.team} onChange={e => set({ team: e.target.value })}><option value="">All teams</option>{teams.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
        <label className="pill"><span className="k">Epics</span><select value={p.queryId} onChange={e => p.onQuery(e.target.value)}><option value="">All {p.settings.workItemType}s</option>{p.queries.map(q => <option key={q.id} value={q.id}>Query: {q.path}</option>)}</select></label>
        <label className="pill search"><span className="k">⌕</span><input type="search" aria-label="Find a person" placeholder="Find a person…" value={f.search} onChange={e => set({ search: e.target.value })} /></label>
        <span className="cc-anchor"><button className="pill" aria-expanded={drawer} onClick={() => setDrawer(!drawer)}>⚙ Filters{extraCount ? ` (${extraCount})` : ""}</button>
          {drawer && <div className="cc-drawer" role="dialog" aria-label="More filters">
            <h4>{p.settings.workItemType} state</h4><div className="g">{states.map(s => <label key={s}><input type="checkbox" checked={f.states.includes(s)} onChange={e => set({ states: e.target.checked ? [...f.states, s] : f.states.filter(x => x !== s) })} />{s}</label>)}</div>
            {p.settings.extraFilterFields.map(k => <React.Fragment key={k}><h4>{k.split(".").pop()}</h4><div className="g">{extraValues(k).map(v => { const cur = f.extra[k] ?? []; return <label key={v}><input type="checkbox" checked={cur.includes(v)} onChange={e => set({ extra: { ...f.extra, [k]: e.target.checked ? [...cur, v] : cur.filter(x => x !== v) } })} />{v || "(empty)"}</label>; })}</div></React.Fragment>)}
            <h4>People</h4><div className="g"><label><input type="checkbox" checked={f.showIdle} onChange={e => set({ showIdle: e.target.checked })} />Show people without hours</label></div>
          </div>}</span>
        <button className="pill" disabled={p.busy} onClick={() => p.onReload(false)} title={`${L.epics.length} Epics read · refreshed ${new Date(L.at).toLocaleTimeString()} · ${(L.load.ms / 1000).toFixed(1)} s`}>{p.busy ? "Refreshing…" : "⟳ Refresh"}</button>
        <button className="pill" disabled={!people.length} onClick={exportCsv}>⭳ CSV</button>
        <div className="seg" role="tablist" aria-label="View">{([["heat", "Heatmap"], ["time", "Timeline"], ["gantt", "Epic Gantt"]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={view === k} className={view === k ? "on" : ""} onClick={() => setView(k)}>{l}</button>)}</div>
      </div>
      {chips.length > 0 && <div className="cc-chips">{chips.map((c, i) => <span key={i} className="cchip">{c.label}<button aria-label={`Remove filter ${c.label}`} onClick={c.clear}>×</button></span>)}{chips.length > 1 && <button className="lk" onClick={clearAll}>Clear all</button>}</div>}
      {p.error && <div className="err" role="alert">{p.error}</div>}
      {L.stats.unscheduled + L.stats.errored > 0 && <div className="muted" style={{ marginBottom: 6 }}>{L.stats.unscheduled} row(s) have no monthly hours and {L.stats.errored} have a scheduling error, so they are not counted (see Diagnostics).</div>}

      <div className="cc-strip">
        <div className="tile"><div className="l">Utilization · {monthLabel(focus)}</div><div className="v">{pctOf(summary.utilization)}</div><div className="d">{summary.hours} of {summary.available} h</div></div>
        <div className="tile"><div className="l">Over capacity</div><div className="v">{summary.over > 0 && <Sw b="over" />}{summary.over}</div><div className="d">people above {th.full}%</div></div>
        <div className="tile"><div className="l">Free capacity</div><div className="v">{summary.free.toLocaleString()} h</div><div className="d">not yet booked · {summary.epics} of {inView} Epics</div></div>
        <div className="tile"><div className="l">{monthLabel(focus)}: how the {people.length} people spread across the bands</div>
          <div className="cc-bands">{BANDS.map(b => <button key={b} className={"band" + (hl === b ? " on" : hl ? " dim" : "")} aria-pressed={hl === b} onClick={() => setHl(hl === b ? null : b)}><Sw b={b} /><b>{summary.counts[b]}</b><span>{RAG[b].label}</span></button>)}</div></div>
      </div>

      <div className={"cc-main" + (selected && sel ? " withpanel" : "")}>
        <div className="card" style={{ minWidth: 0 }}>
          {view === "heat" ? (!people.length ? <div className="muted">No people match the filters.</div> : <>
            {heat}
            <div className="legend">{BANDS.map(b => <span key={b} className="lg"><Sw b={b} />{RAG[b].label} ({{ spare: `under ${th.spare}%`, healthy: `${th.spare}–${th.healthy}%`, full: `${th.healthy}–${th.full}%`, over: `above ${th.full}%` }[b]})</span>)}
              <span className="lg"><span className="sw" style={{ background: "repeating-linear-gradient(45deg, var(--line) 0 4px, transparent 4px 8px)", color: "var(--fg2)" }}>?</span>Hours but no capacity entered</span></div></>)
            : view === "time" ? <TimelineTab project={p.project} settings={p.settings} loaded={L} months={p.months} filters={f} onPerson={key => setSel({ person: key, month: focus })} />
            : <GanttTab project={p.project} settings={p.settings} loaded={L} months={p.months} filters={f} />}
        </div>
        {selected && sel && (() => {
          const c = cellOf(selected, sel.month, th); const list = [...(selected.epics[sel.month] ?? [])].sort((a, b) => b.hours - a.hours);
          const ratios = p.months.map(m => cellOf(selected, m, th)); const mx = Math.max(1.2, ...ratios.map(x => (x.ratio !== null && isFinite(x.ratio) ? x.ratio : 0)));
          return <div className="card panel cc-panel" role="complementary" aria-label={`Details for ${shortName(selected.name)}`}>
            <button className="x" aria-label="Close details" onClick={() => setSel(undefined)}>×</button>
            <h3 style={{ margin: 0 }}>{shortName(selected.name)}</h3><div className="muted">{selected.team} · {sel.month}</div>
            <div className="big">{c.band !== "none" && <Sw b={c.band as Exclude<Band, "none">} />}{pctOf(c.ratio)}<span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>{c.hours} of {c.available ?? "?"} h{c.band !== "none" ? " · " + RAG[c.band as Exclude<Band, "none">].label : ""}</span></div>
            <div className="cc-trend" aria-label="Utilization by month">{ratios.map((x, i) => { const m = p.months[i]; const r = x.ratio !== null && isFinite(x.ratio) ? x.ratio : (x.hours > 0 ? mx : 0);
              return <i key={m} className={m === sel.month ? "cur" : ""} title={`${monthLabel(m)} ${pctOf(x.ratio)}`} onClick={() => { setSel({ person: selected.key, month: m }); setFocus(m); }} style={{ height: Math.max(2, Math.min(1, r / mx) * 100) + "%", background: x.band === "none" ? "var(--line)" : RAG[x.band as Exclude<Band, "none">].color }} />; })}</div>
            <table className="mini"><thead><tr><th>Epic</th><th>Hours</th></tr></thead><tbody>
              {list.map(e => <tr key={e.epicId}><td><a href="#" className="lk" onClick={ev => { ev.preventDefault(); setDialog(e.epicId); }}>{e.epicId}</a> · {epicById.get(e.epicId)?.title ?? ""}<div className="muted">{epicById.get(e.epicId)?.state}</div></td><td>{e.hours}</td></tr>)}
              {!list.length && <tr><td colSpan={2} className="muted">No hours this month.</td></tr>}</tbody></table>
          </div>;
        })()}
      </div>
      {tip && <div className="tip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 280), top: tip.y + 14 }}><b>{tip.title}</b>{tip.lines.map((l, i) => <div key={i} className="muted">{l}</div>)}</div>}
      {dialog !== undefined && epicById.get(dialog) && <EpicDialog epic={epicById.get(dialog)!} project={p.project.name} bookings={L.bookings} months={p.months} onClose={() => setDialog(undefined)} />}
    </div>
  );
}
