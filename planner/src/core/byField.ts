import { ChartType } from "./types";

/** The chart "Auto" picks for a field: bars up to 12 values, a sortable table above that. */
export const AUTO_BARS_MAX = 12;
export const autoChart = (values: number): Exclude<ChartType, "auto"> => (values <= AUTO_BARS_MAX ? "bars" : "table");

const RANK_WORDS = new Set(["critical", "blocker", "urgent", "highest", "high", "medium", "normal", "low", "lowest", "minor", "trivial"]);
/** Does a field look ordered (P1 / P2…, 1 – Critical, High / Medium / Low)? Then its values are shown in their natural order, not by size. */
export function looksOrdered(values: string[]): boolean {
  const v = values.filter(x => x && x.trim());
  if (v.length < 2) return false;
  return v.every(x => /^(p|s|t|l)?\s?\d+([\s.):-]|$)/i.test(x.trim())) || v.every(x => RANK_WORDS.has(x.trim().toLowerCase().split(/[\s-]/)[0]));
}
/** Natural order for an ordered field: numbers inside the text count as numbers. */
export const naturalSort = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
const RANK = ["blocker", "critical", "urgent", "highest", "high", "medium", "normal", "low", "lowest", "minor", "trivial"];
export const orderedSort = (a: string, b: string) => { const ra = RANK.indexOf(a.trim().toLowerCase().split(/[\s-]/)[0]), rb = RANK.indexOf(b.trim().toLowerCase().split(/[\s-]/)[0]); return ra >= 0 && rb >= 0 ? ra - rb : naturalSort(a, b); };
