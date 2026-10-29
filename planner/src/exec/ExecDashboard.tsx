import * as React from "react";
import "./exec.css";
import { IconExitFullScreen, IconFullScreen, IconMap, IconRefresh, IconReport, IconRoadmap, IconSearch } from "../../../src/shared/icons";
import { ago } from "./ago";
import { fmtDate } from "../core/dates";
import { buildExec, dayText, dimFields, dimLabel, withSource } from "../core/executive";
import { catalog, calcKey, formatCell, runQuery } from "../core/execQuery";
import { monthsOfPeriod } from "../core/period";
import { ExecLayout, PlannerSettings } from "../core/types";
import { decodeJson, encodeJson, newViewId } from "../core/views";
import { LoadProgress } from "../data/epics";
import { Loaded } from "../data/loadAll";
import { SavedQuery } from "../data/queries";
import { ExecView, ExecViewDoc, ExecViewState, loadExecViews, normalizeExecView, saveExecViews } from "../data/execViewStore";
import { linkFor } from "../data/share";
import { EpicDialog } from "../hub/EpicDialog";
import { ViewsMenu } from "../hub/ViewsMenu";
import { ExtraCol, LP, MapLayout, ReportLayout, RoadmapLayout } from "./layouts";
import { buildItems, chipsOf, emptyXF, isEmpty, Item, pass, XF } from "./model";
import { Drawer, motionOk } from "./parts";
import { makePeriod, periodLabel, periodState } from "../core/execPeriod";
import { useEpicHistory } from "../hub/HistoryTimeline";

const LAYOUTS: { id: ExecLayout; label: string; icon: React.ReactNode }[] = [{ id: "report", label: "Report", icon: <IconReport /> }, { id: "map", label: "Portfolio map", icon: <IconMap /> }, { id: "roadmap", label: "Roadmap", icon: <IconRoadmap /> }];
const strip = (f: XF): XF => ({ ...f, saved: undefined, savedName: undefined });

