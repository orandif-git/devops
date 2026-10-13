import * as React from "react";
import { shortName } from "../core/model";
import { Booking, EpicRecord } from "../core/types";
import { openWorkItem } from "../data/open";
import { loadRelated, Related } from "../data/related";

/** An Epic on top of the page: who works on it, its dates, and its parent, children and related items (read when the dialog opens). */
export function EpicDialog(p: { epic: EpicRecord; project: string; bookings: Booking[]; months: string[]; onClose(): void }) {
  const [related, setRelated] = React.useState<Related[] | string>();
  const { epic } = p;
  React.useEffect(() => { let live = true; loadRelated(epic.id).then(r => live && setRelated(r)).catch(e => live && setRelated("Could not read the related work items: " + (e as Error).message)); return () => { live = false; }; }, [epic.id]);
  React.useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === "Escape") p.onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [p]);
  const people = React.useMemo(() => {
    const keep = new Set(p.months); const m = new Map<string, { name: string; hours: number }>();
    for (const b of p.bookings) if (b.epicId === epic.id && keep.has(b.month)) { const x = m.get(b.person) ?? { name: b.personName, hours: 0 }; x.hours = Math.round((x.hours + b.hours) * 100) / 100; m.set(b.person, x); }
    return Array.from(m.values()).sort((a, b) => b.hours - a.hours);
  }, [p.bookings, p.months, epic.id]);
  return (
    <div className="modal-back" role="presentation" onClick={e => { if (e.target === e.currentTarget) p.onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="epic-title">
        <h3 id="epic-title">{epic.id} · {epic.title}</h3>
        <div className="muted">{epic.state} · {epic.areaPath}{epic.start || epic.target ? ` · ${epic.start ?? "?"} → ${epic.target ?? "?"}` : ""}</div>
        <h4>People and hours in the period</h4>
        {people.length ? <table className="mini"><tbody>{people.slice(0, 12).map(x => <tr key={x.name}><td>{shortName(x.name)}</td><td>{x.hours} h</td></tr>)}</tbody></table> : <div className="muted">No hours in this period.</div>}
        <h4>Related work items</h4>
        {related === undefined ? <div className="muted">Reading…</div> : typeof related === "string" ? <div className="err">{related}</div> : !related.length ? <div className="muted">None.</div> : (
          <table className="mini"><tbody>{related.map(r => (
            <tr key={r.id}><td><a href="#" className="lk" onClick={e => { e.preventDefault(); void openWorkItem(p.project, r.id); }}>{r.id} · {r.title}</a></td><td><span className="chip2">{r.relation}</span><span className="chip2">{r.type}</span><span className="chip2">{r.state}</span></td></tr>
          ))}</tbody></table>
        )}
        <div className="toolbar" style={{ marginTop: 12 }}>
          <button className="btn primary" onClick={() => void openWorkItem(p.project, epic.id)}>Open the Epic form</button>
          <button className="btn" onClick={() => void openWorkItem(p.project, epic.id, true)}>Open in a new tab</button>
          <button className="btn" onClick={p.onClose}>Close</button>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>Nothing is edited from the planner.</div>
      </div>
    </div>
  );
}
