import * as React from "react";
import { aggregate, bandOf, utilization } from "../core/aggregate";
import { parseSource, sumStats } from "../core/parseGrid";
import { monthsOfPeriod } from "../core/period";
import { Booking, ParseStats, PlannerSettings } from "../core/types";
import { loadAvailability, Availability } from "../data/capacity";
import { loadEpics, LoadProgress, LoadResult } from "../data/epics";
import { listSavedQueries, SavedQuery } from "../data/queries";

interface Summary {
  load: LoadResult; stats: ParseStats; bookings: Booking[]; months: string[]; avail: Availability; ms: number;
  perSource: { name: string; epics: number; rows: number }[];
}

const LABEL = { spare: "Spare", healthy: "Healthy", full: "Nearly full", over: "Over", none: "–" } as const;

/** Phase 1 check: read the Epics, parse the grids, add up the hours, read capacity, and say what was found. */
export function DataTab(p: { project: { id: string; name: string }; settings: PlannerSettings; valid: boolean }) {
  const [queries, setQueries] = React.useState<SavedQuery[]>([]);
  const [queryId, setQueryId] = React.useState("");
  const [prog, setProg] = React.useState<LoadProgress>();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const [sum, setSum] = React.useState<Summary>();
  React.useEffect(() => { listSavedQueries(p.project.name).then(setQueries).catch(() => undefined); }, [p.project.name]);

  const run = async (force: boolean) => {
    setBusy(true); setErr(""); setSum(undefined);
    try {
      const t0 = Date.now();
      const s = p.settings;
      const load = await loadEpics(p.project, s, { queryId: queryId || undefined, force, progress: setProg });
      const months = monthsOfPeriod(s.period);
      const perStats: ParseStats[] = []; const bookings: Booking[] = [];
      const perSource = s.sources.map(g => ({ name: g.name || g.id, epics: 0, rows: 0 }));
      for (const e of load.epics) s.sources.forEach((g, i) => {
        const raw = e.grids[g.id]; if (!raw) return;
        const r = parseSource(raw, g, e.id, s.estimateUnscheduled);
        perStats.push(r.stats); bookings.push(...r.bookings); perSource[i].epics++; perSource[i].rows += r.stats.rows;
      });
      const avail = await loadAvailability(s.capacityTeams, force);
      setSum({ load, stats: sumStats(perStats), bookings, months, avail, ms: Date.now() - t0, perSource });
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); setProg(undefined); }
  };

  const people = React.useMemo(() => sum ? aggregate(sum.bookings, sum.months) : undefined, [sum]);
  const rows = React.useMemo(() => {
    if (!sum || !people) return [];
    return Array.from(people.values()).map(pp => ({ pp, total: sum.months.reduce((a, m) => a + (pp.months[m]?.hours ?? 0), 0) })).sort((a, b) => b.total - a.total).slice(0, 15);
  }, [sum, people]);
  const noCapacity = React.useMemo(() => sum && people ? Array.from(people.values()).filter(pp => sum.months.some(m => pp.months[m] && sum.avail.hours(pp.key, m) === null)) : [], [sum, people]);
  const month = sum?.months.find(m => m >= new Date().toISOString().slice(0, 7)) ?? sum?.months[0];

  return (
    <div>
      {!p.valid && <div className="err" role="alert">Complete the settings first (Settings tab): the planner needs at least one grid and its columns.</div>}
      <div className="toolbar">
        <label>Epics from <select value={queryId} onChange={e => setQueryId(e.target.value)}><option value="">All {p.settings.workItemType}s of the project</option>{queries.map(q => <option key={q.id} value={q.id}>Saved query: {q.path}</option>)}</select></label>
        <button className="btn primary" disabled={busy || !p.valid} onClick={() => run(false)}>{busy ? "Loading…" : "Load"}</button>
        <button className="btn" disabled={busy || !p.valid} title="Ignore the local copy and read everything again" onClick={() => run(true)}>Reload everything</button>
        {prog && <span className="muted">{prog.phase === "query" ? "Finding the Epics…" : prog.phase === "check" ? `Checking for changes (${prog.done}/${prog.total})` : `Reading Epics (${prog.done}/${prog.total} batches)`}</span>}
      </div>
      {err && <div className="err" role="alert">{err}</div>}
      {sum && (
        <>
          <table className="kv" style={{ borderCollapse: "collapse", margin: "8px 0" }}><tbody>
            <tr><td><b>Epics</b></td><td>{sum.load.ids} found · {sum.load.fetched} read from Azure DevOps · {sum.load.fromCache} from the local copy{sum.load.failed ? ` · ${sum.load.failed} could not be read` : ""}</td></tr>
            <tr><td><b>Time</b></td><td>{(sum.load.ms / 1000).toFixed(1)} s to read · {(sum.ms / 1000).toFixed(1)} s in total {sum.load.usedCache ? "(refresh)" : "(first load)"}</td></tr>
            {sum.perSource.map(x => <tr key={x.name}><td><b>{x.name}</b></td><td>{x.epics} Epic(s) with rows · {x.rows} row(s)</td></tr>)}
            <tr><td><b>Rows</b></td><td>{sum.stats.counted} counted · {sum.stats.excluded} left out by status · {sum.stats.noPerson} without a person · {sum.stats.unscheduled} without monthly hours · {sum.stats.estimated} estimated · {sum.stats.errored} with a scheduling error{sum.stats.unreadable ? " · some grids could not be read" : ""}</td></tr>
            <tr><td><b>People</b></td><td>{people?.size ?? 0} with hours in {sum.months[0]} – {sum.months[sum.months.length - 1]} · {sum.avail.records.length} with team capacity</td></tr>
          </tbody></table>
          {noCapacity && noCapacity.length > 0 && <div className="err" role="status">{noCapacity.length} person(s) have hours but no capacity entered in the chosen teams (shown as “–” below), for example: {noCapacity.slice(0, 5).map(x => x.name.split(" <")[0]).join(", ")}.</div>}
          {!p.settings.capacityTeams.length && <div className="muted">No capacity teams are chosen in the settings, so utilization cannot be calculated.</div>}
          <h3>Sample: the 15 people with the most hours in the period{month ? ` (bands for ${month})` : ""}</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr><th style={{ textAlign: "left", padding: "3px 10px 3px 0" }}>Person</th>{sum.months.map(m => <th key={m} style={{ padding: "3px 6px", textAlign: "right" }}>{m.slice(5)}</th>)}<th style={{ padding: "3px 6px" }}>{month?.slice(5)} band</th></tr></thead>
              <tbody>{rows.map(({ pp }) => {
                const av = month ? sum.avail.hours(pp.key, month) : null; const u = month ? utilization(pp.months[month]?.hours ?? 0, av) : null;
                return <tr key={pp.key}><td style={{ padding: "3px 10px 3px 0", whiteSpace: "nowrap" }} title={pp.name}>{pp.name.split(" <")[0]}</td>
                  {sum.months.map(m => <td key={m} style={{ padding: "3px 6px", textAlign: "right" }}>{pp.months[m] ? pp.months[m].hours : ""}</td>)}
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
