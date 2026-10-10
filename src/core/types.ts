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
  /** identity columns: also search groups (default true) */
  identityGroups?: boolean;
}

/** Push a column aggregate into a work item field. */
export interface TotalMapping {
  column: string;
  aggregate: Aggregate;
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

export interface GridConfig {
  columns: ColumnDef[];
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

export interface ProjectConfig {
  version: 1;
  rules: Rule[];
  cascades: Cascade[];
  grids: Record<string, GridConfig>;
}

export const emptyConfig = (): ProjectConfig => ({ version: 1, rules: [], cascades: [], grids: {} });
