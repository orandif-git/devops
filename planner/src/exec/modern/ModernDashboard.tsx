import * as React from "react";
import "./modern.css";
import { IconExitFullScreen, IconFullScreen, IconMap, IconRefresh, IconReport, IconRoadmap, IconSearch } from "../../../../src/shared/icons";
import { ago } from "../ago";
import { dimLabel } from "../../core/executive";
import type { Hist } from "../../core/history";
import type { Loaded } from "../../data/loadAll";
import { chipsOf, emptyXF, isEmpty, Item } from "../model";
import { PeriodSlicer, Slicer } from "../parts";
import { periodHidden } from "../layouts";
import type { LP } from "../layouts";
import { filterGroups, MorePanel } from "./filters";
import { Inspector } from "./Inspector";
import { EpicsPage, InsightsPage, OverviewPage, PipelinePage, Tab } from "./pages";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [{ id: "overview", label: "Overview", icon: <IconReport /> }, { id: "pipeline", label: "Pipeline", icon: <IconRoadmap /> }, { id: "epics", label: "Epics", icon: <IconMap /> }, { id: "insights", label: "Insights", icon: <IconReport /> }];
const TITLES: Record<Tab, [string, string]> = {
  overview: ["Executive overview", "Where the portfolio stands today and where you need to step in"],
  pipeline: ["Delivery pipeline", "Where Epics are in delivery and where work piles up"],
  epics: ["Epics", "Every Epic, sortable, with the details one click away"],
  insights: ["Insights", "How the portfolio is performing"],
};

export interface ModernProps {
  lp: LP; L: Loaded; project: string; busy: boolean; error: string; full?: boolean; onFull?(on: boolean): void; onReload(force: boolean): void;
  searchRef: React.RefObject<HTMLInputElement>;
  /** the saved-views menu, the saved filter and the query choice, built by the dashboard and shared with the classic design */
  views: React.ReactNode; queryControls: React.ReactNode; designSwitch: React.ReactNode; notes: React.ReactNode; statusNote: React.ReactNode;
  onView(v: "rag" | "data" | "var"): void;
  chosen?: Item; onClose(): void; onDetails(id: number): void; onOpenEpic(id: number): void; hist?: Hist; histState?: "ok" | "loading" | "error" | "none"; histError?: string;
  onReset(): void; historyError?: string;
}

