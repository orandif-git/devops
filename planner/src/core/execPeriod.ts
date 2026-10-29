/** The period filter of the Executive Dashboard: which Epics count as "in" a stretch of time, by their dates. */
export type PeriodBasis = "active" | "golive" | "created" | "field";
export type PresetId = "thisQuarter" | "nextQuarter" | "thisYear" | "last12" | "next6" | "custom";
export interface Period { preset: PresetId; /** first and last day (YYYY-MM-DD) */ from: string; to: string; basis: PeriodBasis; /** also show Epics that have no date to judge by */ undated: boolean }
export const PRESETS: { id: PresetId; label: string }[] = [
  { id: "thisQuarter", label: "This quarter" }, { id: "nextQuarter", label: "Next quarter" }, { id: "thisYear", label: "This year" },
  { id: "last12", label: "Last 12 months" }, { id: "next6", label: "Next 6 months" }, { id: "custom", label: "Custom range" },
];
export const BASIS: Record<PeriodBasis, string> = { active: "Active in the period", golive: "Go-live in the period", created: "Created in the period", field: "Your date field in the period" };
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => Date.UTC(y, m, d);
const DAY = 86400000;

/** The first and last day of a preset, counted from `today` (custom keeps its own dates). */
export function rangeOf(preset: PresetId, today: Date, custom?: { from: string; to: string }): { from: string; to: string } {
  const y = today.getUTCFullYear(), m = today.getUTCMonth(), q = Math.floor(m / 3), t = utc(y, m, today.getUTCDate());
  switch (preset) {
    case "thisQuarter": return { from: iso(utc(y, q * 3, 1)), to: iso(utc(y, q * 3 + 3, 0)) };
    case "nextQuarter": return { from: iso(utc(y, q * 3 + 3, 1)), to: iso(utc(y, q * 3 + 6, 0)) };
    case "thisYear": return { from: iso(utc(y, 0, 1)), to: iso(utc(y, 12, 0)) };
    case "last12": return { from: iso(utc(y - 1, m, today.getUTCDate()) + DAY), to: iso(t) };
    case "next6": return { from: iso(t), to: iso(utc(y, m + 6, today.getUTCDate())) };
    default: return custom ?? { from: iso(utc(y, 0, 1)), to: iso(utc(y, 12, 0)) };
  }
}
export function makePeriod(preset: PresetId, basis: PeriodBasis, undated: boolean, today: Date, custom?: { from: string; to: string }): Period {
  return { preset, basis, undated, ...rangeOf(preset, today, custom) };
}

const day = (v?: string) => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(v ?? ""); return m ? Date.UTC(+m[1].slice(0, 4), +m[1].slice(5, 7) - 1, +m[1].slice(8, 10)) : undefined; };
/** The dates of one Epic that the period can use. */
export interface Dates { start?: number; goLive?: number; created?: number; field?: number }
/** "in" or "out" of the period, or "undated" when the Epic has no date to judge by. */
export function periodState(p: Period, d: Dates): "in" | "out" | "undated" {
  const a = day(p.from)!, b = day(p.to)! + DAY - 1;
  if (p.basis === "active") {
    const s = d.start ?? d.goLive, e = d.goLive ?? d.start;
    if (s === undefined || e === undefined) return "undated";
    return s <= b && e >= a ? "in" : "out";
  }
  const v = p.basis === "golive" ? d.goLive : p.basis === "created" ? d.created : d.field;
  if (v === undefined) return "undated";
  return v >= a && v <= b ? "in" : "out";
}
export const parseDay = day;

const fmt = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
/** A short name for the chip: "This quarter · active" or "1 Oct 2026 – 31 Dec 2026 · go-live". */
export function periodLabel(p: Period, fieldLabel = "date field"): string {
  const name = p.preset === "custom" ? `${fmt(p.from)} – ${fmt(p.to)}` : PRESETS.find(x => x.id === p.preset)?.label ?? "Period";
  return `${name} · ${p.basis === "active" ? "active" : p.basis === "golive" ? "go-live" : p.basis === "created" ? "created" : fieldLabel}`;
}

/** Read a stored period (saved view, shared link); anything unusable gives no period. */
export function normalizePeriod(raw: unknown, today: Date): Period | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>, preset = PRESETS.some(x => x.id === r.preset) ? (r.preset as PresetId) : undefined;
  const basis = (["active", "golive", "created", "field"] as const).find(b => b === r.basis) ?? "active";
  if (!preset) return undefined;
  const custom = typeof r.from === "string" && typeof r.to === "string" && day(r.from) !== undefined && day(r.to) !== undefined && r.from <= r.to ? { from: r.from, to: r.to } : undefined;
  if (preset === "custom" && !custom) return undefined;
  return makePeriod(preset, basis, r.undated === true, today, custom);       // a relative period (this quarter) is counted from today again
}
