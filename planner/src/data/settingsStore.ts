import { shortHash } from "../../../src/shared/ids";
import { dataManager } from "../../../src/shared/ado";
import { normalizeSettings } from "../core/settings";
import { PlannerSettings } from "../core/types";

const COLLECTION = "rp-settings";
const docId = (projectId: string) => `ps-${shortHash(projectId)}`;
const is404 = (e: unknown) => (e as { status?: number })?.status === 404 || /not exist|404|DocumentDoesNotExist/i.test(String((e as Error)?.message ?? e));

export class SettingsConflictError extends Error { constructor() { super("The settings were saved by someone else after you opened this page."); this.name = "SettingsConflictError"; } }

/** The saved settings and the version they were read at (-1 = never saved). */
export async function loadSettings(projectId: string): Promise<{ settings: PlannerSettings; etag: number }> {
  try {
    const doc = await (await dataManager()).getDocument(COLLECTION, docId(projectId));
    return { settings: normalizeSettings(doc?.settings), etag: typeof doc?.__etag === "number" ? doc.__etag : -1 };
  } catch (e) { if (is404(e)) return { settings: normalizeSettings({}), etag: -1 }; throw e; }
}

/** Save with the version read: a save made from an out-of-date copy is refused (SettingsConflictError). Returns the new version. */
export async function saveSettings(projectId: string, settings: PlannerSettings, etag?: number): Promise<number> {
  const guarded = typeof etag === "number" && etag !== -1;
  try {
    const saved = await (await dataManager()).setDocument(COLLECTION, { id: docId(projectId), kind: "settings", projectId, settings, __etag: guarded ? etag : -1 });
    return typeof saved?.__etag === "number" ? saved.__etag : -1;
  } catch (e) {
    if (guarded && (/1660003|etag|conflict|precondition|modified/i.test(String((e as Error)?.message ?? e)) || [409, 412].includes((e as { status?: number })?.status ?? 0))) throw new SettingsConflictError();
    throw e;
  }
}
