import * as React from "react";
import { Band } from "../core/aggregate";
import { buildPeople, cellOf, epicsInView, Filters, heatmapCsv, monthSummary, noFilters, NO_TEAM, PersonRow, shortName } from "../core/model";
import { Period, PlanGroup, PlannerSettings, PlanRows } from "../core/types";
import { Loaded } from "../data/loadAll";
import { SavedQuery } from "../data/queries";
import { LoadProgress } from "../data/epics";
import { downloadFile } from "../../../src/shared/ado";
import { EpicDialog } from "./EpicDialog";
import { BANDS, monthLabel, paint, RAG } from "./HeatmapTab";
import { cellText, totalText, Units, UNIT_LABEL } from "../core/units";
import { buildPlan, GROUP_LABEL, nodeTotals, parents, PlanNode } from "../core/plan";
import { TimelineTab } from "./TimelineTab";
import { GanttTab } from "./GanttTab";
import { ViewsMenu } from "./ViewsMenu";
import { decodeView, newViewId, normalizeView, ViewDoc, ViewState } from "../core/views";
import { loadViews, saveViews } from "../data/viewStore";
import { buildLink } from "../data/share";

type View = PlannerSettings["plan"]["view"];
const bandText = (b: Exclude<Band, "none">) => (b === "full" ? "#0b0b0b" : b === "spare" ? "#0d366b" : "#fff");
const Sw = ({ b }: { b: Exclude<Band, "none"> }) => <span className="sw" aria-hidden="true" style={{ background: RAG[b].color, color: bandText(b) }}>{RAG[b].icon}</span>;
const pctOf = (r: number | null) => (r === null ? "–" : !isFinite(r) ? "no capacity" : Math.round(r * 100) + "%");

