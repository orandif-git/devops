import { dataManager } from "../../../src/shared/ado";
import { shortHash } from "../../../src/shared/ids";
import { mergeSnapshot, Snapshot } from "../core/snapshots";
import { previousWeeks } from "../core/asof";

const COLLECTION = "rp-snapshots", HOURS12 = 12 * 3600 * 1000;
const docId = (projectId: string) => `sn-${shortHash(projectId)}`;
const is404 = (e: unknown) => (e as { status?: number })?.status === 404 || /not exist|404|DocumentDoesNotExist/i.test(String((e as Error)?.message ?? e));
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const clean = (raw: unknown): Snapshot[] => (Array.isArray(raw) ? raw : []).filter(s => s && typeof s === "object" && typeof (s as Snapshot).week === "string").map(x => { const s = x as Record<string, unknown>;
  return { week: String(s.week), at: String(s.at ?? ""), total: num(s.total), progress: num(s.progress), late: num(s.late), due30: num(s.due30), hold: num(s.hold), green: num(s.green), amber: num(s.amber), red: num(s.red), idle: num(s.idle), unknown: num(s.unknown), done: num(s.done), ...(s.rebuilt === true ? { rebuilt: true } : {}) }; });

/**
 * The weekly snapshots of the project, with the current one added: read from the central store, the current week's snapshot is written
 * the first time it is seen and refreshed at most every 12 hours. Never fails: without it the dashboards simply show no trend.
 */
export async function recordSnapshot(projectId: string, cur: Snapshot, backfill?: (weeks: string[]) => Promise<Snapshot[]>): Promise<Snapshot[]> {
  try {
    const mgr = await dataManager();
    let list: Snapshot[] = [];
    try { list = clean((await mgr.getDocument(COLLECTION, docId(projectId)))?.snapshots); } catch (e) { if (!is404(e)) throw e; }
    // earlier weeks that were never recorded are rebuilt once from the work item history (a recorded week is never replaced)
    let rebuilt = false;
    if (backfill) {
      const have = new Set(list.map(s => s.week)), want = previousWeeks(new Date(cur.at), 8).filter(w => !have.has(w));
      if (want.length) { try { const extra = (await backfill(want)).filter(s => want.includes(s.week)); if (extra.length) { list = [...list, ...extra]; rebuilt = true; } } catch { /* no history: the trend just starts now */ } }
    }
    const mine = list.find(s => s.week === cur.week), merged = mergeSnapshot(list, cur);
    if (rebuilt || !mine || Date.parse(cur.at) - Date.parse(mine.at) > HOURS12) await mgr.setDocument(COLLECTION, { id: docId(projectId), kind: "snapshots", projectId, snapshots: merged });
    return merged;
  } catch { return [cur]; }
}
