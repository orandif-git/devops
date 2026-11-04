import { computeStageDates } from "../../planner/src/core/stageDates";
import { defaultStages, resolveStage, stageDateFields, stageDatesOn, StageSettings, stagesOn } from "../../planner/src/core/stages";
import { normStages } from "../../planner/src/core/settings";
import { parseDay } from "../../planner/src/core/execPeriod";
import { DayCount, dayCounter, normDayCount, WorkCalendar } from "../../planner/src/core/workdays";

/**
 * The “Delivery progress” control on the work item form: a compact one-line stepper of the delivery stages the work item has been through.
 * The stages, the stage field and the date fields are the same “Starts when / Ends when” setup as the Executive Dashboard, so one Epic gets the same answer in both.
 */
export interface ProgressSettings {
  /** the control draws itself (when off it draws nothing; the layout group is added or removed on the Delivery progress tab) */ enabled: boolean;
  /** the work item type the control is for */ workItemType: string;
  /** the name of the group in the layout, which is the heading the people see */ groupLabel: string;
  stages: StageSettings;
  /** the states that mean the work item is delivered */ doneStates: string[];
  /** show how long the work item has been in its current stage */ showTime: boolean;
  /** show a flag where the stage dates do not fit */ flags: boolean;
  /** count the days shown as calendar days (default) or working days */ dayCount: DayCount;
  /** the date field with the go-live (finish line) of the work item; empty = no finish line */ goLiveField: string;
  /** how the control looks: the speech-bubble bar (default), numbered steps, a compact bar or thick open segments */ design: ProgressDesign;
  /** what the stage names show */ names: ProgressNames;
  /** where the status (“Needs attention · 1 stage behind”) is shown */ status: ProgressStatusPos;
  /** which lines are shown under the control */ detail: ProgressDetail;
  /** the sentences; an empty or missing one uses the default (see WORDS) */ words: Record<string, string>;
  /** what the extension last did to the layout: the process, the group and when */ layout?: { processId: string; processName: string; groupId: string; at: string };
}
export type ProgressDesign = "bar" | "steps" | "compact" | "thick";
export type ProgressNames = "name" | "number" | "icon" | "current" | "none";
export type ProgressStatusPos = "right" | "left" | "hidden";
export type ProgressDetail = "both" | "golive" | "time" | "none";
export const DESIGNS: ProgressDesign[] = ["bar", "steps", "compact", "thick"], NAMES: ProgressNames[] = ["name", "number", "icon", "current", "none"], STATUS_POS: ProgressStatusPos[] = ["right", "left", "hidden"], DETAILS: ProgressDetail[] = ["both", "golive", "time", "none"];

/** The sentences of the control: the default text and the placeholders each one may use. A sentence the admin leaves empty (or writes with an unknown placeholder) uses the default. */
export const WORDS: Record<string, { label: string; text: string; vars: string[] }> = {
  onTrack: { label: "Status: on track", text: "On track", vars: [] },
  attention: { label: "Status: needs attention", text: "Needs attention", vars: [] },
  risk: { label: "Status: at risk", text: "At risk", vars: [] },
  delivered: { label: "Status: delivered", text: "Delivered", vars: [] },
  next: { label: "Next stage starts", text: "{next} starts in {days}", vars: ["next", "days"] },
  golive: { label: "Go-live ahead", text: "go-live in {days}", vars: ["days"] },
  passed: { label: "Go-live passed", text: "go-live was {days} ago", vars: ["days"] },
  behind: { label: "Stages behind", text: "{count} behind schedule", vars: ["count"] },
  pastEnd: { label: "Past the planned end", text: "{stage} is {days} past its planned end", vars: ["stage", "days"] },
  early: { label: "Delivered before go-live", text: "{days} before go-live", vars: ["days"] },
  late: { label: "Delivered after go-live", text: "{days} after go-live", vars: ["days"] },
  onDate: { label: "Delivered on the go-live date", text: "on the go-live date", vars: [] },
  deliveredOn: { label: "Delivered, no go-live", text: "on {date}", vars: ["date"] },
  since: { label: "Time in the stage", text: "In {stage} since {date} ({days})", vars: ["stage", "date", "days"] },
  planned: { label: "Stage planned to start", text: "In {stage}, planned start {date}", vars: ["stage", "date"] },
  inStage: { label: "Stage without a date", text: "In {stage}", vars: ["stage"] },
  allDone: { label: "All stages complete", text: "All {count} stages complete", vars: ["count"] },
  finishLeft: { label: "Go-live line", text: "Go-live {golive} · {days} left", vars: ["golive", "days"] },
  finishToday: { label: "Go-live today", text: "Go-live today", vars: [] },
  finishPast: { label: "Go-live passed line", text: "Go-live was {golive} · {days} ago", vars: ["golive", "days"] },
  deliveredLine: { label: "Delivered line", text: "Delivered {date}", vars: ["date"] },
};
/** The placeholders in a sentence that its place does not know. */
export const unknownVars = (key: string, text: string): string[] => { const ok = WORDS[key]?.vars ?? []; return Array.from(new Set((text.match(/\{(\w+)\}/g) ?? []).map(x => x.slice(1, -1)).filter(v => !ok.includes(v)))); };
/** Problems with the wording the admin typed (one line each). */
export const wordingProblems = (words: Record<string, string>): string[] => Object.entries(words).filter(([k, v]) => WORDS[k] && v.trim()).flatMap(([k, v]) => { const u = unknownVars(k, v); return u.length ? [`“${WORDS[k].label}”: unknown ${u.map(x => `{${x}}`).join(", ")} (allowed: ${WORDS[k].vars.length ? WORDS[k].vars.map(x => `{${x}}`).join(" ") : "none"}); the default is used`] : []; });

