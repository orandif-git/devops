import * as React from "react";
import { Hist } from "../core/history";
import { fetchEpicHistory } from "../data/history";

export type HistState = "ok" | "loading" | "error" | "none";

/** The history of a date field as a timeline: the original date, then each change with how many days it moved, who and when. */
export function HistoryTimeline(p: { title?: string; hist?: Hist; state: HistState; error?: string; day(t?: number): string }) {
  const h = p.hist;
  return (
    <div className="hist"><h4>{p.title ?? "Go-live history"}</h4>
      {p.state === "loading" ? <div className="muted">Reading the history…</div> : p.state === "error" ? <div className="err">Could not read the history: {p.error}</div> : p.state === "none" ? <div className="muted">No date field is set for this.</div>
        : !h ? <div className="muted">No date change is recorded for this Epic.</div>
        : <ol><li><b>{p.day(Date.parse(h.baseline + "T00:00:00Z"))}</b> <span className="muted">original date</span></li>
          {h.changes.map((c, k) => { const d = Math.round((Date.parse(c.to) - Date.parse(c.from)) / 864e5); return <li key={k} className={d > 0 ? "later" : "earlier"}><b>{p.day(Date.parse(c.to + "T00:00:00Z"))}</b> <span className={d > 0 ? "ex-slip" : "ex-good"}>{d > 0 ? "+" : ""}{d} days</span> <span className="muted">{c.at ? new Date(c.at).toLocaleDateString() : ""}{c.by ? " · " + c.by : ""}</span></li>; })}</ol>}
      {h && !h.changes.length && <div className="muted">Never moved.</div>}
    </div>
  );
}

/** The history of one Epic: taken from the history already read for all Epics, or read from the Epic's own updates. */
export function useEpicHistory(id: number | undefined, field: string, known: Hist | undefined, allRead: boolean): { hist?: Hist; state: HistState; error?: string } {
  const [lazy, setLazy] = React.useState<{ id: number; hist?: Hist; err?: string; done: boolean }>();
  React.useEffect(() => {
    if (id === undefined || allRead || !field) { setLazy(undefined); return; }
    let live = true; setLazy({ id, done: false });
    fetchEpicHistory(id, field).then(h => live && setLazy({ id, hist: h, done: true })).catch(e => live && setLazy({ id, err: (e as Error).message, done: true }));
    return () => { live = false; };
  }, [id, allRead, field]);
  if (!field) return { state: "none" };
  if (allRead) return { hist: known, state: "ok" };
  const mine = lazy && lazy.id === id ? lazy : undefined;
  return { hist: mine?.hist, state: !mine || !mine.done ? "loading" : mine.err ? "error" : "ok", error: mine?.err };
}
