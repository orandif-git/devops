import type { Timelines } from "./asof";

/** The delivery stages of an Epic (for example Design, Development, SIT, UAT, Deployment), mapped from a field and/or the state. They are the core of how progress is measured. */
export interface StageDef { name: string; /** what an Epic in this stage counts as, in percent */ pct: number; /** the share of the Epic's time (start to go-live), in percent, in which it should be in this stage */ from: number; to: number }
export interface StageSettings {
  source: "field" | "state" | "both"; field: string;
  stages: StageDef[];
  /** value of the field or state (as found) -> stage name, or "(ignore)" */
  map: Record<string, string>;
  /** move progress inside a stage with the time of its planned window instead of jumping in steps */
  smooth: boolean;
  /** behind for the stage: Needs attention / At risk when the Epic is this many stages behind the stage it should be in for the time used */
  lagRule: boolean; lagAmber: number; lagRed: number;
  /** Needs attention when an Epic has been in a stage for more than this many days */
  stuckRule: boolean; stuckDays: number;
}
export const IGNORE = "(ignore)";
export const defaultStages = (): StageSettings => ({ source: "both", field: "", stages: [], map: {}, smooth: false, lagRule: true, lagAmber: 1, lagRed: 2, stuckRule: true, stuckDays: 45 });
/** Stages are in use once at least one stage and one mapped value exist; until then progress works as before (the other progress sources). */
export const stagesOn = (s: StageSettings) => s.stages.length > 0 && Object.keys(s.map).length > 0;

/** An even set of stages: progress rising in steps, each stage with an equal share of the time. */
export function evenStages(names: string[]): StageDef[] {
  const n = names.length;
  return names.map((name, i) => ({ name, pct: Math.round(100 * (i + 1) / (n + 1)), from: Math.round(100 * i / n), to: Math.round(100 * (i + 1) / n) }));
}

const key = (v: string) => v.trim().toLowerCase();
/** The value the stage is read from: the field, the state, or the field first and the state when it is empty. */
export function rawValue(e: { state: string; extra: Record<string, string> }, s: StageSettings): string {
  const f = s.field ? (e.extra[s.field] ?? "").trim() : "";
  return s.source === "state" ? e.state.trim() : s.source === "field" ? f : f || e.state.trim();
}
export interface Resolved { value: string; kind: "stage" | "ignore" | "unmapped" | "none"; idx: number; stage?: StageDef }
export function resolveStage(e: { state: string; extra: Record<string, string> }, s: StageSettings): Resolved {
  const value = rawValue(e, s);
  if (!value) return { value, kind: "none", idx: -1 };
  const m = Object.entries(s.map).find(([k]) => key(k) === key(value))?.[1];
  if (!m) return { value, kind: "unmapped", idx: -1 };
  if (m === IGNORE) return { value, kind: "ignore", idx: -1 };
  const idx = s.stages.findIndex(d => key(d.name) === key(m));
  return idx < 0 ? { value, kind: "unmapped", idx: -1 } : { value, kind: "stage", idx, stage: s.stages[idx] };
}

/** Progress of an Epic in a stage; with smoothing it moves from the stage's value towards the next one's as the planned window of the stage passes (elapsed = share of the time used, 0–1). */
export function stageProgress(s: StageSettings, idx: number, elapsed?: number): number {
  const d = s.stages[idx]; if (!d) return 0;
  if (!s.smooth || elapsed === undefined || d.to <= d.from) return d.pct;
  const next = s.stages[idx + 1]?.pct, share = Math.max(0, Math.min(1, (elapsed * 100 - d.from) / (d.to - d.from)));
  return next === undefined || next <= d.pct ? d.pct : Math.round(d.pct + (next - d.pct) * share * 0.95);
}
/** The stage an Epic should be in for the share of its time used (0–1): the last one whose planned window has started. */
export function expectedIdx(s: StageSettings, elapsed: number): number {
  let idx = 0; const e = elapsed * 100;
  s.stages.forEach((d, i) => { if (e >= d.from) idx = i; });
  return idx;
}

/** When each Epic entered the stage it is in now, from the history of the field and/or the state. */
export function stageSince(tl: Timelines, s: StageSettings): Record<number, number> {
  const out: Record<number, number> = {};
  const name = (v: Record<string, string>) => { const r = resolveStage({ state: v["System.State"] ?? "", extra: s.field ? { [s.field]: v[s.field] ?? "" } : {} }, s); return r.kind === "stage" ? r.stage!.name : ""; };
  for (const [id, pts] of Object.entries(tl)) {
    let cur = "", since: string | undefined;
    for (const p of pts) { const n = name(p.v); if (n !== cur) { cur = n; since = n ? p.at : undefined; } }
    const t = since ? Date.parse(since) : NaN; if (Number.isFinite(t)) out[+id] = t;
  }
  return out;
}