/** The Executive Dashboard: three layouts of the same Epics, shared filters and search, and a detail panel. */
export function ExecDashboard(p: {
  project: { id: string; name: string }; settings: PlannerSettings; loaded?: Loaded; busy: boolean; progress?: LoadProgress; error: string; onReload(force: boolean): void;
  queries?: SavedQuery[]; queryId?: string; onQuery?(id: string): void;
  full?: boolean; onFull?(on: boolean): void; link?: { pv?: string; full: boolean };
}) {
  const L = p.loaded, x = p.settings.executive;
  const day = (t?: number) => (t === undefined ? "–" : p.settings.dateFormat ? fmtDate(p.settings, new Date(t).toISOString().slice(0, 10)) : dayText(t));      // the standard look until the administrator chooses a format
  const [layout, setLayout] = React.useState<ExecLayout>(x.layout);
  const defaultPeriod = React.useMemo(() => (x.periodDefault ? makePeriod(x.periodDefault, x.periodBasis, false, new Date()) : undefined), [x.periodDefault, x.periodBasis]);
  const [f, setF] = React.useState<XF>(() => ({ ...emptyXF(), period: defaultPeriod }));
  const [savedId, setSavedId] = React.useState("");
  // which status the dashboard shows: the owner's RAG, the data, or the variance between them (the switch needs a declared status field and a mode that keeps the data)
  const canSwitch = !!x.declaredField && x.statusSource !== "rag", defaultView: "rag" | "data" = x.declaredField && x.statusSource !== "data" ? "rag" : "data";
  const [showDelivery, setShowDelivery] = React.useState(true);                  // the delivery performance card can be folded away; kept in saved views
  const [viewPick, setView] = React.useState<"rag" | "data" | "var" | "">("");
  const view: "rag" | "data" | "var" = canSwitch ? (viewPick || defaultView) : defaultView;
  const density = "compact" as const;                // one compact spacing for everyone
  const searchRef = React.useRef<HTMLInputElement>(null);
  const [sel, setSel] = React.useState<number>();
  const [dialog, setDialog] = React.useState<number>();
  const fields = dimFields(p.settings);
  const goLiveField = x.goLiveField || p.settings.epicTargetField, historyOn = !!L?.history && p.settings.history.enabled;
  const now = new Date(), today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  const built = React.useMemo(() => (L ? buildExec({ epics: L.epics, gridDone: L.gridDone, bookings: L.bookings, avail: L.avail, settings: p.settings, stageSince: L.stageSince, history: L.history?.[goLiveField] }) : undefined), [L, p.settings]);
  const viewRows = React.useMemo(() => (built ? built.rows.map(r => withSource(r, view === "rag" ? (x.statusSource === "rag" ? "rag" : "rag-check") : view === "data" || view === "var" ? "data" : "data")) : []), [built, view, x.statusSource]);
  const all = React.useMemo(() => (L && built ? buildItems(viewRows, L, p.settings) : []), [L, built, viewRows, p.settings]);
  const input = React.useMemo(() => (L && built ? { settings: p.settings, exec: viewRows, bookings: L.bookings, avail: L.avail, gridDone: L.gridDone } : undefined), [L, built, p.settings]);

  // saved filters: the named Epic queries of the settings, run on the current data
  const saved = x.queries.filter(q => q.name.trim() && q.show === "epics");
  const savedRun = React.useMemo(() => { const q = saved.find(y => y.id === savedId); if (!q || !input) return undefined; return { ids: runQuery(q, input).rows.map(r => r.epicId!), name: q.name }; }, [savedId, input, x.queries]);   // eslint-disable-line react-hooks/exhaustive-deps
  const fx: XF = { ...f, saved: savedRun?.ids, savedName: savedRun?.name };
  const change = (n: XF) => { setF(strip(n)); if (fx.saved && !n.saved) setSavedId(""); };

  // calculated fields as extra columns of the table
  const extra: ExtraCol[] = React.useMemo(() => {
    const cf = x.formulas.filter(c => c.show === "epics" && c.name.trim());
    if (!cf.length || !input) return [];
    const res = runQuery({ id: "_calc", name: "", show: "epics", month: "current", conditions: [], columns: cf.map(calcKey) }, input), defs = catalog("epics", p.settings);
    const byId = new Map(res.rows.map(r => [r.epicId, r.values]));
    return cf.map(c => ({ key: calcKey(c), label: c.name, get: (i: Item) => formatCell(defs.find(d => d.key === calcKey(c)), byId.get(i.id)?.[calcKey(c)]) }));
  }, [x.formulas, input, p.settings]);

  const items = React.useMemo(() => all.filter(i => pass(i, fx)), [all, f, savedRun]);   // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = all.find(i => i.id === sel);
  const eh = useEpicHistory(chosen?.id, goLiveField, chosen?.hist, historyOn);                    // one Epic's history, read when its panel opens and the history of all Epics is not on
  const lp: LP = { all, items, f: fx, setF: change, fields, settings: p.settings, open: i => setSel(i.id), day, extra, today, historyOn, snaps: view === defaultView ? L?.snapshots : undefined, view, canSwitch, deliveredAt: L?.deliveredAt, showDelivery, onDelivery: setShowDelivery };

  // my saved views and a shared link
  const snapshot = (): ExecViewState => ({ layout, density, status: f.status, state: f.state, team: f.team, quarter: f.quarter, moved: f.moved, decl: f.decl, cell: f.cell, stage: f.stage, chart: f.chart, period: f.period, delivery: showDelivery, view: canSwitch ? view : "", dims: f.dims, text: f.text, savedId });
  const apply = (raw: unknown) => { const v = normalizeExecView(raw, x.layout); setLayout(v.layout); setF({ ...emptyXF(), status: v.status, state: v.state, team: v.team, quarter: v.quarter, moved: v.moved, decl: v.decl, cell: v.cell, stage: v.stage, chart: v.chart, period: v.period, dims: v.dims, text: v.text }); setShowDelivery(v.delivery); setView(v.view); setSavedId(v.savedId); setSel(undefined); };
  const [doc, setDoc] = React.useState<ExecViewDoc>({ views: [] }), [viewErr, setViewErr] = React.useState(""), started = React.useRef(false);
  React.useEffect(() => {
    if (started.current) return; started.current = true;
    const shared = p.link?.pv ? decodeJson(p.link.pv) : undefined;
    loadExecViews(p.project.id, x.layout).then(d => { setDoc(d); const d0 = d.views.find(v => v.id === d.defaultId); if (!shared && d0) apply(d0.state); }).catch(e => setViewErr("Could not read your saved views: " + (e as Error).message));
    if (shared) apply(shared);
    if (p.link?.full) p.onFull?.(true);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const keep = (next: ExecViewDoc) => { const prev = doc; setDoc(next); setViewErr(""); saveExecViews(p.project.id, next).catch(e => { setDoc(prev); setViewErr("Could not save: " + (e as Error).message); }); };
  const sub = (v: ExecView) => LAYOUTS.find(l => l.id === v.state.layout)?.label;
  React.useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement?.tagName ?? ""))) { e.preventDefault(); searchRef.current?.focus(); } if (e.key === "Escape" && !sel && p.full) p.onFull?.(false); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [sel, p.full]);   // eslint-disable-line react-hooks/exhaustive-deps

  // subtle motion: the cards and charts ease in when the dashboard appears or the layout changes; a filter change eases the view in
  const [phase, setPhase] = React.useState<"" | "enter" | "upd">(""), seenF = React.useRef<string | undefined>(undefined), fKey = JSON.stringify(f);
  React.useEffect(() => { if (!L || !motionOk()) return; setPhase("enter"); const t = setTimeout(() => setPhase(""), 1700); return () => clearTimeout(t); }, [!!L, layout, view]);   // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { const first = seenF.current === undefined; seenF.current = fKey; if (first || !L || !motionOk()) return; setPhase("upd"); const t = setTimeout(() => setPhase(""), 260); return () => clearTimeout(t); }, [fKey]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!L && p.busy) return <div className="ex ex-loading" aria-busy="true"><div className="ex-kpis">{Array.from({ length: 6 }, (_, k) => <div key={k} className="ex-sk" style={{ height: 110 }} />)}</div><div className="ex-sk" style={{ height: 300, marginTop: 14 }} />{p.progress && <div className="muted" style={{ marginTop: 8 }}>{p.progress.phase === "history" ? "Reading the go-live history…" : p.progress.phase === "query" ? "Finding the Epics…" : p.progress.phase === "check" ? `Checking for changes (${p.progress.done}/${p.progress.total})` : `Reading Epics (${p.progress.done}/${p.progress.total})`}</div>}</div>;
  if (!L) return (
    <div>
      <div className="toolbar"><button className="btn primary" disabled={p.busy} onClick={() => p.onReload(false)}><IconRefresh /> {p.busy ? "Loading…" : "Load the dashboard"}</button>
        {p.progress && <span className="muted">{p.progress.phase === "history" ? "Reading the go-live history…" : p.progress.phase === "query" ? "Finding the Epics…" : p.progress.phase === "check" ? `Checking for changes (${p.progress.done}/${p.progress.total})` : `Reading Epics (${p.progress.done}/${p.progress.total})`}</span>}</div>
      {p.error && <div className="err" role="alert">{p.error}</div>}
    </div>
  );
  const chips = chipsOf(fx, change, x.periodField ? dimLabel(x.periodField) : undefined);
  return (
    <div className={"ex" + (phase ? " " + phase : "") + (p.full ? " ex-full" : "") + (density === "compact" ? " dense" : "")}>
      <div className="ex-bar">
        <div className="ex-brand"><div className="logo" aria-hidden="true">E</div><div><b>Executive Dashboard</b><span className="live"><i className="pulse" />{p.busy ? "Refreshing…" : "Live"} · refreshed {ago(Date.parse(L.at))} · {L.epics.length} Epics</span></div></div>
        <div className="ex-seg" role="tablist" aria-label="Layout" style={{ ["--i" as string]: LAYOUTS.findIndex(l => l.id === layout) }}>{LAYOUTS.map(l => <button key={l.id} role="tab" aria-selected={layout === l.id} className={layout === l.id ? "on" : ""} onClick={() => setLayout(l.id)}>{l.icon} {l.label}</button>)}</div>
        {canSwitch && <div className="ex-seg" role="tablist" aria-label="Status view" title="Which status the dashboard shows" style={{ ["--i" as string]: ["rag", "data", "var"].indexOf(view) }}>{([["rag", "Owner’s RAG"], ["data", "Data"], ["var", "Variance"]] as const).map(([id, l]) => <button key={id} role="tab" aria-selected={view === id} className={view === id ? "on" : ""} onClick={() => { setView(id); setF({ ...f, cell: [] }); }}>{l}</button>)}</div>}
        <label className="ex-search"><IconSearch /><input ref={searchRef} type="search" aria-label="Search the Epics" placeholder="Search anything: title, id, state, category, people, reason, date…" value={f.text} onChange={e => setF({ ...f, text: e.target.value })} /><span className="kbd" aria-hidden="true">/</span></label>
        {saved.length > 0 && <label className="ex-chip sel"><span className="k">Saved filter</span><select aria-label="Saved filter" value={savedId} onChange={e => setSavedId(e.target.value)}><option value="">None</option>{saved.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}</select></label>}
        {p.queries && p.onQuery && <label className="ex-chip sel"><span className="k">Epics from</span><select aria-label="Epics from" value={p.queryId ?? ""} onChange={e => p.onQuery!(e.target.value)}><option value="">All {p.settings.workItemType}s</option>{p.queries.map(q => <option key={q.id} value={q.id}>Query: {q.path}</option>)}</select></label>}
        <div className="ex-actions">
        <ViewsMenu views={doc.views.map(v => ({ id: v.id, name: v.name, sub: sub(v) }))} defaultId={doc.defaultId} error={viewErr}
          onApply={id => { const v = doc.views.find(y => y.id === id); if (v) apply(v.state); }} onSave={name => keep({ ...doc, views: [...doc.views, { id: newViewId(), name, state: snapshot() }] })}
          onUpdate={id => keep({ ...doc, views: doc.views.map(v => (v.id === id ? { ...v, state: snapshot() } : v)) })} onRename={(id, name) => keep({ ...doc, views: doc.views.map(v => (v.id === id ? { ...v, name } : v)) })}
          onDelete={id => keep({ views: doc.views.filter(v => v.id !== id), defaultId: doc.defaultId === id ? undefined : doc.defaultId })} onDefault={id => keep({ ...doc, defaultId: id })}
          onReset={() => { setF({ ...emptyXF(), chart: f.chart, period: defaultPeriod }); setSavedId(""); setLayout(x.layout); }} onLink={() => linkFor(encodeJson(snapshot()))} />
        {p.onFull && <button className="pill icon" aria-pressed={!!p.full} title={p.full ? "Exit full screen (Esc)" : "Full screen"} aria-label={p.full ? "Exit full screen" : "Full screen"} onClick={() => p.onFull!(!p.full)}>{p.full ? <IconExitFullScreen /> : <IconFullScreen />}</button>}
        <button className="pill icon" disabled={p.busy} onClick={() => p.onReload(false)} aria-label="Refresh" title={`Refresh · ${L.epics.length} Epics`}>{p.busy ? "…" : <IconRefresh />}</button>
        </div>
      </div>
      {(chips.length > 0 || !isEmpty(fx)) && <div className="ex-chips">{chips.map((c, i) => <span key={i} className="ex-fchip">{c.label}<button aria-label={`Remove filter ${c.label}`} onClick={c.clear}>×</button></span>)}{chips.length > 1 && <button className="lk" onClick={() => { setF(emptyXF()); setSavedId(""); }}>Clear all</button>}<span className="muted">{items.length} of {all.length} Epics</span></div>}
      {canSwitch && <div className="ex-note" role="status"><span className="tag">{view === "rag" ? "Showing: Owner’s RAG" : view === "data" ? "Showing: Data" : "Showing: Variance"}</span> {view === "rag" ? `The status is what owners entered; ${all.filter(i => !i.r.declared && i.r.dataStatus !== "done" && i.r.dataStatus !== "idle").length} Epics have no RAG, so they show the data status. “Data check” says where the data disagrees.` : view === "data" ? "The status is worked out from dates and progress. The owner’s RAG is shown beside it." : "Owner’s RAG against the data. The Portfolio map and Roadmap show the data status here; on the map a coloured edge is the owner’s RAG."}</div>}
      {p.error && <div className="err" role="alert">{p.error}</div>}
      {(() => {                                    // data notes: one short line, counted for the Epics shown (the filters apply), details on click
        const bad = x.declaredField ? items.filter(i => i.r.declaredText && !i.r.declared) : [], vals = Array.from(new Set(bad.map(i => i.r.declaredText!))), noDate = items.filter(i => i.r.goLive === undefined).length, noProg = items.filter(i => i.r.pct === undefined).length;
        const dated = f.period ? all.filter(i => pass(i, f, "period") && periodState(f.period!, i.dt) === "undated").length : 0;
        const noMoves = historyOn && L.history && !all.some(i => i.sum.moves > 0);
        const notes: { short: string; long: React.ReactNode }[] = [];
        if (bad.length) notes.push({ short: `${bad.length} with a RAG value that is not Red, Amber or Green`, long: <>{bad.length} Epic(s) have a value in the declared status field that is not read as green, amber or red ({vals.slice(0, 6).join(", ")}{vals.length > 6 ? ", …" : ""}); their status comes from the data. In Settings › Executive Dashboard › Declared status, say which values mean what, or list the ones that mean “no RAG yet”.</> });
        if (dated && !f.period!.undated) notes.push({ short: `${dated} not shown: no date for the period`, long: <>{dated} Epic(s) have no date to judge the period by (“{periodLabel(f.period!, x.periodField ? dimLabel(x.periodField) : undefined)}”), so they are left out. Tick “Include Epics without a date” in the Period filter to show them.</> });
        if (noDate) notes.push({ short: `${noDate} without a go-live date`, long: <>{noDate} Epic(s) have no go-live date in “{dimLabel(goLiveField)}”, so they cannot be assessed against a date.</> });
        if (noProg) notes.push({ short: `${noProg} without a progress value`, long: <>{noProg} Epic(s) have no progress value{x.progress.length ? "" : " (no progress source is set up yet: Settings › Executive Dashboard › Progress)"}; they are assessed on dates only.</> });
        if (noMoves) notes.push({ short: "no go-live changes recorded", long: <>No go-live date change is recorded in the field “{dimLabel(goLiveField)}” that this dashboard reads{p.settings.epicTargetField && goLiveField !== p.settings.epicTargetField ? `, while the Epic Gantt reads “${dimLabel(p.settings.epicTargetField)}”` : ""}. Check Settings › Executive Dashboard › Go-live date field.</> });
        return notes.length ? <details className="ex-notes"><summary><span aria-hidden="true">ⓘ</span> Data notes for the {items.length} Epics shown: {notes.map(n => n.short).join(" · ")}</summary><ul>{notes.map((n, k) => <li key={k}>{n.long}</li>)}</ul></details> : null;
      })()}
      {L.historyError && <div className="err" role="alert">The go-live history could not be read: {L.historyError}</div>}
      {layout === "report" ? <ReportLayout lp={lp} /> : layout === "map" ? <MapLayout lp={lp} /> : <RoadmapLayout lp={lp} />}
      <Drawer item={chosen} onClose={() => setSel(undefined)} onDetails={id => setDialog(id)} day={day} dims={fields} res={x.resources} hist={eh.hist} histState={eh.state} histError={eh.error} />
      {dialog !== undefined && L.epics.find(e => e.id === dialog) && <EpicDialog history={{ field: goLiveField, hist: all.find(i => i.id === dialog)?.hist, allRead: historyOn }} settings={p.settings} epic={L.epics.find(e => e.id === dialog)!} project={p.project.name} bookings={L.bookings} months={monthsOfPeriod({ kind: "year" })} onClose={() => setDialog(undefined)} />}
    </div>
  );
}