export const defaultProgress = (): ProgressSettings => ({ enabled: false, workItemType: "Epic", groupLabel: "Delivery Progress", stages: defaultStages(), doneStates: ["Done", "Closed", "Completed", "Resolved"], showTime: true, flags: true, dayCount: "calendar", goLiveField: "Microsoft.VSTS.Scheduling.TargetDate", design: "bar", names: "name", status: "right", detail: "both", words: {} });

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const list = (v: unknown, fb: string[]) => (Array.isArray(v) ? Array.from(new Set(v.map(str).filter(Boolean))) : fb);
export function normProgress(raw: unknown): ProgressSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>, d = defaultProgress(), l = r.layout && typeof r.layout === "object" ? (r.layout as Record<string, unknown>) : undefined;
  return {
    enabled: r.enabled === true, workItemType: str(r.workItemType) || d.workItemType, groupLabel: str(r.groupLabel) || d.groupLabel, stages: normStages(r.stages),
    doneStates: list(r.doneStates, d.doneStates), showTime: r.showTime !== false, flags: r.flags !== false, dayCount: normDayCount(r.dayCount), goLiveField: typeof r.goLiveField === "string" ? r.goLiveField.trim() : d.goLiveField,
    design: DESIGNS.includes(r.design as ProgressDesign) ? (r.design as ProgressDesign) : d.design, names: NAMES.includes(r.names as ProgressNames) ? (r.names as ProgressNames) : d.names,
    status: STATUS_POS.includes(r.status as ProgressStatusPos) ? (r.status as ProgressStatusPos) : d.status, detail: DETAILS.includes(r.detail as ProgressDetail) ? (r.detail as ProgressDetail) : d.detail,
    words: r.words && typeof r.words === "object" ? Object.fromEntries(Object.entries(r.words as Record<string, unknown>).filter(([k, v]) => WORDS[k] && typeof v === "string" && v.trim()).map(([k, v]) => [k, (v as string).trim()])) : {},
    ...(l && str(l.processId) && str(l.groupId) ? { layout: { processId: str(l.processId), processName: str(l.processName), groupId: str(l.groupId), at: str(l.at) } } : {}),
  };
}

/** The fields of the work item the control reads. */
export function progressFields(p: ProgressSettings): string[] {
  const f = ["System.WorkItemType", "System.State", p.stages.field, ...stageDateFields(p.stages), p.goLiveField];
  return Array.from(new Set(f.filter((v): v is string => !!v)));
}

export type StageIcon = "design" | "code" | "puzzle" | "clipboard" | "cloud" | "rocket" | "dot";
/** green on track, amber needs attention, red at risk, done delivered, none when there are no dates to judge by */
export type Rag = "green" | "amber" | "red" | "done" | "none";
export type StageState = "done" | "current" | "todo" | "skipped";
export interface ProgressStage {
  name: string; icon: StageIcon; state: StageState;
  /** the dates say the work should be in this stage by now, but it is not there yet */ due: boolean;
  /** a problem with this stage’s dates */ bad: boolean;
  /** the dates of the stage in words (the hover title) */ title: string;
}
export type ProgressModel =
  | { kind: "hidden" }
  | {
    kind: "shown"; stages: ProgressStage[];
    /** the index of the current stage, -1 when the work item has none (yet) */ current: number;
    /** where the marker sits on the track, 0 to 100 */ pos: number;
    rag: Rag;
    /** the bold start of the speech bubble: “On track”, “Needs attention”, “At risk”, “Delivered” */ label: string;
    /** the rest of the bubble: “SIT starts in 29 days” */ text: string;
    /** “In Development since 27 Oct (7 days)” */ since: string;
    /** “Go-live 20 Jan 2027 · 78 days left” */ finish: string;
    /** the same in one sentence for a screen reader */ summary: string;
    /** what the stage field holds when it is not a known stage */ note?: string;
    flags: { level: "w" | "r"; text: string }[];
  };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** “14 Sep 2026” (UTC, so the day does not move with the time zone). */
