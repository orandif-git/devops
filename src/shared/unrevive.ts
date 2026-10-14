/**
 * Some Azure DevOps versions (seen on Server 2020) hand back stored text that looks like an ISO date-time ("2026-10-14T09:30:00.000Z")
 * as a Date object instead of a string. Everything in this extension stores and expects plain text, so turn Dates back into the same ISO text.
 * Objects and arrays are walked; everything else is returned unchanged.
 */
export function unrevive<T>(v: T): T {
  if (v instanceof Date) return (isNaN(v.getTime()) ? "" : v.toISOString()) as unknown as T;
  if (Array.isArray(v)) return v.map(x => unrevive(x)) as unknown as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = unrevive(x);
    return out as T;
  }
  return v;
}
