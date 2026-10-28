import { dataManager } from "../../../src/shared/ado";
import { shortHash } from "../../../src/shared/ids";
import { normalizeDoc, ViewDoc, ViewState } from "../core/views";

const COLLECTION = "rp-views";
const OPTS = { scopeType: "User" } as const;            // private to the person who is signed in, never shared
const docId = (projectId: string) => `pv-${shortHash(projectId)}`;
const is404 = (e: unknown) => (e as { status?: number })?.status === 404 || /not exist|404|DocumentDoesNotExist/i.test(String((e as Error)?.message ?? e));

/** The signed-in person's saved views for this project. */
export async function loadViews(projectId: string, defaults: ViewState): Promise<ViewDoc> {
  try { return normalizeDoc(await (await dataManager()).getDocument(COLLECTION, docId(projectId), OPTS), defaults); }
  catch (e) { if (is404(e)) return { views: [] }; throw e; }
}

export async function saveViews(projectId: string, doc: ViewDoc): Promise<void> {
  await (await dataManager()).setDocument(COLLECTION, { id: docId(projectId), kind: "views", projectId, views: doc.views, defaultId: doc.defaultId ?? "" }, OPTS);
}
