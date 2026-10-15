export type ColumnType = "string" | "number" | "boolean" | "date" | "dropdown" | "identity" | "calculated";
export type StatusColor = "green" | "yellow" | "orange" | "red" | "blue" | "gray";

/** One band of a status column: values up to `upTo` (inclusive; null = no upper limit) get this label and colour. */
export interface StatusBand { upTo: number | null; label: string; color: StatusColor }

export type Aggregate = "sum" | "avg" | "min" | "max" | "count";

export interface ColumnDef {
  id: string;
  name: string;
  type: ColumnType;
  required?: boolean;
  defaultValue?: unknown;
  /** dropdown options */
  options?: string[];
  /** dependent dropdown: options depend on the value of another column in the same row */
  dependsOn?: { column: string; map: Record<string, string[]> };
  /** row formula, e.g. `[qty] * [price]`; makes the column read-only and computed */
  formula?: string;
  /** footer aggregate shown under the column */
  total?: Aggregate;
  min?: number;
  max?: number;
  width?: number;
  /** not shown in the grid; the column is still computed, saved and usable by formulas, totals and status columns (for example helper columns behind a rating) */
  hidden?: boolean;
  /**
   * Auto-fill: value is looked up from another column of the same row (read-only, computed).
   * e.g. Phase = lookup of "SDLC Activity": { "Idea generation": "Discovery", ... }
   */
  lookup?: {
    column: string;
    map: Record<string, string>;
    fallback?: string;
    /** name of a shared Mapping (project level); when set, map/fallback come from it */
    table?: string;
  };
  /**
   * Auto-fill overrides: when the checkbox column `when` is ticked, the column gets `value` instead of the lookup result.
   * The first ticked rule wins. Only used together with `lookup`.
   */
  overrides?: { when: string; value: string }[];
  /**
   * Status column: text label chosen from the number in column `source` by ranges, e.g. 0-70 Available, 70-90 Near Capacity.
   * Ranges are checked in order; the first with value <= upTo wins; the last should have upTo = null.
   */
  statusBands?: { source: string; ranges: StatusBand[] };
  /** Colour this cell like the status of the status column with this id (e.g. tint "Utilization %" by "Capacity Status"). */
  colorBy?: string;
  /** Derived grids: hours the same person has on ALL OTHER Epics in that month (from the central allocation store). Read-only. */
  others?: { resource: string; period: string };
  /** Derived grids: value is the person's available hours for that month, looked up in the central Capacity register (read-only). */
  capacity?: { resource: string; period: string };
  /**
   * Fills itself with the names of the Azure DevOps teams / groups (of those listed) the person in column `resource` belongs to,
   * e.g. "Transformation Unit, NFR". Read-only. Direct team members only.
   */
  /** how a month/date is shown in read-only cells and exports (e.g. MM-YYYY, MMM-YY); the stored value does not change */
  displayFormat?: string;
  teamFrom?: { resource: string; teams: { id: string; name: string }[]; /** users may type a different value; it is kept until the resource changes or the cell is cleared */ allowOverride?: boolean };
  /** Derived grids: the person's team(s) from the capacity source (Azure DevOps team capacity or the register). Read-only. */
  teamOf?: { resource: string };
  /** calculated columns: decimals of numeric results (default 2) */
  decimals?: number;
  /** calculated columns: an empty numeric input blanks the result (default) or counts as 0 */
  onEmpty?: "blank" | "zero";
  /** calculated columns: division by zero blanks the result (default) or gives 0 */
  onDivZero?: "blank" | "zero";
  /**
   * Derived grids only: where this column's value comes from in the source grid.
   * key = group key (one derived row per distinct combination of the key columns),
   * first = first non-empty source value in the group, agg = aggregate of a source column.
   */
  derive?: {
    role: "key" | "first" | "agg"; source: string; aggregate?: Aggregate; bucket?: "day" | "month" | "quarter" | "year";
    /** agg only: the user may type a different value for a row (kept per row; clear the cell to go back to the calculated one) */
    adjustable?: boolean;
  };
  /** identity columns: also search groups (default true) */
  identityGroups?: boolean;
}

/** Only rows whose `column` value is one of `values` (case-insensitive) take part. */
export interface RowFilter { column: string; values: string[] }

/** Push a column aggregate into a work item field. */
export interface TotalMapping {
  column: string;
  aggregate: Aggregate;
  /** group/filter: e.g. sum of Hours where Treatment = Capitalizable */
  where?: RowFilter;
  /** display name, e.g. "Capitalizable man-hours" */
  label?: string;
  /** work item field reference name, e.g. Microsoft.VSTS.Scheduling.OriginalEstimate */
  field: string;
}

/** Create child work items from grid rows. */
export interface ChildConfig {
  enabled: boolean;
  workItemType: string;
  /** column whose value becomes System.Title */
  titleColumn: string;
  /** column id -> work item field ref name */
  fieldMap: Record<string, string>;
}

