import * as React from "react";
import { AllocationDoc, buildOverview } from "../core/allocations";
import { CapacityRecord, CapacityRegister, monthsOf } from "../core/capacity";

export interface OverviewData { records: CapacityRecord[]; register: CapacityRegister; docs: AllocationDoc[] }

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmt = (n: number) => String(Math.round(n * 10) / 10);

/** For managers: per person and month, capacity against the hours all Epics have allocated. */
export function Overview(p: { load(): Promise<OverviewData> }) {
  const [data, setData] = React.useState<OverviewData>();
  const [err, setErr] = React.useState("");
  const [year, setYear] = React.useState(new Date().getFullYear());
  const [onlyOver, setOnlyOver] = React.useState(false);
  const reload = React.useCallback(() => { setData(undefined); setErr(""); p.load().then(setData).catch(e => setErr("Could not load: " + e.message)); }, [p]);
  React.useEffect(reload, [reload]);

  const months = monthsOf(year);
  const rows = React.useMemo(() => (data ? buildOverview(data.records, data.register, data.docs, months) : []), [data, year]);   // eslint-disable-line react-hooks/exhaustive-deps
  const shown = onlyOver ? rows.filter(r => r.cells.some(c => c.over)) : rows;
  const epics = data?.docs.length ?? 0;

  return (
    <div className="capacity">
      <div className="toolbar">
        <button className="btn" onClick={() => setYear(year - 1)}>◀</button><strong>{year}</strong><button className="btn" onClick={() => setYear(year + 1)}>▶</button>
        <label><input type="checkbox" checked={onlyOver} onChange={e => setOnlyOver(e.target.checked)} /> Only people over capacity</label>
        <span className="spacer" />
        <button className="btn" onClick={reload}>Refresh</button>
      </div>
      {err && <div className="err">{err}</div>}
      {!data && !err && <div className="muted">Loading…</div>}
      {data && (
        <div className="scroll">
          <table>
            <thead><tr><th>Person</th>{months.map((m, i) => <th key={m} title={m}>{MONTH_LABELS[i]}</th>)}</tr></thead>
            <tbody>
              {shown.map(r => (
                <tr key={r.key}><td className="name" title={r.name}>{r.name}</td>
                  {r.cells.map(c => (
                    <td key={c.month} className={"ov" + (c.over ? " over" : "")} title={`${c.month}: ${fmt(c.allocated)} h allocated of ${c.capacity === null ? "no registered capacity" : fmt(c.capacity) + " h"}`}>
                      {c.allocated || c.capacity ? <><span>{fmt(c.allocated)}{c.capacity !== null && <span className="muted"> / {fmt(c.capacity)}</span>}</span>
                        {c.utilization !== null && <div className="pct">{fmt(c.utilization)}%</div>}</> : <span className="muted">–</span>}
                    </td>
                  ))}</tr>
              ))}
              {!shown.length && <tr><td colSpan={13} className="muted empty">{onlyOver ? "No one is over capacity." : "No capacity or hours recorded yet."}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <div className="help">Each cell: hours allocated across <b>all Epics</b> / the person's capacity, and the utilization %. Red = over 100%. Based on {epics} Epic(s) that have published their hours (an Epic publishes when it is saved, so very recent edits may not be included yet).</div>
    </div>
  );
}
