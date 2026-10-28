import { dataManager } from "../../../src/shared/ado";
import { shortHash } from "../../../src/shared/ids";
import { ExecLayout } from "../core/types";
import { ExecStatus } from "../core/executive";

/** What a person sees on the Executive Dashboard: the layout and the filters (private to them when saved). */
export interface ExecViewState { layout: ExecLayout; density: "comfortable" | "compact"; status: ExecStatus[]; state: string[]; team: string[]; quarter: string[]; moved: string[]; dims: Record<string, string[]>; text: string; savedId: string }
export interface ExecView { id: string; name: string; state: ExecViewState }
export interface ExecViewDoc { views: ExecView[]; defaultId?: string }

const COLLECTION = "rp-views", OPTS = { scopeType: "User" } as const;
const docId = (projectId: string) => `ev-${shortHash(projectId)}`;
const is404 = (e: unknown) => (e as { status?: number })?.status === 404 || /not exist|404|DocumentDoesNotExist/i.test(String((e as Error)?.message ?? e));
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const STATUSES = ["green", "amber", "red", "idle", "unknown", "done"];

export function normalizeExecView(raw: unknown, layout: ExecLayout): ExecViewState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>, x = (r.dims && typeof r.dims === "object" ? r.dims : {}) as Record<string, unknown>;
  return { density: r.density === "compact" ? "compact" : "comfortable", layout: (["report", "map", "roadmap"].includes(String(r.layout)) ? r.layout : layout) as ExecLayout, status: strs(r.status).filter(s => STATUSES.includes(s)) as ExecStatus[], state: strs(r.state), team: strs(r.team), quarter: strs(r.quarter), moved: strs(r.moved),
    dims: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, strs(v)]).filter(([, v]) => (v as string[]).length)), text: typeof r.text === "string" ? r.text : "", savedId: typeof r.savedId === "string" ? r.savedId : "" };
}
export function normalizeExecDoc(raw: unknown, layout: ExecLayout): ExecViewDoc {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const views = (Array.isArray(r.views) ? r.views : []).filter(v => v && typeof v === "object").map((v, i) => { const o = v as Record<string, unknown>; return { id: typeof o.id === "string" && o.id ? o.id : `v${i + 1}`, name: (typeof o.name === "string" ? o.name.trim() : "") || `View ${i + 1}`, state: normalizeExecView(o.state, layout) }; });
  const d = typeof r.defaultId === "string" ? r.defaultId : "";
  return { views, defaultId: views.some(v => v.id === d) ? d : undefined };
}
export async function loadExecViews(projectId: string, layout: ExecLayout): Promise<ExecViewDoc> {
  try { return normalizeExecDoc(await (await dataManager()).getDocument(COLLECTION, docId(projectId), OPTS), layout); } catch (e) { if (is404(e)) return { views: [] }; throw e; }
}
export async function saveExecViews(projectId: string, doc: ExecViewDoc): Promise<void> {
  await (await dataManager()).setDocument(COLLECTION, { id: docId(projectId), kind: "exec-views", projectId, views: doc.views, defaultId: doc.defaultId ?? "" }, OPTS);
}
