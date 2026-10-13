/** Settings of the Resource Planner (everything configurable; stored in the planner's own extension data). */
export interface TeamRef { id: string; name: string }

/** One grid that feeds the planner with hours, e.g. "SDLC Timesheet" or "Resource Allocation". Column ids are the keys of the grid's rows. */
export interface GridSource {
  id: string;
  name: string;
  /** reference name of the long-text field that holds the grid's rows (JSON) */
  dataField: string;
  columns: { resource: string; start?: string; end?: string; effort?: string; allocation?: string; status?: string; task?: string };
  /** values of the status column whose rows are left out of the hours (optional; empty = none) */
  excludedStatuses: string[];
}

export type PeriodKind = "year" | "quarter" | "last12" | "next12" | "custom";
export interface Period { kind: PeriodKind; from?: string; to?: string }
export interface Thresholds { spare: number; healthy: number; full: number }

export interface PlannerSettings {
  version: 1;
  /** work item type read by the planner (default Epic) */
  workItemType: string;
  /** Epic start / target date fields (any date field) */
  epicStartField: string;
  epicTargetField: string;
  sources: GridSource[];
  /** when a scheduled row has no stored monthly hours, spread its effort over the weekdays between start and end (flagged as estimated) */
  estimateUnscheduled: boolean;
  capacityTeams: TeamRef[];
  period: Period;
  thresholds: Thresholds;
  colourMode: "rag" | "shades";
  /** who may open the planner (empty = every project member); a display guard, not access control */
  accessTeams: TeamRef[];
  /** extra Epic fields offered as filters */
  extraFilterFields: string[];
}

export const defaultSettings = (): PlannerSettings => ({
  version: 1, workItemType: "Epic", epicStartField: "", epicTargetField: "", sources: [], estimateUnscheduled: true, capacityTeams: [],
  period: { kind: "year" }, thresholds: { spare: 50, healthy: 85, full: 100 }, colourMode: "rag", accessTeams: [], extraFilterFields: [],
});

/** What the planner keeps of one Epic. `grids` holds the raw text of each source's data field. */
export interface EpicRecord {
  id: number;
  title: string;
  state: string;
  type: string;
  areaPath: string;
  iterationPath: string;
  changed: string;
  start?: string;
  target?: string;
  grids: Record<string, string>;
  extra: Record<string, string>;
}

/** Hours of one person on one Epic in one month. */
export interface Booking {
  epicId: number;
  sourceId: string;
  /** normalised person key (domain-insensitive) */
  person: string;
  personName: string;
  month: string;
  hours: number;
  /** true when the monthly hours were estimated from start, end and effort instead of read from the grid */
  estimated?: boolean;
}

/** One grid row as a piece of work: who, on which Epic, from when to when, how much. Used by the resource timeline. */
export interface Task {
  epicId: number;
  sourceId: string;
  person: string;
  personName: string;
  /** "YYYY-MM-DD" */
  start: string;
  end: string;
  effort?: number;
  allocation?: number;
  label?: string;
  estimated?: boolean;
}

export interface ParseStats { rows: number; counted: number; excluded: number; noPerson: number; unscheduled: number; estimated: number; errored: number; unreadable: boolean }
