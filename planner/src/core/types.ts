/** Settings of the Resource Planner (everything configurable; stored in the planner's own extension data). */
export interface TeamRef { id: string; name: string }

/** One grid that feeds the planner with hours, e.g. "SDLC Timesheet" or "Resource Allocation". Column ids are the keys of the grid's rows. */
export interface GridSource {
  id: string;
  name: string;
  /** reference name of the long-text field that holds the grid's rows (JSON) */
  dataField: string;
  columns: { resource: string; start?: string; end?: string; effort?: string; allocation?: string; status?: string; task?: string; /** checkbox column: is this piece of work done (used by the Executive Dashboard) */ done?: string };
  /** values of the status column whose rows are left out of the hours (optional; empty = none) */
  excludedStatuses: string[];
}

export type PeriodKind = "year" | "quarter" | "last12" | "next12" | "custom";
export interface Period { kind: PeriodKind; from?: string; to?: string }
export interface Thresholds { spare: number; healthy: number; full: number }

export type PlanGroup = "team" | "epic" | "person";
export type PlanUnits = "h" | "p" | "f";
export type PlanView = "heat" | "time" | "gantt";
export type PlanRows = "collapsed" | "teams" | "all";

export interface PlannerSettings {
  version: 1;
  /** work item type read by the planner (default Epic) */
  workItemType: string;
  /** Epic start / target date fields (any date field) */
  epicStartField: string;
  epicTargetField: string;
  /** an Epic field (e.g. Delivery Status) whose value is written at the end of each Gantt bar; empty = none */
  ganttLabelField: string;
  /** Epic fields offered in the Epic Gantt "Group by" list (e.g. Delivery Status, Business Unit) */
  ganttGroupFields: string[];
  sources: GridSource[];
  /** when a scheduled row has no stored monthly hours, spread its effort over the weekdays between start and end (flagged as estimated) */
  estimateUnscheduled: boolean;
  capacityTeams: TeamRef[];
  period: Period;
  thresholds: Thresholds;
  colourMode: "rag" | "shades";
  /** how the Planner opens: grouping of the plan, units of the figures and the view (users can change them on screen) */
  plan: { groupBy: PlanGroup; units: PlanUnits; view: PlanView; /** how much of the plan starts open */ rows: PlanRows; /** the statistics shown above the Epic Gantt (ids, in order) */ ganttTiles: string[] };
  /** who may open the planner (empty = every project member); a display guard, not access control */
  accessTeams: TeamRef[];
  /** extra Epic fields offered as filters */
  extraFilterFields: string[];
  /** the Executive Dashboard */
  executive: ExecSettings;
}

/** Where an Epic's progress (0–100 %) comes from. Sources are tried in order; the first one that has a value for the Epic is used. */
export interface ProgressSource {
  id: string;
  kind: "percentField" | "ratioFields" | "gridDone";
  /** percentField: a number field holding the percent complete (0–100) */
  field?: string;
  /** ratioFields: completed ÷ total (for example Completed Work ÷ Original Estimate) */
  doneField?: string;
  totalField?: string;
  /** gridDone: the share of grid rows ticked done, weighted by the effort column when every row has one */
  sourceId?: string;
}

export type QueryOp = "=" | "<>" | ">" | ">=" | "<" | "<=" | "contains" | "in" | "empty" | "notEmpty";
export type QueryShow = "epics" | "people" | "teams";
/** One row of a query, like a row in the Azure DevOps query editor. `join` links it to the row above (the first row's join is ignored); And binds tighter than Or. */
export interface QueryCondition { field: string; op: QueryOp; value: string; join: "and" | "or" }
/** A named question for the Executive Dashboard: it becomes a chip under the Ask box. */
export interface ExecQuery {
  id: string;
  name: string;
  show: QueryShow;
  conditions: QueryCondition[];
  /** the month the grid and capacity fields are read for: "current", "next" or "YYYY-MM" */
  month: string;
  /** field keys shown as columns in the result table (empty = the standard columns; Epics queries then only filter the list) */
  columns: string[];
}

/** A value worked out for each row with a formula, usable as a column, in conditions and for sorting. Same formula language as Grid & Rules calculations; fields are written [Like this]. */
export interface ExecFormula {
  id: string;
  name: string;
  show: QueryShow;
  formula: string;
  format: "number" | "percent" | "text";
  decimals: number;
}

export interface ExecSettings {
  /** show the Executive Dashboard tab in the Resource Planner (off by default) */
  enabled: boolean;
  /** Epic fields that classify an Epic (for example Project type, Regulatory); each can be filtered and asked about */
  categoryFields: string[];
  /** the go-live date field (empty = the Epic target-date field) */
  goLiveField: string;
  progress: ProgressSource[];
  doneStates: string[];
  holdStates: string[];
  notStartedStates: string[];
  /** Epics in these states are left out (for example Removed) */
  ignoreStates: string[];
  /** forecast later than go-live by more than this many days = needs attention / at risk */
  slipAmberDays: number;
  slipRedDays: number;
  /** progress behind the share of time used by more than this many percentage points = needs attention / at risk */
  gapAmberPts: number;
  gapRedPts: number;
  /** forecasts need at least this share (%) of the time used */
  minElapsedPct: number;
  /** an Epic counts as likely to deliver at this confidence (%) or more */
  likelyPct: number;
  /** named queries shown as chips under the Ask box */
  queries: ExecQuery[];
  /** calculated fields available to the queries */
  formulas: ExecFormula[];
}

export const defaultExec = (): ExecSettings => ({
  enabled: false, categoryFields: [], goLiveField: "", progress: [],
  doneStates: ["Done", "Closed", "Completed", "Resolved"], holdStates: ["On Hold", "Hold", "Blocked"], notStartedStates: ["New", "Proposed", "To Do"], ignoreStates: ["Removed", "Cancelled"],
  slipAmberDays: 7, slipRedDays: 30, gapAmberPts: 10, gapRedPts: 25, minElapsedPct: 25, likelyPct: 60, queries: [], formulas: [],
});

export const defaultSettings = (): PlannerSettings => ({
  version: 1, workItemType: "Epic", epicStartField: "", epicTargetField: "", ganttLabelField: "", ganttGroupFields: [], sources: [], estimateUnscheduled: true, capacityTeams: [],
  period: { kind: "year" }, thresholds: { spare: 50, healthy: 85, full: 100 }, colourMode: "rag", plan: { groupBy: "team", units: "h", view: "heat", rows: "collapsed", ganttTiles: ["epics", "progress", "ok", "late", "due30", "hold"] }, accessTeams: [], extraFilterFields: [], executive: defaultExec(),
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