/** One screen: compact filters with chips, KPI strip with band buttons, a Heatmap / Timeline / Gantt switch, and a detail panel. */
export function CommandCenter(p: {
  project: { id: string; name: string }; settings: PlannerSettings; loaded?: Loaded; months: string[]; busy: boolean; progress?: LoadProgress; error: string;
  queries: SavedQuery[]; queryId: string; onQuery(id: string): void; onReload(force: boolean): void;
  filters: Filters; onFilters(f: Filters): void; period: Period; onPeriod(v: Period): void;
  /** full screen: shown without the page header and tabs (the page decides); a shared link can open it this way */
  full?: boolean; onFull?(on: boolean): void;
  /** a view carried in the address of the page, applied once when the page opens */
  link?: { pv?: string; full: boolean };
}) {
  const L = p.loaded, f = p.filters, th = p.settings.thresholds;
  const [view, setView] = React.useState<View>(p.settings.plan.view);
  const [drawer, setDrawer] = React.useState(false);
  const [hl, setHl] = React.useState<Band | null>(null);
  const [sel, setSel] = React.useState<{ person: string; month: string }>();
  const [dialog, setDialog] = React.useState<number>();
  const [hov, setHov] = React.useState<string>();
  const [units, setUnits] = React.useState<Units>(p.settings.plan.units);
  const [group, setGroup] = React.useState<PlanGroup>(p.settings.plan.groupBy);
  const [rowsMode, setRowsMode] = React.useState<PlanRows>(p.settings.plan.rows);                    // how much of the plan starts open
  const [epicSearch, setEpicSearch] = React.useState("");                                          // Epic keyword search (Gantt)
  const [ganttGroup, setGanttGroup] = React.useState("area");                                    // Epic Gantt grouping
  const [legend, setLegend] = React.useState<string[]>([]);                                       // Gantt key / statistic filters
  const [tiles, setTiles] = React.useState<string[]>(p.settings.plan.ganttTiles);
  const [toggled, setToggled] = React.useState<Set<string>>(new Set());     // rows opened or closed against their default
  const [tip, setTip] = React.useState<{ x: number; y: number; title: string; lines: string[] }>();
  const nowMonth = new Date().toISOString().slice(0, 7);
  const [focus, setFocus] = React.useState(() => (p.months.includes(nowMonth) ? nowMonth : p.months[0]));
  React.useEffect(() => { if (!p.months.includes(focus)) setFocus(p.months.includes(nowMonth) ? nowMonth : p.months[0]); }, [p.months]);   // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { if (drawer) setDrawer(false); else if (sel) setSel(undefined); else if (p.full) p.onFull?.(false); } };
    document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k);
  }, [drawer, sel, p.full]);
  const set = (patch: Partial<Filters>) => p.onFilters({ ...f, ...patch });

  /** the standard view: what the settings say */
  const standard = (): ViewState => ({ view: p.settings.plan.view, group: p.settings.plan.groupBy, units: p.settings.plan.units, rows: p.settings.plan.rows, period: p.settings.period, team: "", query: "", people: "", epics: "",
    states: [], extra: {}, showIdle: true, ganttGroup: "area", legend: [], tiles: p.settings.plan.ganttTiles });
  const snapshot = (): ViewState => ({ view, group, units, rows: rowsMode, period: p.period, team: f.team, query: p.queryId, people: f.search, epics: epicSearch, states: f.states, extra: f.extra, showIdle: f.showIdle, ganttGroup, legend, tiles });
  const applyView = (raw: ViewState) => {
    const v = normalizeView(raw, standard());
    setView(v.view); setGroup(v.group); setUnits(v.units); setRowsMode(v.rows); setToggled(new Set()); setEpicSearch(v.epics); setGanttGroup(v.ganttGroup); setLegend(v.legend); setTiles(v.tiles); setHl(null); setSel(undefined);
    if (v.period) p.onPeriod(v.period);
    p.onFilters({ ...noFilters(), team: v.team, states: v.states, extra: v.extra, search: v.people, showIdle: v.showIdle });
    if (v.query !== p.queryId) p.onQuery(v.query);
  };
  const [doc, setDoc] = React.useState<ViewDoc>({ views: [] });
  const [viewErr, setViewErr] = React.useState("");
  const started = React.useRef(false);
  React.useEffect(() => {                                                                  // my saved views; a shared link wins over my default view
    if (started.current) return; started.current = true;
    const shared = p.link?.pv ? decodeView(p.link.pv, standard()) : undefined;
    loadViews(p.project.id, standard()).then(d => { setDoc(d); const d0 = d.views.find(v => v.id === d.defaultId); if (!shared && d0) applyView(d0.state); }).catch(e => setViewErr("Could not read your saved views: " + (e as Error).message));
    if (shared) applyView(shared);
    if (p.link?.full) p.onFull?.(true);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const keepDoc = (next: ViewDoc) => { const prev = doc; setDoc(next); setViewErr(""); saveViews(p.project.id, next).catch(e => { setDoc(prev); setViewErr("Could not save: " + (e as Error).message); }); };
  const viewsMenu = <ViewsMenu views={doc.views} defaultId={doc.defaultId} error={viewErr}
    onApply={v => applyView(v.state)} onSave={name => keepDoc({ ...doc, views: [...doc.views, { id: newViewId(), name, state: snapshot() }] })}
    onUpdate={id => keepDoc({ ...doc, views: doc.views.map(v => (v.id === id ? { ...v, state: snapshot() } : v)) })}
    onRename={(id, name) => keepDoc({ ...doc, views: doc.views.map(v => (v.id === id ? { ...v, name } : v)) })}
    onDelete={id => keepDoc({ views: doc.views.filter(v => v.id !== id), defaultId: doc.defaultId === id ? undefined : doc.defaultId })}
    onDefault={id => keepDoc({ ...doc, defaultId: id })} onReset={() => applyView(standard())} onLink={() => buildLink(snapshot(), standard())} />;

  const people = React.useMemo(() => (L ? buildPeople(L.bookings, L.epics, L.avail, p.months, f) : []), [L, p.months, f]);
  const summary = React.useMemo(() => monthSummary(people, focus, th), [people, focus, th]);
  const epicById = React.useMemo(() => new Map((L?.epics ?? []).map(e => [e.id, e])), [L]);
  const plan = React.useMemo(() => buildPlan(people, p.months, group, id => epicById.get(id)), [people, p.months, group, epicById]);
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

  const cols = `300px 96px repeat(${p.months.length}, minmax(58px, 1fr))`;
  const defaultOpen = (n: PlanNode) => rowsMode === "all" || (rowsMode === "teams" && group === "team" && n.level === 0);       // by default every row starts closed
  const isOpen = (n: PlanNode) => defaultOpen(n) !== toggled.has(n.key);
  const flip = (key: string) => setToggled(t => { const x = new Set(t); if (x.has(key)) x.delete(key); else x.add(key); return x; });
  const expandAll = () => { setRowsMode("all"); setToggled(new Set()); };
  const collapseAll = () => { setRowsMode("collapsed"); setToggled(new Set()); };
  const bandCell = (n: PlanNode, m: string) => {
    const pp = n.person!, c = cellOf(pp, m, th), v = paint(p.settings.colourMode, c), dim = hl !== null && c.band !== hl;
    const pick = () => { setSel({ person: pp.key, month: m }); setFocus(m); };
    return <div key={m} className={"cell" + (sel?.person === pp.key && sel.month === m ? " sel" : "")} tabIndex={v.label ? 0 : -1} role={v.label ? "button" : undefined}
      aria-label={v.label ? `${shortName(pp.name)}, ${m}: ${c.hours} of ${c.available ?? "?"} hours, ${v.label}` : undefined}
      style={{ background: v.background, color: v.color, opacity: dim ? .18 : 1 }}
      onClick={v.label ? pick : undefined} onKeyDown={e => { if (v.label && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); pick(); } }}
      onPointerEnter={() => setHov(m)} onPointerLeave={() => { setHov(undefined); setTip(undefined); }}
      onPointerMove={v.label ? e => setTip({ x: e.clientX, y: e.clientY, title: `${pctOf(c.ratio)} · ${shortName(pp.name)}`, lines: [`${c.hours} h booked of ${c.available ?? "?"} h available`, `${pp.team} · ${m}`, v.label] }) : undefined}>{cellText(units, c.hours, c.available)}{v.text && <i>{v.text}</i>}</div>;
  };
  const renderNode = (n: PlanNode): React.ReactNode => {
    const open = n.children.length > 0 && isOpen(n), tot = nodeTotals(n), shade = n.level === 0 && n.kind !== "person" ? " grp" : n.kind === "team" ? " sub" : "";
    const pad = { paddingLeft: 6 + n.level * 20 };
    const openEpic = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); if (n.epicId !== undefined) setDialog(n.epicId); };
    let name: React.ReactNode;
    if (n.kind === "person") name = <div className={"cc-s1 cc-person" + (sel?.person === n.person!.key ? " sel" : "")} style={pad}>
      {n.children.length > 0 ? <button className="cc-xp" aria-expanded={open} aria-label={`${open ? "Hide" : "Show"} the Epics of ${shortName(n.label)}`} onClick={() => flip(n.key)}>{open ? "▾" : "▸"}</button> : <span className="cc-xp" />}
      <button className="n cc-nm" title={n.label} onClick={() => setSel({ person: n.person!.key, month: focus })}>{shortName(n.label)}</button>{n.meta && <span className="cc-n">{n.meta}</span>}</div>;
    else if (n.children.length) {
      const over = group === "team" && n.kind === "team" ? monthSummary(n.people!, focus, th).over : 0;
      name = <button className={"cc-team cc-s1" + shade} style={pad} aria-expanded={open} title={n.label} onClick={() => flip(n.key)}><span className={"car" + (open ? "" : " shut")}>▾</span>
        <span className="cc-lab">{n.label}</span><span className="cc-mini">{n.meta}{over > 0 && <span className="cc-flag"><Sw b="over" />{over} over</span>}{n.kind === "epic" && <a href="#" className="lk" title="Open the Epic" onClick={openEpic}>↗</a>}</span></button>;
    } else name = <div className="cc-s1 cc-epic" style={pad}><a href="#" className="lk" title={n.label} onClick={openEpic}>{n.label}</a>{n.meta && <span className="cc-n">{n.meta}</span>}</div>;
    const cells = n.banded ? p.months.map(m => bandCell(n, m)) : p.months.map(m => <div key={m} className={(shade ? "cc-tc" : "cc-ec") + shade}>{cellText(units, n.hours[m] ?? 0, n.avail[m] || null)}</div>);
    return <React.Fragment key={n.key}>{name}<div className={"cc-tt cc-s2" + shade}>{totalText(units, tot.hours, tot.available)}</div>{cells}{open && n.children.map(renderNode)}</React.Fragment>;
  };
  const heat = (
    <div className="cc-scroll"><div className="hm cc-plan" style={{ gridTemplateColumns: cols }}>
      <div className="cc-h cc-s1">{GROUP_LABEL[group].split(" › ").join(" / ")}</div><div className="cc-h cc-s2">Total</div>
      {p.months.map(m => <button key={m} className={"mh" + (m === focus ? " on" : m === hov ? " hov" : "")} title="Use this month for the figures above" onClick={() => setFocus(m)}>{monthLabel(m)}</button>)}
      {plan.map(renderNode)}
    </div></div>
  );

  return (
    <div className={"cc" + (p.full ? " cc-full" : "")}>
      <div className="cc-bar">
        <div className="seg" role="tablist" aria-label="View">{([["heat", "Heatmap"], ["time", "Timeline"], ["gantt", "Epic Gantt"]] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={view === k} className={view === k ? "on" : ""} onClick={() => setView(k)}>{l}</button>)}</div>
        {view === "heat" && <>
          <label className="pill"><span className="k">Group by</span><select aria-label="Group by" value={group} onChange={e => { setGroup(e.target.value as PlanGroup); setToggled(new Set()); }}>{(Object.keys(GROUP_LABEL) as PlanGroup[]).map(g => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}</select></label>
          <div className="seg" role="group" aria-label="Units">{(Object.keys(UNIT_LABEL) as Units[]).map(u => <button key={u} aria-pressed={units === u} className={units === u ? "on" : ""} onClick={() => setUnits(u)}>{UNIT_LABEL[u]}</button>)}</div>
          <button className="pill icon" title="Expand all" aria-label="Expand all" onClick={expandAll}>⊞</button><button className="pill icon" title="Collapse all" aria-label="Collapse all" onClick={collapseAll}>⊟</button></>}
        <span className="grow" />
        {viewsMenu}
        {p.onFull && view !== "time" && <button className="pill icon" aria-pressed={!!p.full} title={p.full ? "Exit full screen (Esc)" : "Full screen"} aria-label={p.full ? "Exit full screen" : "Full screen"} onClick={() => p.onFull!(!p.full)}>{p.full ? "🗗" : "⛶"}</button>}
        <button className="pill icon" disabled={p.busy} onClick={() => p.onReload(false)} aria-label="Refresh" title={`Refresh · ${L.epics.length} Epics read · refreshed ${new Date(L.at).toLocaleTimeString()} · ${(L.load.ms / 1000).toFixed(1)} s`}>{p.busy ? "…" : "⟳"}</button>
        <button className="pill icon" disabled={!people.length} onClick={exportCsv} aria-label="Export CSV" title="Export CSV">⭳</button>
      </div>
      <div className="cc-bar cc-filters">
        <label className="pill"><span className="k">Period</span><select value={p.period.kind} onChange={e => p.onPeriod({ ...p.period, kind: e.target.value as Period["kind"] })}>
          <option value="year">This calendar year</option><option value="quarter">This quarter</option><option value="last12">Last 12 months</option><option value="next12">Next 12 months</option><option value="custom">Custom…</option></select></label>
        {p.period.kind === "custom" && <label className="pill"><span className="k">From–to</span>
          <input aria-label="From month" value={p.period.from ?? ""} placeholder="YYYY-MM" style={{ width: 62 }} onChange={e => p.onPeriod({ ...p.period, from: e.target.value })} />–
          <input aria-label="To month" value={p.period.to ?? ""} placeholder="YYYY-MM" style={{ width: 62 }} onChange={e => p.onPeriod({ ...p.period, to: e.target.value })} /></label>}
        <label className="pill"><span className="k">Team</span><select value={f.team} onChange={e => set({ team: e.target.value })}><option value="">All teams</option>{teams.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
        <label className="pill"><span className="k">Epics</span><select value={p.queryId} onChange={e => p.onQuery(e.target.value)}><option value="">All {p.settings.workItemType}s</option>{p.queries.map(q => <option key={q.id} value={q.id}>Query: {q.path}</option>)}</select></label>
        <label className="pill search"><span className="k">⌕</span>{view === "gantt"
          ? <input type="search" aria-label="Find an Epic" placeholder="Find an Epic (id or keyword)…" value={epicSearch} onChange={e => setEpicSearch(e.target.value)} />
          : <input type="search" aria-label="Find a person" placeholder="Find a person…" value={f.search} onChange={e => set({ search: e.target.value })} />}</label>
        <span className="cc-anchor"><button className="pill" aria-expanded={drawer} onClick={() => setDrawer(!drawer)}>⚙ Filters{extraCount ? ` (${extraCount})` : ""}</button>
          {drawer && <div className="cc-drawer" role="dialog" aria-label="More filters">
            <h4>{p.settings.workItemType} state</h4><div className="g">{states.map(s => <label key={s}><input type="checkbox" checked={f.states.includes(s)} onChange={e => set({ states: e.target.checked ? [...f.states, s] : f.states.filter(x => x !== s) })} />{s}</label>)}</div>
            {p.settings.extraFilterFields.map(k => <React.Fragment key={k}><h4>{k.split(".").pop()}</h4><div className="g">{extraValues(k).map(v => { const cur = f.extra[k] ?? []; return <label key={v}><input type="checkbox" checked={cur.includes(v)} onChange={e => set({ extra: { ...f.extra, [k]: e.target.checked ? [...cur, v] : cur.filter(x => x !== v) } })} />{v || "(empty)"}</label>; })}</div></React.Fragment>)}
            <h4>People</h4><div className="g"><label><input type="checkbox" checked={f.showIdle} onChange={e => set({ showIdle: e.target.checked })} />Show people without hours</label></div>
          </div>}</span>
      </div>
      {chips.length > 0 && <div className="cc-chips">{chips.map((c, i) => <span key={i} className="cchip">{c.label}<button aria-label={`Remove filter ${c.label}`} onClick={c.clear}>×</button></span>)}{chips.length > 1 && <button className="lk" onClick={clearAll}>Clear all</button>}</div>}
      {p.error && <div className="err" role="alert">{p.error}</div>}
      {L.stats.unscheduled + L.stats.errored > 0 && <div className="muted" style={{ marginBottom: 6 }}>{L.stats.unscheduled} row(s) have no monthly hours and {L.stats.errored} have a scheduling error, so they are not counted (see Diagnostics).</div>}

      {view !== "gantt" && <div className="cc-strip">
        <div className="tile"><div className="l">Utilization · {monthLabel(focus)}</div><div className="v">{pctOf(summary.utilization)}</div><div className="d">{summary.hours} of {summary.available} h</div></div>
        <div className="tile"><div className="l">Over capacity</div><div className="v">{summary.over > 0 && <Sw b="over" />}{summary.over}</div><div className="d">people above {th.full}%</div></div>
        <div className="tile"><div className="l">Free capacity</div><div className="v">{summary.free.toLocaleString()} h</div><div className="d">not yet booked · {summary.epics} of {inView} Epics</div></div>
        <div className="tile"><div className="l">{monthLabel(focus)}: how the {people.length} people spread across the bands</div>
          <div className="cc-bands">{BANDS.map(b => <button key={b} className={"band" + (hl === b ? " on" : hl ? " dim" : "")} aria-pressed={hl === b} onClick={() => setHl(hl === b ? null : b)}><Sw b={b} /><b>{summary.counts[b]}</b><span>{RAG[b].label}</span></button>)}</div></div>
      </div>}

      <div className={"cc-main" + (selected && sel ? " withpanel" : "")}>
        <div className="card" style={{ minWidth: 0 }}>
          {view === "heat" ? (!people.length ? <div className="muted">No people match the filters.</div> : <>
            {heat}
            <div className="legend">{BANDS.map(b => <span key={b} className="lg"><Sw b={b} />{RAG[b].label} ({{ spare: `under ${th.spare}%`, healthy: `${th.spare}–${th.healthy}%`, full: `${th.healthy}–${th.full}%`, over: `above ${th.full}%` }[b]})</span>)}
              <span className="lg"><span className="sw" style={{ background: "repeating-linear-gradient(45deg, var(--line) 0 4px, transparent 4px 8px)", color: "var(--fg2)" }}>?</span>Hours but no capacity entered</span></div></>)
            : view === "time" ? <TimelineTab project={p.project} settings={p.settings} loaded={L} months={p.months} filters={f} onPerson={key => setSel({ person: key, month: focus })} />
            : <GanttTab project={p.project} settings={p.settings} loaded={L} months={p.months} filters={f} search={epicSearch} legend={legend} onLegend={setLegend} tiles={tiles} onTiles={setTiles} group={ganttGroup} onGroup={setGanttGroup} />}
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
