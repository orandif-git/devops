import { emptyConfig, ProjectConfig } from "../core/types";
import { normalizeProject } from "../core/normalize";
import { dataManager } from "./ado";

// ---------- config storage (extension data service, one document per project) ----------
const COLLECTION = "wig-config";

const is404 = (e: unknown) => (e as { status?: number })?.status === 404 || /not exist|404|DocumentDoesNotExist/i.test(String((e as Error)?.message ?? e));

/** The saved settings together with the version they were read at (-1 = nothing saved yet), so a later save can tell whether someone else saved in between. */
export async function loadConfigDoc(projectId: string): Promise<{ config: ProjectConfig; etag: number }> {
  try {
    const m = await dataManager();
    const doc = await m.getDocument(COLLECTION, `project-${projectId}`);
    const c = doc?.config as ProjectConfig | undefined;
    return { config: c ? normalizeProject({ ...emptyConfig(), ...c }) : emptyConfig(), etag: typeof doc?.__etag === "number" ? doc.__etag : -1 };
  } catch (e) {
    if (is404(e)) return { config: emptyConfig(), etag: -1 };           // not configured yet
    throw e;
  }
}

export async function loadConfig(projectId: string): Promise<ProjectConfig> { return (await loadConfigDoc(projectId)).config; }

/** Someone else saved the settings after they were read. */
export class ConfigConflictError extends Error {
  constructor() { super("The settings were saved by someone else after you opened this page."); this.name = "ConfigConflictError"; }
}

/**
 * Save the settings. With the version from loadConfigDoc the save only succeeds if nobody saved in between (otherwise ConfigConflictError);
 * without it the stored settings are overwritten. Returns the new version.
 */
export async function saveConfig(projectId: string, config: ProjectConfig, etag?: number): Promise<number> {
  const m = await dataManager();
  const guarded = typeof etag === "number" && etag !== -1;
  try {
    const saved = await m.setDocument(COLLECTION, { id: `project-${projectId}`, config, __etag: guarded ? etag : -1 });
    return typeof saved?.__etag === "number" ? saved.__etag : -1;
  } catch (e) {
    if (guarded && (/1660003|etag|conflict|precondition|modified/i.test(String((e as Error)?.message ?? e)) || [409, 412].includes((e as { status?: number })?.status ?? 0))) throw new ConfigConflictError();
    throw e;
  }
}

