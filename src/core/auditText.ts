import { AuditChange, AuditEntry } from "./audit";

/** Plain-language wording of the stored changes (the stored before/after values stay as they are). */
export interface Human { kind: "added" | "removed" | "changed" | "reordered"; text: string }

const LABEL: Record<string, string> = {
  name: "name", type: "type", required: "required", defaultValue: "default value", options: "dropdown values", formula: "formula", total: "footer total", min: "minimum", max: "maximum",
  readOnly: "read-only", title: "title", dataField: "data field", enabled: "enabled", workItemTypes: "work item types", teams: "teams", people: "people", allowedFields: "fields that stay editable", fields: "fields", mode: "mode",
  message: "message", resource: "resource column", start: "start column", end: "end column", effort: "effort column", allocation: "allocation column", defaultAllocation: "default allocation %",
  source: "source", capacityTeams: "capacity teams", defaultHours: "default hours per month", calendar: "calendar", workingDays: "working days", hoursPerDay: "hours per day", holidays: "holidays",
  displayFormat: "display format", teamFrom: "team from group", lookup: "auto-fill", derive: "derived from", overrides: "overrides", map: "mapping", fallback: "fallback", description: "description",
  conditions: "conditions", then: "actions", otherwise: "otherwise actions", when: "condition", field: "field", value: "value", values: "values", id: "id", presets: "presets", approvers: "approver rules",
  statuses: "status wording", overall: "overall status", timeZone: "time zone", resetOnEdit: "reset on edit", lockApproved: "lock approved rows", noSelfApproval: "no self-approval", secure: "secure approvals", admins: "grid administrators",
  retentionMonths: "months kept", clearedOlderThanMonths: "entries cleared older than (months)", exported: "exported first",
};
const SINGULAR: Record<string, string> = { controls: "control rule", grids: "grid", columns: "column", rules: "rule", cascades: "dependent dropdown", calculations: "calculation", lookups: "mapping", totals: "total", presets: "preset", approvers: "approver rule", breakdowns: "group", inputs: "input", conditions: "condition" };
const TYPE: Record<string, string> = { boolean: "checkbox", string: "text", number: "number", date: "date", dropdown: "dropdown", identity: "person", calculated: "calculated" };
const ROOT: Record<string, string> = { controls: "Controls", commentOnly: "Controls › Comment-only access", capacityRegister: "Capacity register", config: "Settings", capacitySettings: "Capacity settings", restoredFrom: "Restored from" };
const CAPACITY_KEYS = new Set(["source", "capacityTeams", "defaultHours", "calendar"]);

const words = (k: string) => LABEL[k] ?? (/^[a-z]+([A-Z][a-z0-9]*)+$/.test(k) ? k.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase() : k);   // camelCase setting names become words; names typed by people stay as typed
const quote = (s: string) => `“${s}”`;

