import { dimLabel } from "../core/executive";
import * as React from "react";
import { buildPeople, Filters, noFilters, NO_TEAM } from "../core/model";
import { Period, PlannerSettings } from "../core/types";
import { Loaded } from "../data/loadAll";
import { SavedQuery } from "../data/queries";

export function MultiPick(p: { label: string; all: string[]; value: string[]; onChange(v: string[]): void }) {
  return (
    <details className="ms"><summary>{p.label}: {p.value.length ? `${p.value.length} selected` : "all"}</summary>
      <div className="ms-list">{p.all.map(v => <label key={v}><input type="checkbox" checked={p.value.includes(v)} onChange={e => p.onChange(e.target.checked ? [...p.value, v] : p.value.filter(x => x !== v))} /> {v || "(empty)"}</label>)}
        {p.value.length > 0 && <button className="btn" onClick={() => p.onChange([])}>Clear</button>}</div></details>
  );
}

/** The period for this session (the default comes from the settings). */
export function PeriodBar(p: { period: Period; onChange(v: Period): void }) {
  return (
    <div className="toolbar filters">
      <label>Period <select value={p.period.kind} onChange={e => p.onChange({ ...p.period, kind: e.target.value as Period["kind"] })}>
        <option value="year">This calendar year</option><option value="quarter">This quarter</option><option value="last12">Last 12 months</option><option value="next12">Next 12 months</option><option value="custom">Custom</option></select></label>
      {p.period.kind === "custom" && <>
        <label>From <input value={p.period.from ?? ""} placeholder="YYYY-MM" style={{ width: 90 }} onChange={e => p.onChange({ ...p.period, from: e.target.value })} /></label>
        <label>To <input value={p.period.to ?? ""} placeholder="YYYY-MM" style={{ width: 90 }} onChange={e => p.onChange({ ...p.period, to: e.target.value })} /></label></>}
    </div>
  );
}

/** Query, team, state, extra fields, person search: the same bar on every view. */
export function FilterBar(p: {
  settings: PlannerSettings; loaded?: Loaded; months: string[]; filters: Filters; onFilters(f: Filters): void;
  queries: SavedQuery[]; queryId: string; onQuery(id: string): void; idleLabel?: string;
}) {
  const L = p.loaded;
  const set = (patch: Partial<Filters>) => p.onFilters({ ...p.filters, ...patch });
  const teams = React.useMemo(() => Array.from(new Set((L ? buildPeople(L.bookings, L.epics, L.avail, p.months, noFilters()) : []).map(x => x.team))).sort((a, b) => (a === NO_TEAM ? 1 : 0) - (b === NO_TEAM ? 1 : 0) || a.localeCompare(b)), [L, p.months]);
  const states = React.useMemo(() => Array.from(new Set((L?.epics ?? []).map(e => e.state))).sort(), [L]);
  const extraValues = (f: string) => Array.from(new Set((L?.epics ?? []).map(e => e.extra[f] ?? ""))).sort();
  return (
    <div className="toolbar filters">
      <label>Epics from <select value={p.queryId} onChange={e => p.onQuery(e.target.value)}><option value="">All {p.settings.workItemType}s</option>{p.queries.map(q => <option key={q.id} value={q.id}>Query: {q.path}</option>)}</select></label>
      <label>Team <select value={p.filters.team} onChange={e => set({ team: e.target.value })}><option value="">All teams</option>{teams.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
      <MultiPick label="State" all={states} value={p.filters.states} onChange={v => set({ states: v })} />
      {p.settings.extraFilterFields.map(f => <MultiPick key={f} label={dimLabel(f)} all={extraValues(f)} value={p.filters.extra[f] ?? []} onChange={v => set({ extra: { ...p.filters.extra, [f]: v } })} />)}
      <input type="search" placeholder="Find a person…" value={p.filters.search} onChange={e => set({ search: e.target.value })} style={{ width: 150 }} />
      <label><input type="checkbox" checked={p.filters.showIdle} onChange={e => set({ showIdle: e.target.checked })} /> {p.idleLabel ?? "people without hours"}</label>
    </div>
  );
}