/** Display-only grouping: one figure per distinct value of `by`, e.g. hours by Treatment. */
export interface Breakdown {
  by: string;
  column: string;
  aggregate: Aggregate;
  label?: string;
  /** group value -> work item field to write that group's figure to (0 when the group has no rows) */
  fields?: Record<string, string>;
}

/** A team or person reference used in approval settings. */
export interface TeamRef { id: string; name: string }

/** Who may approve / reject which rows. A rule applies to a row when its `when` condition holds (no condition = every row). */
export interface ApproverRule {
  id: string;
  name: string;
  teams: TeamRef[];
  /** "Display Name <sign-in>" – used when teams cannot be read */
  people: string[];
  when?: { column: string; values: string[] };
}

/** Approve / reject / pending review of every row, by the people you choose. */
export interface ReviewConfig {
  /** column that holds the status (text); changed by the Approve / Reject buttons, not typed */
  statusColumn: string;
  /** optional columns filled in when someone decides: who, when, and a reason the approver may type */
  byColumn?: string;
  atColumn?: string;
  reasonColumn?: string;
  statuses: { pending: string; approved: string; rejected: string };
  /** an edited approved / rejected row goes back to pending review (the review columns themselves do not count) */
  /** write one overall status for the whole grid (e.g. "Approved", "Partially approved") to a text field of the work item */
  overall?: {
    field: string;
    /** the words written for each outcome; an empty or missing label uses the default */
    labels?: Partial<Record<"none" | "pending" | "partial" | "approved" | "rejected", string>>;
    /** any rejected row makes the overall status "rejected" (default); otherwise rejected rows simply count as not yet approved */
    rejectedWins?: boolean;
  };
  /** time zone (IANA name, e.g. "Asia/Qatar") in which the "reviewed at" time is written; empty = UTC */
  timeZone?: string;
  resetOnEdit: boolean;
  /** an approved row cannot be edited, moved or deleted except by administrators */
  lockApproved: boolean;
  /** the person on the row cannot decide their own row */
  noSelfApproval: boolean;
  approvers: ApproverRule[];
  /**
   * Secure approvals: decisions are kept in this separate long-text field instead of in the rows. Make that field read-only
   * for everyone but the approvers with a process rule, and Azure DevOps itself blocks anyone else from approving. Each approval
   * stores a fingerprint of the row, so a row that is changed after approval counts as pending again, by whatever means it was changed.
   */
  secure?: { dataField: string };
  /** besides project administrators: may decide every row and edit / remove locked rows */
  admins: { teams: TeamRef[]; people: string[] };
}

/** A named set of ready-made rows a user can load into a grid with one click (e.g. the standard SDLC activities). */
export interface GridPreset {
  id: string;
  name: string;
  /** ids of the columns this preset keeps (the others, e.g. person and dates, stay blank) */
  columns: string[];
  rows: Record<string, unknown>[];
  /** only offered on work items whose field has one of the values, ALL conditions must hold; empty = offered everywhere */
  when?: { field: string; values: string[] }[];
}

export interface GridConfig {
  columns: ColumnDef[];
  /** approve / reject / pending review per row */
  review?: ReviewConfig;
  /** ready-made rows, loaded with the "Load preset" button */
  presets?: GridPreset[];
  /** let people save the current rows as a preset from the work item ("Save as preset") */
  presetSave?: { enabled: boolean; teams: { id: string; name: string }[]; admins: boolean };
  breakdowns?: Breakdown[];
  /** tint every row by the status of this status column (id), e.g. each resource's row coloured by its Capacity Status */
  rowColorBy?: string;
  /**
   * Enter Start date + Effort (+ Allocation %) instead of a month: the End date and the hours per month are calculated
   * from the person's calendar. Derived grids of this grid use the virtual source columns `_month` and `_hours`.
   */
  schedule?: { resource: string; start: string; effort: string; allocation?: string; end: string; /** allocation % used when the cell is empty and for new rows (default 100) */ defaultAllocation?: number };
  /** this grid is built automatically from another grid's rows (see ColumnDef.derive) */
  derived?: {
    source: string;
    /** which source rows count when the source grid has approvals: all (default), all but rejected, or only approved */
    rows?: "all" | "notRejected" | "approved";
  };
  /** publish this grid's hours (per person and month) to the central store so other Epics can see them */
  allocation?: { resource: string; period: string; hours: string };
  /** field that stores the JSON; falls back to the control's DataField input */
  dataField?: string;
  totals?: TotalMapping[];
  child?: ChildConfig;
  readOnly?: boolean;
  /** show the Import (CSV / Excel) button on the grid (default false: only Export is offered) */
  allowImport?: boolean;
  /** block saving the work item while required/invalid cells exist (default false: highlight only) */
  blockSave?: boolean;
}

export interface GridRow {
  _id: string;
  /** id of the child work item created from this row, once created */
  _childId?: number;
  [column: string]: unknown;
}

