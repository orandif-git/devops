import { readControls } from "./commentOnly";
import { AuditEntry } from "./audit";
import { CapacityRecord } from "./capacity";
import { normalizeProject } from "./normalize";
import { emptyConfig, ProjectConfig } from "./types";

/** Backup and restore of everything the extension stores for a project, in parts that can be chosen separately. */
export const SECTIONS = [
  { id: "grids", label: "Grids (columns, dropdown values, presets, totals, approvals)" },
  { id: "rules", label: "Rules" },
  { id: "cascades", label: "Dependent dropdowns" },
  { id: "calculations", label: "Calculations" },
  { id: "lookups", label: "Mappings" },
  { id: "controls", label: "Controls (who may not edit what)" },
  { id: "capacitySettings", label: "Capacity settings (source, teams, calendar, holidays)" },
  { id: "capacityRegister", label: "Capacity register (hours per person and month)" },
  { id: "audit", label: "Audit log" },
] as const;
export type SectionId = (typeof SECTIONS)[number]["id"];
export const SECTION_IDS = SECTIONS.map(s => s.id) as SectionId[];
export const DEFAULT_INCLUDE: Record<SectionId, boolean> = { grids: true, rules: true, cascades: true, calculations: true, lookups: true, controls: true, capacitySettings: true, capacityRegister: true, audit: false };
export type Mode = "skip" | "replace" | "merge";

export const FORMAT = "wig-backup";
export const FORMAT_VERSION = 1;
const MAX_BYTES = 25 * 1024 * 1024;

export interface BackupFile {
  format: typeof FORMAT;
  formatVersion: number;
  extensionVersion: string;
  createdAt: string;
  createdBy: { id: string; name: string };
  project: { id: string; name: string };
  sections: {
    grids?: ProjectConfig["grids"]; rules?: ProjectConfig["rules"]; cascades?: ProjectConfig["cascades"]; calculations?: ProjectConfig["calculations"];
    lookups?: ProjectConfig["lookups"]; controls?: NonNullable<ProjectConfig["controls"]>;
    capacitySettings?: Record<string, unknown>; capacityRegister?: CapacityRecord[]; audit?: AuditEntry[];
  };
}

export interface Current { config: ProjectConfig; capacitySettings: Record<string, unknown>; register: CapacityRecord[]; audit: AuditEntry[] }

export function buildBackup(p: { project: { id: string; name: string }; user: { id: string; name: string }; extensionVersion: string; current: Current; include: Partial<Record<SectionId, boolean>>; now?: Date }): BackupFile {
  const c = p.current.config, on = (id: SectionId) => !!p.include[id];
  const s: BackupFile["sections"] = {};
  if (on("grids")) s.grids = c.grids;
  if (on("rules")) s.rules = c.rules;
  if (on("cascades")) s.cascades = c.cascades;
  if (on("calculations")) s.calculations = c.calculations ?? [];
  if (on("lookups")) s.lookups = c.lookups ?? {};
  if (on("controls") && c.controls) s.controls = c.controls;
  if (on("capacitySettings")) s.capacitySettings = p.current.capacitySettings;
  if (on("capacityRegister")) s.capacityRegister = p.current.register;
  if (on("audit")) s.audit = p.current.audit;
  return { format: FORMAT, formatVersion: FORMAT_VERSION, extensionVersion: p.extensionVersion, createdAt: (p.now ?? new Date()).toISOString(), createdBy: p.user, project: p.project, sections: s };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const UNSAFE = new Set(["__proto__", "constructor", "prototype"]);
const safeKeys = (o: Record<string, unknown>) => Object.keys(o).every(k => !UNSAFE.has(k));

/** Read and check a backup file. Nothing in it is trusted: shapes are checked and unsafe keys are refused. */
export function parseBackup(text: string): { file?: BackupFile; error?: string } {
  if (text.length > MAX_BYTES) return { error: "The file is too large to be a backup of this extension." };
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { error: "The file is not valid JSON." }; }
  if (!isObj(raw) || raw.format !== FORMAT) return { error: "This is not a Grid & Rules backup file." };
  if (typeof raw.formatVersion !== "number" || raw.formatVersion > FORMAT_VERSION) return { error: `This backup was made by a newer version of the extension (file format ${String(raw.formatVersion)}). Update the extension first.` };
  if (!isObj(raw.sections)) return { error: "The backup contains no sections." };
  const s = raw.sections;
  const bad = (id: string) => ({ error: `The “${id}” part of the backup is damaged.` });
  for (const id of ["grids", "lookups"] as const) if (s[id] !== undefined && (!isObj(s[id]) || !safeKeys(s[id] as Record<string, unknown>))) return bad(id);
  for (const id of ["rules", "cascades", "calculations", "capacityRegister", "audit"] as const) if (s[id] !== undefined && !Array.isArray(s[id])) return bad(id);
  if (s.capacitySettings !== undefined && !isObj(s.capacitySettings)) return bad("capacitySettings");
  if (s.controls !== undefined) {                       // older backups hold one comment-only rule as an object
    if (isObj(s.controls)) s.controls = readControls({ commentOnly: s.controls }) ?? [];
    else if (!Array.isArray(s.controls) || s.controls.some(x => !isObj(x))) return bad("controls");
    else s.controls = readControls({ controls: s.controls }) ?? [];
  }
  for (const g of Object.values((s.grids as Record<string, unknown>) ?? {})) if (!isObj(g) || !Array.isArray(g.columns)) return bad("grids");
  for (const r of (s.capacityRegister as unknown[]) ?? []) if (!isObj(r) || typeof r.key !== "string" || typeof r.name !== "string" || !isObj(r.overrides ?? {})) return bad("capacityRegister");
  for (const e of (s.audit as unknown[]) ?? []) if (!isObj(e) || typeof e.id !== "string" || typeof e.at !== "string" || !Array.isArray(e.changes)) return bad("audit");
  for (const id of ["rules", "cascades", "calculations"] as const) for (const x of (s[id] as unknown[]) ?? []) if (!isObj(x) || typeof x.id !== "string") return bad(id);
  const project = isObj(raw.project) ? raw.project : {};
  const by = isObj(raw.createdBy) ? raw.createdBy : {};
  return { file: {
    format: FORMAT, formatVersion: raw.formatVersion, extensionVersion: String(raw.extensionVersion ?? ""), createdAt: String(raw.createdAt ?? ""),
    createdBy: { id: String(by.id ?? ""), name: String(by.name ?? "") }, project: { id: String(project.id ?? ""), name: String(project.name ?? "") },
    sections: s as BackupFile["sections"],
  } };
}

