import { computeStageDates } from "../../planner/src/core/stageDates";
import { defaultStages, resolveStage, stageDateFields, stageDatesOn, StageSettings, stagesOn } from "../../planner/src/core/stages";
import { normStages } from "../../planner/src/core/settings";

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
  /** what the extension last did to the layout: the process, the group and when */ layout?: { processId: string; processName: string; groupId: string; at: string };
}
export const defaultProgress = (): ProgressSettings => ({ enabled: false, workItemType: "Epic", groupLabel: "Delivery progress", stages: defaultStages(), doneStates: ["Done", "Closed", "Completed", "Resolved"], showTime: true, flags: true });

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const list = (v: unknown, fb: string[]) => (Array.isArray(v) ? Array.from(new Set(v.map(str).filter(Boolean))) : fb);
export function normProgress(raw: unknown): ProgressSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>, d = defaultProgress(), l = r.layout && typeof r.layout === "object" ? (r.layout as Record<string, unknown>) : undefined;
  return {
    enabled: r.enabled === true, workItemType: str(r.workItemType) || d.workItemType, groupLabel: str(r.groupLabel) || d.groupLabel, stages: normStages(r.stages),
    doneStates: list(r.doneStates, d.doneStates), showTime: r.showTime !== false, flags: r.flags !== false,
    ...(l && str(l.processId) && str(l.groupId) ? { layout: { processId: str(l.processId), processName: str(l.processName), groupId: str(l.groupId), at: str(l.at) } } : {}),
  };
}

/** The fields of the work item the control reads. */
export function progressFields(p: ProgressSettings): string[] {
  const f = ["System.WorkItemType", "System.State", p.stages.field, ...stageDateFields(p.stages)];
  return Array.from(new Set(f.filter((v): v is string => !!v)));
}

export type StepMark = "done" | "cur" | "todo" | "skip" | "rework";
export interface ProgressStep { name: string; mark: StepMark; /** a problem with this stage’s dates */ bad: boolean; /** the lines of the hover card */ tip: string[] }
export type ProgressModel =
  | { kind: "hidden" }
  | { kind: "shown"; steps: ProgressStep[]; /** the current stage, empty when the work item has none (yet) */ current: string; days?: number; delivered?: number; /** what the stage field holds when it is not a known stage */ note?: string; flags: { level: "w" | "r"; text: string }[] };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** “14 Sep 2026” (UTC, so the day does not move with the time zone). */
export const fmtDay = (t?: number) => { if (t === undefined) return "–"; const d = new Date(t); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

/**
 * What the control draws for one work item: the steps, where it is now, how long it has been there and what looks wrong.
 * `fields` holds the values read from the form (field reference name → text). Nothing is guessed: a stage whose dates are missing or do not fit is flagged.
 */
export function buildProgress(p: { settings: ProgressSettings; fields: Record<string, string>; today: number }): ProgressModel {
  const s = p.settings, st = s.stages, type = (p.fields["System.WorkItemType"] ?? "").trim().toLowerCase();
  if (!s.enabled || !stagesOn(st) || (type && s.workItemType.toLowerCase() !== type)) return { kind: "hidden" };
  const state = (p.fields["System.State"] ?? "").trim(), extra: Record<string, string> = {};
  for (const f of progressFields(s)) extra[f] = p.fields[f] ?? "";
  const done = s.doneStates.some(x => x.toLowerCase() === state.toLowerCase()), rs = resolveStage({ state, extra }, st);
  const cur = rs.kind === "stage" ? rs.idx : done ? st.stages.length - 1 : -1;
  const sd = cur >= 0 && stageDatesOn(st) ? computeStageDates({ st: { ...st, dates: { ...st.dates, fallback: false } }, extra, curIdx: cur, done, today: p.today }) : undefined;   // the history is not read on the form, so a missing date stays missing
  const steps: ProgressStep[] = st.stages.map((g, i) => {
    const r = sd?.rows[i], finished = cur >= 0 && (done || i < cur);
    const mark: StepMark = r?.skipped ? "skip" : r?.rework ? "rework" : cur >= 0 && !done && i === cur ? "cur" : finished ? "done" : "todo";
    const tip: string[] = [];
    if (r?.skipped) tip.push("Skipped (no start date)");
    else if (r) { tip.push(r.start !== undefined ? `Started ${fmtDay(r.start)}` : "No start date"); if (r.end !== undefined && !r.rework) tip.push(`Ended ${fmtDay(r.end)}`); else if (r.open) tip.push("Open"); if (r.dur !== undefined) tip.push(`Duration ${r.dur} d`); }
    return { name: g.name, mark, bad: !!r && s.flags && st.dates.consistency && (!!r.order || !!r.missing), tip };
  });
  const flags = sd && s.flags && st.dates.consistency ? sd.issues.map(x => ({ level: (x.kind === "order" ? "r" : "w") as "w" | "r", text: x.text })) : [];
  const dates = rs.kind === "stage" || done ? undefined : rs.kind === "unmapped" ? `“${rs.value}” is not one of the stages` : undefined;
  return { kind: "shown", steps, current: cur >= 0 ? st.stages[cur].name : "", days: s.showTime && sd && !done ? sd.timeInStage : undefined, delivered: done && sd ? sd.rows[sd.cur]?.end ?? sd.rows[sd.cur]?.start : undefined, ...(dates ? { note: dates } : {}), flags };
}