function parse(v: string): unknown {
  if (v === "(not set)" || v === "(not in the list)" || v === "(no longer in the list)") return undefined;
  if (v === "true" || v === "false") return v === "true";
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (/^[\[{]/.test(v) && !v.endsWith("…")) { try { return JSON.parse(v); } catch { /* shown as text */ } }
  return v;
}

/** One value in words: text in quotes, Yes/No, lists joined, objects as "label: value; …". */
export function showValue(v: unknown, depth = 0): string {
  if (v === undefined || v === null || v === "") return "not set";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return /^(removed|added): /.test(v) ? v : quote(v);
  if (Array.isArray(v)) {
    if (!v.length) return "none";
    return v.map(x => (typeof x === "object" && x && "name" in x ? quote(String((x as { name: unknown }).name)) : showValue(x, depth + 1))).join(", ");
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (depth >= 2) return "…";
    const parts = Object.entries(o).filter(([k, x]) => x !== undefined && k !== "id").map(([k, x]) => `${words(k)}: ${k === "type" && typeof x === "string" ? (TYPE[x] ?? x) : showValue(x, depth + 1)}`);
    return parts.join("; ") || "empty";
  }
  return String(v);
}

function tokens(path: string): { key?: string; id?: string }[] {
  const out: { key?: string; id?: string }[] = [];
  for (const m of path.matchAll(/([^.[\]]+)|\[([^\]]*)\]/g)) out.push(m[2] !== undefined ? { id: m[2] } : { key: m[1] });
  return out;
}

/** "grids.SDLC Timesheet.columns[col15].options" → parent "Grid “SDLC Timesheet” › Column “col15”", leaf "dropdown values" */
export function subjectOf(path: string, area?: AuditEntry["area"]): { text: string; parent: string; leaf: string } {
  const t = tokens(path);
  const parts: string[] = [];
  let prefix = "";
  let i = 0;
  if (t[0]?.key && ROOT[t[0].key]) { prefix = ROOT[t[0].key]; i = 1; if (t[0].key === "config" || t[0].key === "capacityRegister") { /* keep the next segment */ } }
  else if (t[0]?.key && CAPACITY_KEYS.has(t[0].key) && area === "capacity-settings") prefix = "Capacity settings";
  for (; i < t.length; i++) {
    const x = t[i];
    if (x.key) {
      const next = t[i + 1];
      const listed = SINGULAR[x.key] && (next?.id !== undefined || ((x.key === "grids" || x.key === "lookups") && next?.key !== undefined));
      if (listed) {
        const name = next!.id ?? next!.key;
        parts.push(`${SINGULAR[x.key][0].toUpperCase()}${SINGULAR[x.key].slice(1)} ${quote(String(name))}`);
        i++;
      } else parts.push(words(x.key));
    } else if (x.id !== undefined) parts.push(quote(x.id));
  }
  const all = [prefix, ...parts].filter(Boolean);
  const leaf = parts.length ? parts[parts.length - 1] : prefix;
  const parent = [prefix, ...parts.slice(0, -1)].filter(Boolean).join(" › ");
  return { text: all.join(" › ") || path, parent, leaf };
}

const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

/** A stored change as one readable sentence. */
export function describeChange(c: AuditChange, area?: AuditEntry["area"]): Human {
  const s = subjectOf(c.path, area);
  const before = parse(c.before), after = parse(c.after);
  // dropdown / list values: say which value was added or removed
  const addedItem = /^added: (.*)$/s.exec(c.after), removedItem = /^removed: (.*)$/s.exec(c.before);
  if (c.before === "(not in the list)" && addedItem) return { kind: "added", text: `${s.text}: added ${quote(addedItem[1])}` };
  if (removedItem && c.after === "(no longer in the list)") return { kind: "removed", text: `${s.text}: removed ${quote(removedItem[1])}` };
  const whole = (v: unknown, verb: "Added" | "Removed"): string => {
    const o = typeof v === "object" && v && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
    if (o && /“[^”]*”$/.test(s.leaf)) {                                   // an item of a list: a column, rule, mapping…
      const named = typeof o.name === "string" ? s.leaf.replace(/“[^”]*”$/, quote(o.name)) : s.leaf;
      const type = typeof o.type === "string" ? ` (${TYPE[o.type] ?? o.type})` : "";
      return `${verb} ${lowerFirst(named)}${type}${s.parent ? (verb === "Added" ? " to " : " from ") + s.parent : ""}`;
    }
    return verb === "Added" ? `${s.text}: set to ${showValue(v)}` : `Removed ${s.text}${typeof v === "object" ? "" : ` (was ${showValue(v)})`}`;
  };
  if (before === undefined && after !== undefined) return { kind: "added", text: typeof after === "object" ? whole(after, "Added") : `${s.text}: set to ${showValue(after)}` };
  if (before !== undefined && after === undefined) return { kind: "removed", text: whole(before, "Removed") };
  if (JSON.stringify(before) === JSON.stringify(after)) return { kind: "reordered", text: `${s.text}: order changed` };
  return { kind: "changed", text: `${s.text}: changed from ${showValue(before)} to ${showValue(after)}` };
}

// ---------------- one table row per change ----------------

export interface Row { kind: Human["kind"]; where: string; before: string; after: string }
const NONE = "—";

/** Values for the Before / After columns: plain text (no quotes), Yes/No, lists joined, objects as "label: value; …". */
export function plain(v: unknown): string {
  if (v === undefined || v === null || v === "") return NONE;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if (typeof o.name === "string" && typeof o.type === "string" && Object.keys(o).every(k => ["id", "name", "type"].includes(k))) return `${TYPE[o.type] ?? o.type} “${o.name}”`;
  }
  return showValue(v).replace(/^“(.*)”$/s, "$1");
}

/** A stored change split into where it is, what it was and what it is now. */
export function rowOf(c: AuditChange, area?: AuditEntry["area"]): Row {
  const s = subjectOf(c.path, area);
  const before = parse(c.before), after = parse(c.after);
  const addedItem = /^added: (.*)$/s.exec(c.after), removedItem = /^removed: (.*)$/s.exec(c.before);
  if (c.before === "(not in the list)" && addedItem) return { kind: "added", where: s.text, before: NONE, after: addedItem[1] };
  if (removedItem && c.after === "(no longer in the list)") return { kind: "removed", where: s.text, before: removedItem[1], after: NONE };
  const itemWhere = (v: unknown) => {                                    // an item of a list (a column, rule, mapping…): show it by its name and type
    const o = typeof v === "object" && v && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
    if (!o || !/“[^”]*”$/.test(s.leaf)) return s.text;
    const named = typeof o.name === "string" ? s.leaf.replace(/“[^”]*”$/, quote(o.name)) : s.leaf;
    const type = typeof o.type === "string" ? ` (${TYPE[o.type] ?? o.type})` : "";
    return [s.parent, named + type].filter(Boolean).join(" › ");
  };
  if (before === undefined && after !== undefined) return { kind: "added", where: itemWhere(after), before: NONE, after: plain(after) };
  if (before !== undefined && after === undefined) return { kind: "removed", where: itemWhere(before), before: plain(before), after: NONE };
  if (JSON.stringify(before) === JSON.stringify(after)) return { kind: "reordered", where: s.text, before: "order", after: "different order" };
  return { kind: "changed", where: s.text, before: plain(before), after: plain(after) };
}
