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

/** The usual software delivery phases, offered as a quick start. */
export const SDLC_STAGES = ["Design", "Development", "SIT", "UAT", "Deployment"];
/** "Design, Development; SIT" -> the stage names: trimmed, no empty or repeated names. */
export function parseStageNames(text: string): string[] {
  const seen = new Set<string>(), out: string[] = [];
  for (const n of text.split(/[,;\n]/).map(x => x.trim()).filter(Boolean)) { const k = key(n); if (!seen.has(k)) { seen.add(k); out.push(n); } }
  return out;
}
/** The stage list for new names: a stage that keeps its name keeps its numbers; new ones get an even share; with the same number of names a rename keeps the numbers and the mapping. */
export function withStageNames(s: StageSettings, names: string[]): StageSettings {
  const even = evenStages(names), old = s.stages;
  const stages = names.map((n, i) => { const o = old.find(d => key(d.name) === key(n)) ?? (old.length === names.length && !names.some(x => old.some(d => key(d.name) === key(x))) ? old[i] : undefined); return o ? { ...o, name: n } : even[i]; });
  const rename = old.length === names.length && !names.some(x => old.some(d => key(d.name) === key(x)));
  const map: Record<string, string> = {};
  for (const [v, m] of Object.entries(s.map)) { const t = m === IGNORE ? IGNORE : rename ? names[old.findIndex(d => key(d.name) === key(m))] : names.find(n => key(n) === key(m)); if (t) map[v] = t; }
  return { ...s, stages, map };
}

const PHASES: { value: RegExp; stage: RegExp }[] = [
  { value: /design|analy|plan|requirement|scop|initiat|discover|propos|backlog|not started|^new$|to do|draft/, stage: /design|analy|plan|requirement|scop|initiat|discover|propos|backlog/ },
  { value: /develop|build|doing|active|in progress|coding|implement/, stage: /develop|build|implement|coding|progress/ },
  { value: /\bsit\b|system|integration|test|\bqa\b|quality/, stage: /\bsit\b|system|integration|test|\bqa\b|quality/ },
  { value: /uat|accept|committed|pre.?prod|staging/, stage: /uat|accept|pre.?prod|staging/ },
  { value: /deploy|release|live|production|go.?live|rollout|handover/, stage: /deploy|release|live|production|rollout|handover/ },
];
/** The stage a value of the field or state most likely belongs to ("(ignore)" for closed, on hold and the like); undefined when there is no good guess. */
export function suggestStage(value: string, stages: string[]): string | undefined {
  const v = key(value); if (!v) return undefined;
  const exact = stages.find(n => key(n) === v) ?? stages.find(n => v.includes(key(n)) || key(n).includes(v)); if (exact) return exact;
  if (/closed|done|complete|resolved|cancel|removed|on hold|^hold|blocked/.test(v)) return IGNORE;
  for (const p of PHASES) if (p.value.test(v)) { const t = stages.find(n => p.stage.test(key(n))); if (t) return t; }
  return undefined;
}
/** Suggestions for every value that is not mapped yet (existing choices are kept). */
export function suggestMap(values: string[], stages: string[], map: Record<string, string>): Record<string, string> {
  const out = { ...map }; for (const v of values) if (!(v in out)) { const t = suggestStage(v, stages); if (t) out[v] = t; } return out;
}
/** Do these values look like a red / amber / green status rather than delivery phases? */
export const looksLikeRag = (values: string[]) => { const v = values.map(key).filter(Boolean); return v.length > 0 && v.some(x => ["red", "amber", "green"].includes(x)) && v.every(x => ["red", "amber", "green", "yellow", "blue", "grey", "gray", "not started", "none", "complete", "completed"].includes(x)); };
