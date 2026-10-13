import { extractJson } from "../../../src/core/gridModel";

export type Kind = "person" | "date" | "number" | "text" | "empty";
export interface ColumnGuess { key: string; kind: Kind; sample: string; rows: number }

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
  const by = new Map<string, { kinds: Map<Kind, number>; sample: string; rows: number }>();
  let scheduled = 0;
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const row = r as Record<string, unknown>;
    if (row._months && typeof row._months === "object") scheduled++;
    for (const [k, v] of Object.entries(row)) {
      if (k.startsWith("_")) continue;
      const e = by.get(k) ?? { kinds: new Map(), sample: "", rows: 0 };
      const kind = kindOf(v);
      if (kind !== "empty") { e.kinds.set(kind, (e.kinds.get(kind) ?? 0) + 1); e.rows++; if (!e.sample) e.sample = String(v).slice(0, 60); }
      by.set(k, e);
    }
  }
  const columns = Array.from(by, ([key, e]) => ({ key, kind: (Array.from(e.kinds).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "empty") as Kind, sample: e.sample, rows: e.rows }));
  return { columns, rows: rows.length, scheduled };
}
