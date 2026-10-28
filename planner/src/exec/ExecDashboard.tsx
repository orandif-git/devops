import * as React from "react";
import "./exec.css";
import { IconExitFullScreen, IconFullScreen, IconMap, IconRefresh, IconReport, IconRoadmap, IconSearch } from "../../../src/shared/icons";
import { fmtDate } from "../core/dates";
import { buildExec, dayText, dimFields } from "../core/executive";
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
import { Drawer } from "./parts";
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
  const [f, setF] = React.useState<XF>(emptyXF());
  const [savedId, setSavedId] = React.useState("");
  const [sel, setSel] = React.useState<number>();
  const [dialog, setDialog] = React.useState<number>();
  const fields = dimFields(p.settings);
  const goLiveField = x.goLiveField || p.settings.epicTargetField, historyOn = !!L?.history && p.settings.history.enabled;
  const now = new Date(), today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  const built = React.useMemo(() => (L ? buildExec({ epics: L.epics, gridDone: L.gridDone, bookings: L.bookings, avail: L.avail, settings: p.settings, history: L.history?.[goLiveField] }) : undefined), [L, p.settings]);
  const all = React.useMemo(() => (L && built ? buildItems(built.rows, L, p.settings) : []), [L, built, p.settings]);
  const input = React.useMemo(() => (L && built ? { settings: p.settings, exec: built.rows, bookings: L.bookings, avail: L.avail, gridDone: L.gridDone } : undefined), [L, built, p.settings]);

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
  const lp: LP = { all, items, f: fx, setF: change, fields, settings: p.settings, open: i => setSel(i.id), day, extra, today, historyOn };

  // my saved views and a shared link
  const snapshot = (): ExecViewState => ({ layout, status: f.status, state: f.state, team: f.team, quarter: f.quarter, moved: f.moved, dims: f.dims, text: f.text, savedId });
  const apply = (raw: unknown) => { const v = normalizeExecView(raw, x.layout); setLayout(v.layout); setF({ ...emptyXF(), status: v.status, state: v.state, team: v.team, quarter: v.quarter, moved: v.moved, dims: v.dims, text: v.text }); setSavedId(v.savedId); setSel(undefined); };
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
  React.useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape" && !sel && p.full) p.onFull?.(false); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [sel, p.full]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!L) return (
    <div>
      <div className="toolbar"><button className="btn primary" disabled={p.busy} onClick={() => p.onReload(false)}><IconRefresh /> {p.busy ? "Loading…" : "Load the dashboard"}</button>
        {p.progress && <span className="muted">{p.progress.phase === "history" ? "Reading the go-live history…" : p.progress.phase === "query" ? "Finding the Epics…" : p.progress.phase === "check" ? `Checking for changes (${p.progress.done}/${p.progress.total})` : `Reading Epics (${p.progress.done}/${p.progress.total})`}</span>}</div>
      {p.error && <div className="err" role="alert">{p.error}</div>}
    </div>
  );
  const chips = chipsOf(fx, change);
  return (
    <div className={"ex" + (p.full ? " ex-full" : "")}>
      <div className="ex-bar">
        <div className="ex-seg" role="tablist" aria-label="Layout">{LAYOUTS.map(l => <button key={l.id} role="tab" aria-selected={layout === l.id} className={layout === l.id ? "on" : ""} onClick={() => setLayout(l.id)}>{l.icon} {l.label}</button>)}</div>
        <label className="ex-search"><IconSearch /><input type="search" aria-label="Search the Epics" placeholder="Search anything: title, id, state, category, people, reason, date…" value={f.text} onChange={e => setF({ ...f, text: e.target.value })} /></label>
        {saved.length > 0 && <label className="ex-chip sel"><span className="k">Saved filter</span><select aria-label="Saved filter" value={savedId} onChange={e => setSavedId(e.target.value)}><option value="">None</option>{saved.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}</select></label>}
        {p.queries && p.onQuery && <label className="ex-chip sel"><span className="k">Epics from</span><select aria-label="Epics from" value={p.queryId ?? ""} onChange={e => p.onQuery!(e.target.value)}><option value="">All {p.settings.workItemType}s</option>{p.queries.map(q => <option key={q.id} value={q.id}>Query: {q.path}</option>)}</select></label>}
        <span className="grow" />
        <ViewsMenu views={doc.views.map(v => ({ id: v.id, name: v.name, sub: sub(v) }))} defaultId={doc.defaultId} error={viewErr}
          onApply={id => { const v = doc.views.find(y => y.id === id); if (v) apply(v.state); }} onSave={name => keep({ ...doc, views: [...doc.views, { id: newViewId(), name, state: snapshot() }] })}
          onUpdate={id => keep({ ...doc, views: doc.views.map(v => (v.id === id ? { ...v, state: snapshot() } : v)) })} onRename={(id, name) => keep({ ...doc, views: doc.views.map(v => (v.id === id ? { ...v, name } : v)) })}
          onDelete={id => keep({ views: doc.views.filter(v => v.id !== id), defaultId: doc.defaultId === id ? undefined : doc.defaultId })} onDefault={id => keep({ ...doc, defaultId: id })}
          onReset={() => { setF(emptyXF()); setSavedId(""); setLayout(x.layout); }} onLink={() => linkFor(encodeJson(snapshot()))} />
        {p.onFull && <button className="pill icon" aria-pressed={!!p.full} title={p.full ? "Exit full screen (Esc)" : "Full screen"} aria-label={p.full ? "Exit full screen" : "Full screen"} onClick={() => p.onFull!(!p.full)}>{p.full ? <IconExitFullScreen /> : <IconFullScreen />}</button>}
        <button className="pill icon" disabled={p.busy} onClick={() => p.onReload(false)} aria-label="Refresh" title={`Refresh · ${L.epics.length} Epics`}>{p.busy ? "…" : <IconRefresh />}</button>
      </div>
      {(chips.length > 0 || !isEmpty(fx)) && <div className="ex-chips">{chips.map((c, i) => <span key={i} className="ex-fchip">{c.label}<button aria-label={`Remove filter ${c.label}`} onClick={c.clear}>×</button></span>)}{chips.length > 1 && <button className="lk" onClick={() => { setF(emptyXF()); setSavedId(""); }}>Clear all</button>}<span className="muted">{items.length} of {all.length} Epics</span></div>}
      {p.error && <div className="err" role="alert">{p.error}</div>}
      {L.historyError && <div className="err" role="alert">The go-live history could not be read: {L.historyError}</div>}
      {built && (built.noGoLive > 0 || built.noProgress > 0) && <div className="muted" style={{ marginBottom: 6 }}>{built.noGoLive} Epic(s) have no go-live date{built.noProgress ? `; ${built.noProgress} have no progress value${x.progress.length ? "" : " (no progress source is set up yet)"}; they are assessed on dates only` : ""}.</div>}
      {layout === "report" ? <ReportLayout lp={lp} /> : layout === "map" ? <MapLayout lp={lp} /> : <RoadmapLayout lp={lp} />}
      <Drawer item={chosen} onClose={() => setSel(undefined)} onDetails={id => setDialog(id)} day={day} dims={fields} hist={eh.hist} histState={eh.state} histError={eh.error} />
      {dialog !== undefined && L.epics.find(e => e.id === dialog) && <EpicDialog history={{ field: goLiveField, hist: all.find(i => i.id === dialog)?.hist, allRead: historyOn }} settings={p.settings} epic={L.epics.find(e => e.id === dialog)!} project={p.project.name} bookings={L.bookings} months={monthsOfPeriod({ kind: "year" })} onClose={() => setDialog(undefined)} />}
    </div>
  );
}