// ---------------- rules ----------------

export type Operator =
  | "equals" | "notEquals" | "contains" | "notContains" | "startsWith"
  | "in" | "notIn" | "empty" | "notEmpty" | "gt" | "gte" | "lt" | "lte" | "under";

export interface Condition {
  field: string;
  op: Operator;
  /** string; for `in`/`notIn` a comma separated list */
  value?: string;
}

export interface ConditionGroup {
  match: "all" | "any";
  conditions: Condition[];
}

export type Action =
  | { type: "setValue"; field: string; value: string }
  | { type: "requireField"; field: string; message?: string }
  | { type: "restrictValues"; field: string; values: string[]; message?: string }
  | { type: "error"; message: string };

export interface Rule {
  id: string;
  name: string;
  enabled: boolean;
  /** empty = all work item types */
  workItemTypes: string[];
  when: ConditionGroup;
  then: Action[];
  otherwise?: Action[];
}

/** Dependent dropdown: values of `child` depend on the value of `parent`. */
export interface Cascade {
  id: string;
  parent: string;
  child: string;
  workItemTypes: string[];
  map: Record<string, string[]>;
  /** optionally pre-fill the parent from the Area Path */
  hints?: { areaPathUnder: string; parentValue: string }[];
}

// ---------------- calculations ----------------

export type EmptyHandling = "inherit" | "blank" | "zero";

export type CalcSource =
  | { kind: "field"; field: string }
  /** figure from a Smart Grid on the same work item; `where` conditions are ANDed */
  | { kind: "grid"; grid: string; column: string; aggregate: Aggregate; where?: RowFilter[] }
  /**
   * Group rows by `groupBy`, aggregate `column` per group, and return the group (text) or its figure
   * of the highest / lowest group. e.g. "Team with the most Hours".
   */
  | {
      kind: "top"; grid: string; groupBy: string; column: string; aggregate: Aggregate; where?: RowFilter[];
      pick?: "max" | "min"; return?: "group" | "value";
      /** group a date column by month / quarter / year / day (default day) */
      bucket?: "day" | "month" | "quarter" | "year";
    };

export interface CalcInput {
  /** variable name used in the formula, e.g. CapexHours */
  name: string;
  source: CalcSource;
  /** what to do when the input has no value; "inherit" uses the calculation's default */
  onEmpty?: EmptyHandling;
}

export interface Calculation {
  id: string;
  name: string;
  enabled: boolean;
  /** empty = all work item types */
  workItemTypes: string[];
  inputs: CalcInput[];
  /** e.g. CapexHours / TotalHours * 100 */
  formula: string;
  resultField: string;
  /** rounding for numeric results (default 2) */
  decimals?: number;
  /** default for inputs with no value: blank the result, or treat the input as 0 */
  onEmpty: "blank" | "zero";
  /** division by zero: blank the result or give 0 */
  onDivZero: "blank" | "zero";
  /** always: rewrite on every recalculation; whenEmpty: only fill the field while it is empty */
  mode: "always" | "whenEmpty";
}

/** Shared mapping maintained once per project, e.g. Team -> Resource type. */
export interface LookupTable {
  map: Record<string, string>;
  /** category for values not listed in the map */
  fallback?: string;
  description?: string;
}

export interface ProjectConfig {
  version: 1;
  /** shared mappings referenced by grid columns (ColumnDef.lookup.table) */
  lookups: Record<string, LookupTable>;
  rules: Rule[];
  cascades: Cascade[];
  grids: Record<string, GridConfig>;
  calculations: Calculation[];
  /** who may not edit what on the work item form: any number of rules, each for its own people/teams, work item types and fields */
  controls?: ControlRule[];
  /** older single comment-only rule; read once and converted to a rule in `controls` */
  commentOnly?: CommentOnlyConfig;
}

export interface CommentOnlyConfig {
  enabled: boolean;
  /** work item types the restriction applies to (empty = all) */
  workItemTypes: string[];
  teams: { id: string; name: string }[];
  /** "Name <sign-in>" */
  people: string[];
  /** fields that stay editable (reference names); the discussion is always allowed */
  allowedFields: string[];
  message?: string;
}

export type ControlMode = "comments" | "lock";
/** One control rule. "comments": the people can only add comments (every other field change is undone) except the `fields` listed. "lock": the people cannot change the `fields` listed; everything else stays editable. */
export interface ControlRule {
  id: string;
  name: string;
  enabled: boolean;
  mode: ControlMode;
  /** work item types the rule applies to (empty = all) */
  workItemTypes: string[];
  teams: { id: string; name: string }[];
  /** "Name <sign-in>" */
  people: string[];
  /** comments mode: fields that stay editable; lock mode: fields that cannot be edited (reference names) */
  fields: string[];
  message?: string;
}

export const emptyConfig = (): ProjectConfig => ({ version: 1, rules: [], cascades: [], grids: {}, calculations: [], lookups: {} });
