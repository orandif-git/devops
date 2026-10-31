import * as React from "react";
import type { Hist } from "../../core/history";
import { recordedLate } from "../../core/stageDates";
import type { StageSettings } from "../../core/stages";
import { stageDateFields } from "../../core/stages";
import { fetchEpicHistories } from "../../data/history";

export type DateHistState = "ok" | "loading" | "error" | "none";
/** The history of the stage date fields of one Epic: taken from the history already read for all Epics, or read from the Epic's own updates when its panel opens. */
export function useStageDateHistory(id: number | undefined, st: StageSettings, known: Record<string, Hist> | undefined, allRead: boolean, on: boolean): { hist?: Record<string, Hist>; state: DateHistState; error?: string } {
  const fields = React.useMemo(() => stageDateFields(st), [st]), key = fields.join("|");
  const [lazy, setLazy] = React.useState<{ id: number; hist?: Record<string, Hist>; err?: string; done: boolean }>();
  React.useEffect(() => {
    if (id === undefined || !on || allRead || !fields.length) { setLazy(undefined); return; }
    let live = true; setLazy({ id, done: false });
    fetchEpicHistories(id, fields).then(h => live && setLazy({ id, hist: Object.fromEntries(Object.entries(h).filter((e): e is [string, Hist] => !!e[1])), done: true })).catch(e => live && setLazy({ id, err: (e as Error).message, done: true }));
    return () => { live = false; };
  }, [id, on, allRead, key]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!on || !fields.length) return { state: "none" };
  if (allRead) return { hist: known, state: "ok" };
  const mine = lazy && lazy.id === id ? lazy : undefined;
  return { hist: mine?.hist, state: !mine || !mine.done ? "loading" : mine.err ? "error" : "ok", error: mine?.err };
}

/** What a stage date field is called in the panel: “SIT start”, “UAT end”, “Delivered”. */
export function dateFieldLabel(st: StageSettings, field: string): string {
  for (const [name, d] of Object.entries(st.dates.stages)) { if (d.startMode === "field" && d.start === field) return `${name} start`; if (d.endMode === "field" && d.end === field) return `${name} end`; }
  return st.dates.delivered === field ? "Delivered" : field;
}
export interface DateEvent { field: string; label: string; at: string; by: string; from?: string; to: string; late?: number }
/** Every entry and change of the stage dates of an Epic, newest first, with how late each was recorded. */
export function dateEvents(st: StageSettings, hist: Record<string, Hist> | undefined): DateEvent[] {
  const out: DateEvent[] = [];
  for (const [field, h] of Object.entries(hist ?? {})) {
    const label = dateFieldLabel(st, field);
    if (h.firstAt) out.push({ field, label, at: h.firstAt, by: h.firstBy ?? "", to: h.baseline, late: recordedLate(h.baseline, h.firstAt) });
    for (const c of h.changes) out.push({ field, label, at: c.at, by: c.by, from: c.from, to: c.to, late: recordedLate(c.to, c.at) });
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