/** The modern design of the Executive Dashboard: a toolbar and a filter bar on top, four pages (Overview, Pipeline, Epics, Insights) and an Epic panel on the right. It reads the same data and has the same filters as the classic design. */
export function ModernDashboard(p: ModernProps) {
  const { lp, L } = p, { f, setF } = lp;
  const [tab, setTab] = React.useState<Tab>("overview"), [more, setMore] = React.useState(false);
  const groups = React.useMemo(() => filterGroups(lp), [lp.all, lp.f, lp.settings, lp.fields.join("|")]);   // eslint-disable-line react-hooks/exhaustive-deps
  const pinned = groups.filter(g => g.pinned), rest = groups.filter(g => !g.pinned), restOn = rest.reduce((n, g) => n + g.selected.length, 0);
  const x = lp.settings.executive, chips = chipsOf(f, setF, x.periodField ? dimLabel(x.periodField) : undefined), mainRef = React.useRef<HTMLElement>(null);
  const go = (t: Tab, status?: import("../../core/executive").ExecStatus[]) => { setTab(t); if (status) setF({ ...f, status }); mainRef.current?.scrollTo?.(0, 0); };
  React.useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape" && p.chosen && !more) p.onClose(); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [p.chosen, more]);   // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => { if (lp.canSwitch && lp.view === "var") p.onView("rag"); }, [lp.view, lp.canSwitch]);   // the variance view belongs to the classic design: the modern one has the owner’s RAG and the data
  const [title, sub] = TITLES[tab];
  return (
    <div className={"ex exm" + (p.full ? " ex-full" : "")}>
      <header className="exm-tb">
        <div className="brand"><div className="logo" aria-hidden="true">E</div><div><b>Executive</b><span><i className="live" />{p.busy ? "Refreshing…" : "Live"} · {L.epics.length} Epics · {ago(Date.parse(L.at))}</span></div></div>
        <nav className="tabs" role="tablist" aria-label="Pages">{TABS.map(t => <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => go(t.id)}>{t.icon}{t.label}</button>)}</nav>
        <div className="sp" />
        <label className="srch"><IconSearch /><input ref={p.searchRef} type="search" aria-label="Search the Epics" placeholder="Search Epics, people, types" value={f.text} onChange={e => { setF({ ...f, text: e.target.value }); if (e.target.value && tab !== "epics") setTab("epics"); }} /><span className="kbd" aria-hidden="true">/</span></label>
        {p.designSwitch}{p.views}
        {p.onFull && <button type="button" className="exm-ib" aria-pressed={!!p.full} aria-label={p.full ? "Exit full screen" : "Full screen"} title={p.full ? "Exit full screen (Esc)" : "Full screen"} onClick={() => p.onFull!(!p.full)}>{p.full ? <IconExitFullScreen /> : <IconFullScreen />}</button>}
        <button type="button" className="exm-ib" disabled={p.busy} aria-label="Refresh" title={`Refresh · ${L.epics.length} Epics`} onClick={() => p.onReload(false)}>{p.busy ? "…" : <IconRefresh />}</button>
      </header>
      <div className="exm-fb" role="group" aria-label="Filters"><span className="lab">Filters</span>
        {pinned.map(g => <Slicer key={g.key} label={g.label} options={g.options} selected={g.selected} onChange={g.onChange} />)}
        <span className="mw"><button type="button" data-more-btn className={"exm-pb" + (more || restOn ? " on" : "")} aria-expanded={more} onClick={() => setMore(!more)}>More filters{restOn > 0 && <span className="bdg">{restOn}</span>}</button>
          {more && <MorePanel groups={rest} onClose={() => setMore(false)} />}</span>
        <i className="vr" />{p.queryControls}<PeriodSlicer value={f.period} basis={x.periodBasis} fieldLabel={x.periodField ? dimLabel(x.periodField) : undefined} hidden={periodHidden(lp)} onChange={v => setF({ ...f, period: v })} /><div className="sp" />
        {lp.canSwitch && <><span className="lab" title="Which status the dashboard shows">Status from</span><div className="exm-per" role="tablist" aria-label="Status view">{([["rag", "Owner’s RAG"], ["data", "Data"]] as const).map(([id, l]) => <button key={id} role="tab" type="button" aria-selected={lp.view === id} className={lp.view === id ? "on" : ""} onClick={() => p.onView(id)}>{l}</button>)}</div></>}
      </div>
      <div className="exm-body">
        <main className={"exm-main" + (p.chosen ? " ins" : "")} ref={mainRef}>
          <div className="exm-ph"><div><h1>{title}</h1><p>{sub}</p></div></div>
          {(chips.length > 0 || !isEmpty(f)) && <div className="exm-chips">{chips.map((c, i) => <span key={i} className="fc">{c.label}<button type="button" aria-label={`Remove filter ${c.label}`} onClick={c.clear}>×</button></span>)}{chips.length > 1 && <button type="button" className="lk" onClick={p.onReset}>Clear all</button>}<span className="exm-mut">{lp.items.length} of {lp.all.length} Epics</span></div>}
          {p.statusNote}
          {p.error && <div className="err" role="alert">{p.error}</div>}
          {p.notes}{p.historyError && <div className="err" role="alert">The go-live history could not be read: {p.historyError}</div>}
          {tab === "overview" ? <OverviewPage lp={lp} go={go} /> : tab === "pipeline" ? <PipelinePage lp={lp} /> : tab === "epics" ? <EpicsPage lp={lp} sel={p.chosen?.id} /> : <InsightsPage lp={lp} />}
        </main>
        <Inspector item={p.chosen} lp={lp} project={p.project} onClose={p.onClose} onDetails={p.onDetails} onOpenEpic={p.onOpenEpic} hist={p.hist} histState={p.histState} histError={p.histError} />
      </div>
    </div>
  );
}
export { emptyXF };
