export type ColumnType = "string" | "number" | "boolean" | "date" | "dropdown" | "identity";
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

export interface GridConfig {
  columns: ColumnDef[];
  breakdowns?: Breakdown[];
  /** field that stores the JSON; falls back to the control's DataField input */
  dataField?: string;
  totals?: TotalMapping[];
  child?: ChildConfig;
  readOnly?: boolean;
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
  | { kind: "grid"; grid: string; column: string; aggregate: Aggregate; where?: RowFilter[] };

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
}

export const emptyConfig = (): ProjectConfig => ({ version: 1, rules: [], cascades: [], grids: {}, calculations: [], lookups: {} });