export const presentSections = (f: BackupFile) => SECTION_IDS.filter(id => f.sections[id] !== undefined);
export const countOf = (f: BackupFile, id: SectionId): number => { const v = f.sections[id] as unknown; return Array.isArray(v) ? v.length : isObj(v) ? (id === "capacitySettings" ? 1 : Object.keys(v).length) : 0; };

// ---------------- restore ----------------

export interface SectionPlan { id: SectionId; mode: Mode; added: number; changed: number; removed: number; kept: number }
export interface RestorePlan {
  config: ProjectConfig;
  capacitySettings?: Record<string, unknown>;
  register: { save: CapacityRecord[]; remove: string[] };
  audit: AuditEntry[];
  sections: SectionPlan[];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const idOf = (x: { id?: string; name?: string }) => String(x.id ?? x.name ?? "");

/** Work out what restoring the chosen parts would do. Pure: nothing is written. */
export function planRestore(current: Current, file: BackupFile, modes: Partial<Record<SectionId, Mode>>): RestorePlan {
  const cfg: ProjectConfig = { ...emptyConfig(), ...JSON.parse(JSON.stringify(current.config)) };
  const plan: RestorePlan = { config: cfg, register: { save: [], remove: [] }, audit: [], sections: [] };
  const mode = (id: SectionId): Mode => (file.sections[id] === undefined ? "skip" : modes[id] ?? "skip");

  /** keyed collections (arrays with ids, or objects by name) */
  const keyed = <T,>(id: SectionId, cur: T[] | Record<string, T>, inc: T[] | Record<string, T>, key?: (x: T) => string): { next: T[] | Record<string, T>; stats: SectionPlan } => {
    const m = mode(id);
    const asMap = (v: T[] | Record<string, T>) => new Map<string, T>(Array.isArray(v) ? v.map(x => [key!(x), x]) : Object.entries(v));
    const cm = asMap(cur), im = asMap(inc);
    let added = 0, changed = 0, removed = 0, kept = 0;
    for (const [k, v] of im) { if (!cm.has(k)) added++; else if (!same(cm.get(k), v)) changed++; else kept++; }
    for (const k of cm.keys()) if (!im.has(k)) removed++;
    const out = new Map(cm);
    if (m === "replace") { out.clear(); for (const [k, v] of im) out.set(k, v); }
    else if (m === "merge") { for (const [k, v] of im) if (!out.has(k)) out.set(k, v); }
    const stats: SectionPlan = m === "merge" ? { id, mode: m, added, changed: 0, removed: 0, kept: kept + changed } : { id, mode: m, added, changed, removed: m === "replace" ? removed : 0, kept };
    return { next: Array.isArray(cur) ? Array.from(out.values()) : Object.fromEntries(out), stats };
  };

  const s = file.sections;
  if (mode("grids") !== "skip") { const r = keyed("grids", cfg.grids, s.grids ?? {}); cfg.grids = r.next as ProjectConfig["grids"]; plan.sections.push(r.stats); }
  if (mode("rules") !== "skip") { const r = keyed("rules", cfg.rules, s.rules ?? [], idOf); cfg.rules = r.next as ProjectConfig["rules"]; plan.sections.push(r.stats); }
  if (mode("cascades") !== "skip") { const r = keyed("cascades", cfg.cascades, s.cascades ?? [], idOf); cfg.cascades = r.next as ProjectConfig["cascades"]; plan.sections.push(r.stats); }
  if (mode("calculations") !== "skip") { const r = keyed("calculations", cfg.calculations ?? [], s.calculations ?? [], idOf); cfg.calculations = r.next as ProjectConfig["calculations"]; plan.sections.push(r.stats); }
  if (mode("lookups") !== "skip") { const r = keyed("lookups", cfg.lookups ?? {}, s.lookups ?? {}); cfg.lookups = r.next as ProjectConfig["lookups"]; plan.sections.push(r.stats); }

  const single = <T,>(id: SectionId, cur: T | undefined, inc: T | undefined): { next: T | undefined; stats: SectionPlan } => {
    const m = mode(id);
    const diff = inc !== undefined && !same(cur, inc);
    let next = cur;
    if (m === "replace" && inc !== undefined) next = inc;
    if (m === "merge" && cur === undefined) next = inc;
    return { next, stats: { id, mode: m, added: m !== "skip" && cur === undefined && inc !== undefined ? 1 : 0, changed: m === "replace" && cur !== undefined && diff ? 1 : 0, removed: 0, kept: m === "merge" && cur !== undefined ? 1 : 0 } };
  };
  if (mode("controls") !== "skip") { const r = keyed("controls", cfg.controls ?? [], s.controls ?? [], idOf); cfg.controls = r.next as ProjectConfig["controls"]; plan.sections.push(r.stats); }
  if (mode("capacitySettings") !== "skip") { const r = single("capacitySettings", Object.keys(current.capacitySettings).length ? current.capacitySettings : undefined, s.capacitySettings); plan.capacitySettings = r.next; plan.sections.push(r.stats); }

  if (mode("capacityRegister") !== "skip") {
    const r = keyed("capacityRegister", current.register, s.capacityRegister ?? [], x => x.key);
    const next = r.next as CapacityRecord[];
    const before = new Map(current.register.map(x => [x.key, x]));
    plan.register.save = next.filter(x => !same(before.get(x.key), x));
    plan.register.remove = current.register.filter(x => !next.some(y => y.key === x.key)).map(x => x.key);
    plan.sections.push(r.stats);
  }
  if (mode("audit") !== "skip") {                                    // the existing log is never overwritten: only entries it does not have yet are added
    const have = new Set(current.audit.map(e => e.id));
    plan.audit = (s.audit ?? []).filter(e => !have.has(e.id));
    plan.sections.push({ id: "audit", mode: "merge", added: plan.audit.length, changed: 0, removed: 0, kept: (s.audit ?? []).length - plan.audit.length });
  }
  plan.config = normalizeProject(cfg);
  return plan;
}

/** Things to check before restoring (another project, teams that do not exist here, a newer or older extension). */
export function restoreWarnings(file: BackupFile, ctx: { projectId: string; projectName: string; teamIds: Set<string> | undefined }): string[] {
  const out: string[] = [];
  if (file.project.id && file.project.id !== ctx.projectId) out.push(`This backup was made in project “${file.project.name || file.project.id}”, not in “${ctx.projectName}”. Teams, fields and people it refers to may not exist here.`);
  if (ctx.teamIds) {
    const missing = new Map<string, string>();
    const walk = (v: unknown, key = "") => {
      if (Array.isArray(v)) { for (const x of v) { if (/teams$/i.test(key) && isObj(x) && typeof x.id === "string") { if (!ctx.teamIds!.has(x.id)) missing.set(x.id, String(x.name ?? x.id)); } else walk(x, key); } }
      else if (isObj(v)) for (const [k, x] of Object.entries(v)) walk(x, k);
    };
    walk({ ...file.sections, audit: undefined });
    if (missing.size) out.push(`These teams are not in this project, so rules that use them will not match anyone: ${Array.from(missing.values()).slice(0, 8).join(", ")}${missing.size > 8 ? "…" : ""}.`);
  }
  return out;
}

export const backupFileName = (projectName: string, now = new Date()) =>
  `grid-rules-backup-${projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "project"}-${now.toISOString().slice(0, 10)}.json`;
