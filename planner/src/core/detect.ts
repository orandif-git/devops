import { extractJson } from "../../../src/core/gridModel";

export type Kind = "person" | "date" | "number" | "text" | "empty";
export interface ColumnGuess { key: string; kind: Kind; sample: string; rows: number; /** the different values of a text column (up to 20 short ones), e.g. the statuses */ values: string[] }

const kindOf = (v: unknown): Kind => {
  if (v === null || v === undefined || v === "") return "empty";
  if (typeof v === "number") return "number";
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return "date";
  if (/<[^<>]+>\s*$/.test(s)) return "person";
  if (/^-?\d+([.,]\d+)?$/.test(s)) return "number";
  return "text";
};

/** The keys found in the rows of one Epic's grid, with what their values look like, so the administrator can pick columns instead of typing ids. */
export function detectColumns(raw: string): { columns: ColumnGuess[]; rows: number; scheduled: number } | { error: string } {
  let data: unknown;
  try { data = extractJson(String(raw ?? "").trim()); } catch { return { error: "The field does not contain a grid (it is not valid JSON)." }; }
  const rows = Array.isArray(data) ? data : Array.isArray((data as { rows?: unknown })?.rows) ? (data as { rows: unknown[] }).rows : null;
  if (!rows) return { error: "The field does not contain grid rows." };
  const by = new Map<string, { kinds: Map<Kind, number>; sample: string; rows: number; values: Set<string> }>();
  let scheduled = 0;
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const row = r as Record<string, unknown>;
    if (row._months && typeof row._months === "object") scheduled++;
    for (const [k, v] of Object.entries(row)) {
      if (k.startsWith("_")) continue;
      const e = by.get(k) ?? { kinds: new Map(), sample: "", rows: 0, values: new Set<string>() };
      const kind = kindOf(v);
      if (kind !== "empty") { e.kinds.set(kind, (e.kinds.get(kind) ?? 0) + 1); e.rows++; if (!e.sample) e.sample = String(v).slice(0, 60); if (kind === "text" && e.values.size < 20 && String(v).length <= 40) e.values.add(String(v).trim()); }
      by.set(k, e);
    }
  }
  const columns = Array.from(by, ([key, e]) => ({ key, kind: (Array.from(e.kinds).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "empty") as Kind, sample: e.sample, rows: e.rows, values: Array.from(e.values) }));
  return { columns, rows: rows.length, scheduled };
}

// ---------------- automatic mapping ----------------
export type Slot = "resource" | "start" | "end" | "effort" | "allocation" | "status" | "task";
export type Mapping = Partial<Record<Slot, string>>;
const RE = {
  person: /resource|person|people|assignee|owner|member|user|employee|engineer/i,
  start: /start|begin|from|kick/i, end: /end|finish|due|until|target|complete|to$/i,
  effort: /hour|effort|man.?day|days|duration|estimate|work/i, allocation: /alloc|percent|pct|%|load|util/i,
  status: /status|review|approv|state/i, task: /activity|task|phase|desc|title|name|item|deliverable/i,
};

/**
 * Pick the columns of a grid from what the values look like and what the column ids say:
 * the person column, the two date columns, effort and allocation among the numbers, status and task among the text columns.
 * A slot with no convincing candidate stays empty (the administrator picks it).
 */
export function autoMap(columns: ColumnGuess[]): Mapping {
  const out: Mapping = {};
  const used = new Set<string>();
  const take = (slot: Slot, c: ColumnGuess | undefined) => { if (c && !used.has(c.key)) { out[slot] = c.key; used.add(c.key); } };
  const by = (kind: Kind) => columns.filter(c => c.kind === kind && !used.has(c.key)).sort((a, b) => b.rows - a.rows);
  take("resource", by("person")[0] ?? by("text").find(c => RE.person.test(c.key)));
  const dates = by("date");
  const start = dates.find(c => RE.start.test(c.key)) ?? dates.find(c => !RE.end.test(c.key));
  take("start", start);
  take("end", by("date").find(c => RE.end.test(c.key)) ?? by("date")[0]);
  take("allocation", by("number").find(c => RE.allocation.test(c.key)));
  take("effort", by("number").find(c => RE.effort.test(c.key)) ?? by("number")[0]);
  take("status", by("text").find(c => RE.status.test(c.key) && c.values.length > 0 && c.values.length <= 12));
  take("task", by("text").find(c => RE.task.test(c.key)) ?? by("text")[0]);
  return out;
}
