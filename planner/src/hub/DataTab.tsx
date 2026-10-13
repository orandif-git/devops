import * as React from "react";
import { aggregate, bandOf, utilization } from "../core/aggregate";
import { monthsOfPeriod } from "../core/period";
import { PlannerSettings } from "../core/types";
import { LoadProgress } from "../data/epics";
import { Loaded } from "../data/loadAll";
import { SavedQuery } from "../data/queries";

const LABEL = { spare: "Spare", healthy: "Healthy", full: "Nearly full", over: "Over", none: "–" } as const;

/** What was read and how it was understood: counts, skipped rows, people without capacity, and a sample of hours. */
export function DataTab(p: {
  project: { id: string; name: string }; settings: PlannerSettings; valid: boolean; loaded?: Loaded; busy: boolean; progress?: LoadProgress; error: string;
  queries: SavedQuery[]; queryId: string; onQuery(id: string): void; onReload(force: boolean): void;
}) {
  const sum = p.loaded;
  const months = React.useMemo(() => monthsOfPeriod(p.settings.period), [p.settings.period]);
  const people = React.useMemo(() => sum ? aggregate(sum.bookings, months) : undefined, [sum, months]);
  const rows = React.useMemo(() => {
    if (!sum || !people) return [];
    return Array.from(people.values()).map(pp => ({ pp, total: months.reduce((a, m) => a + (pp.months[m]?.hours ?? 0), 0) })).sort((a, b) => b.total - a.total).slice(0, 15);
  }, [sum, people, months]);
  const noCapacity = React.useMemo(() => sum && people ? Array.from(people.values()).filter(pp => months.some(m => pp.months[m] && sum.avail.hours(pp.key, m) === null)) : [], [sum, people, months]);
  const month = months.find(m => m >= new Date().toISOString().slice(0, 7)) ?? months[0];
  const prog = p.progress;

  return (
    <div>
      {!p.valid && <div className="err" role="alert">Complete the settings first (Settings tab): the planner needs at least one grid and its columns.</div>}
      <div className="toolbar">
        <label>Epics from <select value={p.queryId} onChange={e => p.onQuery(e.target.value)}><option value="">All {p.settings.workItemType}s of the project</option>{p.queries.map(q => <option key={q.id} value={q.id}>Saved query: {q.path}</option>)}</select></label>
        <button className="btn primary" disabled={p.busy || !p.valid} onClick={() => p.onReload(false)}>{p.busy ? "Loading…" : "Load"}</button>
        <button className="btn" disabled={p.busy || !p.valid} title="Ignore the local copy and read everything again" onClick={() => p.onReload(true)}>Reload everything</button>
        {prog && <span className="muted">{prog.phase === "query" ? "Finding the Epics…" : prog.phase === "check" ? `Checking for changes (${prog.done}/${prog.total})` : `Reading Epics (${prog.done}/${prog.total} batches)`}</span>}
      </div>
      {p.error && <div className="err" role="alert">{p.error}</div>}
      {sum && (
        <>
          <table className="kv" style={{ borderCollapse: "collapse", margin: "8px 0" }}><tbody>
            <tr><td><b>Epics</b></td><td>{sum.load.ids} found · {sum.load.fetched} read from Azure DevOps · {sum.load.fromCache} from the local copy{sum.load.failed ? ` · ${sum.load.failed} could not be read` : ""}</td></tr>
            <tr><td><b>Time</b></td><td>{(sum.load.ms / 1000).toFixed(1)} s to read · {(sum.ms / 1000).toFixed(1)} s in total {sum.load.usedCache ? "(refresh)" : "(first load)"}</td></tr>
            {sum.perSource.map(x => <tr key={x.name}><td><b>{x.name}</b></td><td>{x.epics} Epic(s) with rows · {x.rows} row(s)</td></tr>)}
            <tr><td><b>Rows</b></td><td>{sum.stats.counted} counted · {sum.stats.excluded} left out by status · {sum.stats.noPerson} without a person · {sum.stats.unscheduled} without monthly hours · {sum.stats.estimated} estimated · {sum.stats.errored} with a scheduling error{sum.stats.unreadable ? " · some grids could not be read" : ""}</td></tr>
            <tr><td><b>People</b></td><td>{people?.size ?? 0} with hours in {months[0]} – {months[months.length - 1]} · {sum.avail.records.length} with team capacity</td></tr>
          </tbody></table>
          {noCapacity && noCapacity.length > 0 && <div className="err" role="status">{noCapacity.length} person(s) have hours but no capacity entered in the chosen teams (shown as “–” below), for example: {noCapacity.slice(0, 5).map(x => x.name.split(" <")[0]).join(", ")}.</div>}
          {!p.settings.capacityTeams.length && <div className="muted">No capacity teams are chosen in the settings, so utilization cannot be calculated.</div>}
          <h3>Sample: the 15 people with the most hours in the period{month ? ` (bands for ${month})` : ""}</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr><th style={{ textAlign: "left", padding: "3px 10px 3px 0" }}>Person</th>{months.map(m => <th key={m} style={{ padding: "3px 6px", textAlign: "right" }}>{m.slice(5)}</th>)}<th style={{ padding: "3px 6px" }}>{month?.slice(5)} band</th></tr></thead>
              <tbody>{rows.map(({ pp }) => {
                const av = month ? sum.avail.hours(pp.key, month) : null; const u = month ? utilization(pp.months[month]?.hours ?? 0, av) : null;
                return <tr key={pp.key}><td style={{ padding: "3px 10px 3px 0", whiteSpace: "nowrap" }} title={pp.name}>{pp.name.split(" <")[0]}</td>
                  {months.map(m => <td key={m} style={{ padding: "3px 6px", textAlign: "right" }}>{pp.months[m] ? pp.months[m].hours : ""}</td>)}
                  <td style={{ padding: "3px 6px" }}>{av === null ? "–" : `${LABEL[bandOf(u, p.settings.thresholds)]} ${u === null || !isFinite(u) ? "" : Math.round(u * 100) + "%"}`}</td></tr>;
              })}</tbody>
            </table>
          </div>
          {sum.avail.report.flatMap(r => r.messages).length > 0 && <div className="muted" style={{ marginTop: 6 }}>Capacity notes: {sum.avail.report.flatMap(r => r.messages).slice(0, 3).join(" · ")}</div>}
        </>
      )}
    </div>
  );
}
