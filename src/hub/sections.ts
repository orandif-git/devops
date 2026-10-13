import { ProjectConfig } from "../core/types";
import { Issue } from "./validate";

export type Tab = "rules" | "cascades" | "grids" | "mappings" | "calcs" | "capacity" | "readonly" | "commentonly" | "audit" | "json";
export type SectionId = "storage" | "derived" | "columns" | "dates" | "review" | "presets" | "totals" | "child" | "preview";

/** Which part of the grid editor a validation message is about (so it can be shown next to it and jumped to). */
export function issueSection(message: string, where = ""): SectionId {
  const m = message;
  const tag = /› (storage|totals|child|preset)/.exec(where)?.[1];
  if (tag) return tag === "preset" ? "presets" : (tag as SectionId);
  if (/Review|approver|approval|Approvals/i.test(m)) return "review";
  if (/preset/i.test(m)) return "presets";
  if (/Scheduled month|Scheduled hours|not scheduled|scheduled by dates, so/i.test(m)) return "derived";
  if (/Schedule|scheduled/i.test(m)) return "dates";
  if (/derived|Source grid|KEY column|Publishing|publish|Capacity register|other Epics|source column/i.test(m)) return "derived";
  if (/Total mapping|total of|Breakdown|written by both|group filter/i.test(m)) return "totals";
  if (/Child/i.test(m)) return "child";
  if (/data field|Data field|long-text|text field/i.test(m)) return "storage";
  return "columns";
}

/** Where to go to fix an issue: the tab, and for grids the grid. */
export function issueTarget(issue: Issue): { tab: Tab; grid?: string; section?: SectionId } | undefined {
  const w = issue.where;
  const g = /^Grid “(.*?)”/.exec(w);
  if (g) return { tab: "grids", grid: g[1], section: issueSection(issue.message, w) };
  if (/^Calculation/.test(w)) return { tab: "calcs" };
  if (/^Mapping/.test(w)) return { tab: "mappings" };
  if (/^Rule/.test(w)) return { tab: "rules" };
  if (/^Dependent/.test(w)) return { tab: "cascades" };
  return undefined;
}

export interface NextStep {
  kind: "start" | "fix" | "review" | "save" | "done";
  text: string;
  detail?: string;
  action?: { label: string; tab: Tab; grid?: string; section?: SectionId; create?: boolean };
}

/** The one thing to do next, from what is configured and what the checks found. */
export function nextStep(config: ProjectConfig, issues: Issue[], dirty: boolean): NextStep {
  const names = Object.keys(config.grids);
  if (!names.length) return { kind: "start", text: "Start with a grid", detail: "A grid is a table people fill in inside a work item. Create one, then add its columns.", action: { label: "Create a grid", tab: "grids", create: true } };
  const noField = names.find(n => !config.grids[n].dataField);
  if (noField) return { kind: "fix", text: `Choose where “${noField}” stores its rows`, detail: "Pick a plain “Text (multiple lines)” field of the work item type.", action: { label: "Choose the field", tab: "grids", grid: noField, section: "storage" } };
  const errors = issues.filter(i => i.level === "error");
  if (errors.length) {
    const t = issueTarget(errors[0]);
    return { kind: "fix", text: `Fix ${errors.length} error${errors.length === 1 ? "" : "s"} before saving`, detail: `${errors[0].where}: ${errors[0].message}`, action: t ? { label: "Take me there", ...t } : undefined };
  }
  const warns = issues.filter(i => i.level === "warn");
  if (warns.length) {
    const t = issueTarget(warns[0]);
    return { kind: "review", text: `${warns.length} thing${warns.length === 1 ? "" : "s"} to check`, detail: `${warns[0].where}: ${warns[0].message}`, action: t ? { label: "Take me there", ...t } : undefined };
  }
  if (dirty) return { kind: "save", text: "Save your changes", detail: "Open work items pick up the new settings the next time they load." };
  return { kind: "done", text: "Everything checks out", detail: "If you have not yet, add the Smart Grid control to the work item layout (Process → work item type → Layout) and type the grid name." };
}

export const TAB_INTRO: Record<Tab, string> = {
  grids: "Define the tables people fill in inside a work item: columns, dates and effort, approval and totals.",
  calcs: "Formulas that keep work item fields up to date from your grids or other fields.",
  capacity: "Where people's available hours and the working calendar come from.",
  rules: "Set values, require fields, restrict values or block saving when conditions are met.",
  cascades: "Make the choices of one field depend on another.",
  mappings: "Shared value → category lists that auto-fill columns use.",
  readonly: "The fields this extension writes, and how to lock them.",
  commentonly: "People or teams who may only add comments on the work item form.",
  audit: "Who changed the settings, when, what the value was before and after, and why.",
  json: "The whole configuration as JSON, for backup or copying to another project.",
};