export const fmtDay = (t?: number) => { if (t === undefined) return "–"; const d = new Date(t); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const DAY = 86400000;
/** “27 Oct”, with the year (“6 Jan ’27”) when it is not the current year. */
const shortDay = (t: number, year: number) => { const d = new Date(t), base = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; return d.getUTCFullYear() === year ? base : `${base} ’${String(d.getUTCFullYear()).slice(2)}`; };

/** The icon of a stage, from its name (the stages are configurable), else from its place in the row. */
export function stageIcon(name: string, i: number): StageIcon {
  const n = name.toLowerCase();
  if (/design|plan|analy|require|discover|scope|propos/.test(n)) return "design";
  if (/uat|accept|business test|user test/.test(n)) return "clipboard";
  if (/sit|integrat|system test|qa|test/.test(n)) return "puzzle";
  if (/deploy|release|roll ?out|install|migrat|cutover/.test(n)) return "cloud";
  if (/live|go.?live|launch|production|prod\b|operate|run/.test(n)) return "rocket";
  if (/dev|build|code|implement|engineer|program/.test(n)) return "code";
  return (["design", "code", "puzzle", "clipboard", "cloud", "rocket"] as StageIcon[])[i % 6] ?? "dot";
}

/**
 * What the control draws for one work item: where it is, whether it is on track, and what comes next.
 * `fields` holds the values read from the form (field reference name → text). Nothing is guessed: a stage whose dates are missing or do not fit is flagged.
 * Status: red when go-live has passed, two stages or more are behind the dates, or the stage is 14 days or more past its planned end; amber for one stage behind or a stage past its planned end; green otherwise.
 */
export function buildProgress(p: { settings: ProgressSettings; fields: Record<string, string>; today: number; /** the working week and days off, for "working days" */ calendar?: WorkCalendar }): ProgressModel {
  const s = p.settings, dc = dayCounter(s.dayCount, p.calendar), days = dc.text, dd = dc.diff,
    /** a sentence of the control: the admin's wording, else the default; {placeholders} are filled in */
    say = (key: string, v: Record<string, string | number> = {}, strip = false) => {
      const mine = s.words[key], t0 = mine && unknownVars(key, mine).length === 0 ? mine : WORDS[key].text, t = strip ? t0.replace(/\s*\([^)]*\{days\}[^)]*\)/g, "") : t0;
      return t.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m));
    }, st = s.stages, type = (p.fields["System.WorkItemType"] ?? "").trim().toLowerCase();
  if (!s.enabled || !stagesOn(st) || (type && s.workItemType.toLowerCase() !== type)) return { kind: "hidden" };
  const state = (p.fields["System.State"] ?? "").trim(), extra: Record<string, string> = {}, today = p.today, n = st.stages.length;
  for (const f of progressFields(s)) extra[f] = p.fields[f] ?? "";
  const done = s.doneStates.some(x => x.toLowerCase() === state.toLowerCase()), rs = resolveStage({ state, extra }, st);
  const cur = rs.kind === "stage" ? rs.idx : done ? n - 1 : -1;
  const sd = cur >= 0 && stageDatesOn(st) ? computeStageDates({ st: { ...st, dates: { ...st.dates, fallback: false } }, extra, curIdx: cur, done, today }) : undefined;   // the history is not read on the form, so a missing date stays missing
  const year = new Date(today).getUTCFullYear(), short = (t: number) => shortDay(t, year);
  const goLive = s.goLiveField ? parseDay(extra[s.goLiveField]) : undefined;
  const behind = sd && !done && cur >= 0 && sd.maxIdx > cur ? sd.maxIdx - cur : 0, expected = behind > 0 && sd ? sd.maxIdx : -1;
  const cr = sd && cur >= 0 ? sd.rows[cur] : undefined;
  const lateDays = !done && cr && cr.declaredEnd !== undefined && cr.declaredEnd < today ? Math.round((today - cr.declaredEnd) / DAY) : 0;   // the status rules always use calendar days
  const pastGoLive = !done && goLive !== undefined && goLive < today ? Math.round((today - goLive) / DAY) : 0;

  const stages: ProgressStage[] = st.stages.map((g, i) => {
    const r = sd?.rows[i], finished = cur >= 0 && (done || i < cur);
    const stateOf: StageState = r?.skipped ? "skipped" : cur >= 0 && !done && i === cur ? "current" : finished ? "done" : "todo";
    const a = r?.declaredStart, e = r?.declaredEnd, parts: string[] = [g.name];
    if (r?.skipped) parts.push("skipped (no start date)");
    else if (a !== undefined) {
      const future = a > today;
      parts.push(`${future ? "planned start" : "started"} ${fmtDay(a)}`);
      if (e !== undefined) parts.push(`${stateOf === "done" || e <= today && stateOf !== "current" ? "ended" : "planned end"} ${fmtDay(e)}`);
      if (stateOf === "done" && e !== undefined && e >= a) parts.push(`took ${days(dd(a, e))}`);
    } else if (r) parts.push("no start date");
    return { name: g.name, icon: stageIcon(g.name, i), state: stateOf, due: i === expected, bad: !!r && s.flags && st.dates.consistency && (!!r.order || !!r.missing), title: parts.join(" · ") };
  });

  let rag: Rag = "none", label = "", text = "";
  const delivered = done && sd ? (parseDay(extra[st.dates.delivered]) ?? sd.rows[cur]?.end ?? sd.rows[cur]?.declaredStart) : undefined;
  if (done) {
    rag = "done"; label = say("delivered");
    text = delivered === undefined ? "" : goLive === undefined ? say("deliveredOn", { date: fmtDay(delivered) }) : goLive > delivered ? say("early", { days: days(dd(delivered, goLive)) }) : goLive < delivered ? say("late", { days: days(dd(goLive, delivered)) }) : say("onDate");
  } else if (sd && cur >= 0) {
    const red = behind >= 2 || lateDays >= 14 || pastGoLive > 0, amber = behind === 1 || lateDays > 0;
    rag = red ? "red" : amber ? "amber" : "green"; label = red ? say("risk") : amber ? say("attention") : say("onTrack");
    if (pastGoLive > 0) text = say("passed", { days: days(dd(goLive!, today)) });
    else if (behind > 0) text = say("behind", { count: behind === 1 ? "one stage" : `${behind} stages` });
    else if (lateDays > 0) text = say("pastEnd", { stage: st.stages[cur].name, days: days(dd(cr!.declaredEnd!, today)) });
    else {
      const next = sd.rows[cur + 1], ns = next?.declaredStart;
      text = ns !== undefined && ns > today ? say("next", { next: next.name, days: days(dd(today, ns)) }) : goLive !== undefined && goLive > today ? say("golive", { days: days(dd(today, goLive)) }) : "";
    }
  } else if (cur >= 0) text = say("inStage", { stage: st.stages[cur].name });

  let since = "";
  if (done) since = say("allDone", { count: n });
  else if (cur >= 0) {
    const a = cr?.declaredStart, name = st.stages[cur].name;
    since = a === undefined ? say("inStage", { stage: name }) : a <= today ? say("since", { stage: name, date: short(a), days: days(dd(a, today)) }, !s.showTime) : say("planned", { stage: name, date: short(a) });
  }
  let finish = "";
  if (done) finish = delivered !== undefined ? say("deliveredLine", { date: fmtDay(delivered) }) : "";
  else if (goLive !== undefined) finish = goLive > today ? say("finishLeft", { golive: fmtDay(goLive), days: days(dd(today, goLive)) }) : goLive === today ? say("finishToday") : say("finishPast", { golive: fmtDay(goLive), days: days(dd(goLive, today)) });

  // where the marker sits: inside its stage, by how much of the planned stage has passed
  let pos = 0;
  if (done) pos = 100;
  else if (cur >= 0) {
    const a = cr?.declaredStart, e = cr?.declaredEnd, frac = a !== undefined && e !== undefined && e > a ? Math.min(0.88, Math.max(0.12, (today - a) / (e - a))) : e === undefined && a !== undefined ? 0.4 : 0.5;
    pos = Math.round(((cur + frac) * 100 / n) * 10) / 10;
  }
  const flags = sd && s.flags && st.dates.consistency ? sd.issues.filter(x => x.kind !== "rework").map(x => ({ level: (x.kind === "order" ? "r" : "w") as "w" | "r", text: x.text })) : [];   // “behind the dates” is what the bar shows, so it is not repeated as a warning
  const dates = rs.kind === "stage" || done ? undefined : rs.kind === "unmapped" ? `“${rs.value}” is not one of the stages` : undefined;
  const summary = [label && (text ? `${label}, ${text}` : label), since, finish].filter(Boolean).join(". ");
  return { kind: "shown", stages, current: cur, pos, rag, label, text, since, finish, summary, ...(dates ? { note: dates } : {}), flags };
}
