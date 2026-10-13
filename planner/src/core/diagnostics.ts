import { keyNorm } from "../../../src/core/keys";
import { validateSettings } from "./settings";
import { Booking, ParseStats, PlannerSettings } from "./types";

export interface DiagLine { title: string; level: "ok" | "warn" | "bad"; detail: string }

export interface DiagInput {
  settings: PlannerSettings;
  /** undefined = the data has not been loaded in this session */
  loaded?: { epics: number; bookings: Booking[]; stats: ParseStats; capacityPeople: string[]; capacityMessages: { team: string; messages: string[] }[]; ms: number };
}

const list = (a: string[], n = 8) => a.slice(0, n).join(", ") + (a.length > n ? ` … (+${a.length - n} more)` : "");

/** Plain-language checks of the planner's setup and of the data read in this session, for the Diagnostics tab. */
export function diagnose({ settings: s, loaded: l }: DiagInput): DiagLine[] {
  const out: DiagLine[] = [];
  const problems = validateSettings(s);
  out.push(problems.length ? { title: "Settings", level: "bad", detail: problems.join(" ") } : { title: "Settings", level: "ok", detail: `${s.sources.length} hours source(s), ${s.capacityTeams.length} capacity team(s), period ${s.period.kind}` });
  out.push(s.thresholds.spare < s.thresholds.healthy && s.thresholds.healthy < s.thresholds.full
    ? { title: "Colour thresholds", level: "ok", detail: `${s.thresholds.spare} / ${s.thresholds.healthy} / ${s.thresholds.full} %` }
    : { title: "Colour thresholds", level: "bad", detail: "The three thresholds must increase (for example 50 / 85 / 100)." });
  if (!l) { out.push({ title: "Data", level: "warn", detail: "Not loaded yet in this session. Open the Heatmap tab, then come back." }); return out; }
  out.push({ title: "Epics read", level: l.epics ? "ok" : "warn", detail: `${l.epics} Epic(s) in ${(l.ms / 1000).toFixed(1)} s` });
  const st = l.stats;
  out.push(st.unreadable ? { title: "Grid contents", level: "bad", detail: "Some grids could not be read (unknown format or version). Open the Data check tab." } : { title: "Grid contents", level: "ok", detail: `${st.counted} of ${st.rows} rows counted` });
  if (st.unscheduled) out.push({ title: "Rows without monthly hours", level: s.estimateUnscheduled ? "warn" : "bad", detail: `${st.unscheduled} row(s) have no stored monthly hours; ${s.estimateUnscheduled ? `${st.estimated} were estimated from start, end and effort` : "they are not counted (estimation is off in Settings)"}. Open and save those Epics in the grid to store the hours.` });
  if (st.errored) out.push({ title: "Scheduling errors", level: "warn", detail: `${st.errored} row(s) were marked with a scheduling error by the grid.` });
  if (st.noPerson) out.push({ title: "Rows without a person", level: "warn", detail: `${st.noPerson} row(s) have no resource and are not counted.` });
  const cap = new Set(l.capacityPeople.map(keyNorm));
  const unmatched = Array.from(new Map(l.bookings.filter(b => !cap.has(keyNorm(b.person))).map(b => [keyNorm(b.person), b.personName])).values());
  out.push(unmatched.length ? { title: "People without capacity", level: "warn", detail: `${unmatched.length} booked person/people have no team capacity entered and show as "?" in the heatmap: ${list(unmatched)}.` } : { title: "People without capacity", level: "ok", detail: "Everyone with hours has capacity." });
  const capMsgs = l.capacityMessages.filter(m => m.messages.length);
  out.push(capMsgs.length ? { title: "Team capacity", level: "warn", detail: capMsgs.map(m => `${m.team}: ${m.messages.join(" ")}`).join(" · ") } : { title: "Team capacity", level: "ok", detail: `${l.capacityPeople.length} people with capacity` });
  return out;
}

export const diagText = (lines: DiagLine[]) => lines.map(x => `${x.level === "ok" ? "OK  " : x.level === "warn" ? "WARN" : "FAIL"} ${x.title}: ${x.detail}`).join("\n");
