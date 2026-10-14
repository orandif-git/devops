import { ExecEpic, ExecStatus, STATUS_NAME, STATUS_ORDER } from "./executive";
import { ExecQuery } from "./types";

/** What a typed question asks for: filters, and whether it wants a count or the RAG split. No AI: words are matched against the statuses and the values actually found in the Epics' category fields. */
export interface Question {
  /** category field → chosen values */
  dims: Record<string, string[]>;
  statuses: ExecStatus[];
  late: boolean;
  hold: boolean;
  counting: boolean;
  /** "RAG", "breakdown", "split": wants the status split */
  split: boolean;
  recognised: boolean;
}

const STOP = new Set(["and", "the", "of", "for", "a", "an", "to", "in", "on", "with", "or"]);
const STATUS_WORDS: [ExecStatus, RegExp][] = [
  ["red", /\bred\b|at risk|risky|\bmiss(es|ing)?\b|off.?track|trouble|critical/],
  ["amber", /\bamber\b|attention|\bwatch|concern|slipp(ing|age)|\byellow\b/],
  ["green", /\bgreen\b|on.?track|going well|progressing|healthy|fine/],
  ["done", /\bdone\b|complete[d]?\b|deliver(ed)?\b|finished|closed/],
  ["idle", /not started|upcoming|yet to start|future|\bnew\b/],
  ["unknown", /not assessed|unknown|no (progress|data|date)/],
];
const words = (t: string) => t.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** Does the question mention this value? Every meaningful word of the value must be matched by a question word (a word of 3+ letters that starts it, or that it starts: "reg" → "Regulatory"). */
export function mentions(q: string[], value: string): boolean {
  const vw = words(value).filter(w => !STOP.has(w));
  if (!vw.length) return false;
  return vw.every(v => q.some(w => (w.length >= 3 && v.startsWith(w)) || (v.length >= 4 && w.startsWith(v)) || w === v));
}

export function interpret(text: string, vocab: Record<string, string[]>): Question {
  const t = text.toLowerCase();
  const q = words(text).filter(w => !STOP.has(w));
  const dims: Record<string, string[]> = {};
  for (const [field, values] of Object.entries(vocab)) {
    const hit = values.filter(v => v && mentions(q, v));
    if (hit.length) {
      // when one hit is a longer phrase that contains another ("Software upgrade" vs "Software"), keep the most specific
      const keep = hit.filter(v => !hit.some(o => o !== v && words(o).length > words(v).length && words(v).every(w => words(o).includes(w))));
      dims[field] = keep;
    }
  }
  const statuses = STATUS_WORDS.filter(([, re]) => re.test(t)).map(([s]) => s);
  const late = /\blate\b|overdue|past (the )?(go.?live|target|due)/.test(t);
  const hold = /on hold|paused|\bhold\b|blocked/.test(t);
  const split = /\brag\b|breakdown|split|summary|overall|by status/.test(t) && !statuses.length;
  const counting = /how many|count|number of/.test(t);
  const recognised = Object.keys(dims).length > 0 || statuses.length > 0 || late || hold || split || /everything|\ball\b|portfolio|status/.test(t);
  return { dims, statuses, late, hold, counting, split, recognised };
}

export const matchesDims = (r: ExecEpic, dims: Record<string, string[]>) => Object.entries(dims).every(([f, vals]) => !vals.length || vals.includes(r.dims[f]));

/** The sentence that answers the question, built only from the matching Epics. */
export function answer(q: Question, rows: ExecEpic[]): string {
  const scoped = rows.filter(r => matchesDims(r, q.dims));
  const hits = scoped.filter(r => (!q.statuses.length || q.statuses.includes(r.status)) && (!q.late || r.late) && (!q.hold || r.hold));
  const which = Object.values(q.dims).flat().join(" + ");
  const noun = (n: number) => `${which ? which + " " : ""}Epic${n === 1 ? "" : "s"}`;
  const what = [q.statuses.map(s => STATUS_NAME[s].toLowerCase()).join(" or "), q.late ? "late" : "", q.hold ? "on hold" : ""].filter(Boolean).join(", ");
  if (q.split) {
    const order: ExecStatus[] = ["red", "amber", "green", "unknown", "idle", "done"];
    return `${noun(scoped.length)}: ${order.map(s => `${scoped.filter(r => r.status === s).length} ${STATUS_NAME[s].toLowerCase()}`).join(", ")} (${scoped.length} in total).`;
  }
  const worst = hits.slice().sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.slip - a.slip)[0];
  if (q.counting) return `${hits.length} ${noun(hits.length)}${what ? ` ${hits.length === 1 ? "is" : "are"} ${what}` : " in total"}${hits.length ? `: ${hits.slice(0, 5).map(r => r.epic.title).join(", ")}${hits.length > 5 ? ` … and ${hits.length - 5} more` : ""}.` : "."}`;
  return `Showing ${hits.length} ${noun(hits.length)}${what ? ` that ${hits.length === 1 ? "is" : "are"} ${what}` : ""}${worst ? `. Biggest concern: ${worst.epic.title} (${worst.reasons[0] ?? ""}).` : "."}`;
}

/** A configured query whose name the question contains (every word of the name, or a start of it); the longest name wins. */
export function findQuery(text: string, queries: ExecQuery[]): ExecQuery | undefined {
  const q = words(text).filter(w => !STOP.has(w));
  let best: ExecQuery | undefined, bestN = 0;
  for (const x of queries) {
    const n = words(x.name).filter(w => !STOP.has(w)).length;
    if (n && mentions(q, x.name) && n > bestN) { best = x; bestN = n; }
  }
  return best;
}
