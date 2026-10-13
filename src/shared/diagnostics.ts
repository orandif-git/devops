import * as SDK from "azure-devops-extension-sdk";
import { validateConfig } from "../core/gridModel";
import { dataManager, getProject, getTeamMembersCompat, listFields, listWorkItemTypes, withTimeout } from "./ado";
import { loadConfigDoc } from "./configStore";
import { listAudit, loadRetention, auditStorageCheck } from "./auditStore";
import { listAllocations } from "./allocationStore";
import { listRecords, listTeams, loadSettings, readNativeCapacity } from "./capacityStore";
import { projectAdminStatus } from "./presetAccess";
import { extensionVersion } from "./backupStore";

export type Level = "ok" | "warn" | "fail" | "info";
export interface Check { title: string; level: Level; detail: string; ms?: number }

const DIAG = "wig-audit";                                     // throw-away records of the checks live here and are removed again
const rand = () => Math.random().toString(36).slice(2, 8);
const is404 = (e: unknown) => (e as { status?: number })?.status === 404 || /not exist|404|DocumentDoesNotExist/i.test(String((e as Error)?.message ?? e));

/** Longest id (in characters) that this server still keeps apart from another id differing only in its last character. */
export async function probeIdLimit(): Promise<{ safeUpTo: number; tested: number }> {
  const m = await dataManager();
  const tag = `dp${rand()}`;
  const lengths = [24, 32, 40, 44, 48, 50, 52, 56, 64, 80];
  let safe = 0;
  const made: string[] = [];
  try {
    for (const L of lengths) {
      const prefix = (tag + String(L)).padEnd(L - 1, "x");
      const a = `${prefix}a`, b = `${prefix}b`;
      made.push(a, b);
      await m.setDocument(DIAG, { id: a, kind: "diag", __etag: -1 });
      await m.setDocument(DIAG, { id: b, kind: "diag", __etag: -1 });
      const found = ((await m.getDocuments(DIAG)) as { id: string }[]).filter(d => d.id.startsWith(tag + String(L))).length;
      if (found === 2) safe = L; else break;
    }
  } finally {
    for (const d of ((await m.getDocuments(DIAG).catch(() => [])) as { id: string; kind?: string }[]).filter(x => x.kind === "diag")) { try { await m.deleteDocument(DIAG, d.id); } catch { /* gone */ } }
  }
  return { safeUpTo: safe, tested: lengths[lengths.length - 1] };
}

/** Does this server refuse a save made with an out-of-date version (needed so two administrators cannot overwrite each other)? */
export async function etagCheck(): Promise<boolean> {
  const m = await dataManager();
  const id = `de${rand()}`;
  try {
    const first = (await m.setDocument(DIAG, { id, kind: "diag", n: 1, __etag: -1 })) as { __etag?: number };
    const second = (await m.setDocument(DIAG, { id, kind: "diag", n: 2, __etag: first.__etag })) as { __etag?: number };
    if (typeof first.__etag !== "number" || typeof second.__etag !== "number") throw new Error("the server returned no version numbers");
    try { await m.setDocument(DIAG, { id, kind: "diag", n: 3, __etag: first.__etag }); return false; } catch { return true; }
  } finally { try { await m.deleteDocument(DIAG, id); } catch (e) { if (!is404(e)) throw e; } }
}

/** How many stored documents have ids longer than `limit` (they may be mistaken for each other), per collection. */
export async function scanLongIds(limit: number): Promise<{ collection: string; total: number; long: number; legacy: number }[]> {
  const m = await dataManager();
  const out: { collection: string; total: number; long: number; legacy: number }[] = [];
  for (const [collection, legacyPrefix] of [["wig-capacity", "res-"], ["wig-allocations", "alloc-"], ["wig-audit", "audit-"], ["wig-config", "zz-none-"]] as const) {
    let docs: { id: string }[] = [];
    try { docs = (await m.getDocuments(collection)) as { id: string }[]; } catch (e) { if (!is404(e)) throw e; }
    out.push({ collection, total: docs.length, long: docs.filter(d => d.id.length > limit && !/^(project|settings)-/.test(d.id)).length, legacy: docs.filter(d => d.id.startsWith(legacyPrefix) && d.id.length > 40 && !d.id.startsWith("audit-settings")).length });
  }
  return out;
}

const time = async (title: string, fn: () => Promise<{ level: Level; detail: string }>): Promise<Check> => {
  const t0 = Date.now();
  try { const r = await fn(); return { title, ...r, ms: Date.now() - t0 }; }
  catch (e) { return { title, level: "fail", detail: (e as Error).message || String(e), ms: Date.now() - t0 }; }
};

/** Runs every check; each one is independent, so one failing does not hide the others. */
export async function runDiagnostics(): Promise<Check[]> {
  const project = await getProject();
  const pid = project.id;
  const out: Check[] = [];
  const add = async (title: string, fn: () => Promise<{ level: Level; detail: string }>) => { out.push(await time(title, fn)); };

  await add("Environment", async () => {
    const u = SDK.getUser(); const h = SDK.getHost();
    return { level: "info", detail: `extension ${extensionVersion() || "?"} · ${h.name ?? "?"} · project ${project.name} · user ${u.displayName} · browser time zone ${Intl.DateTimeFormat().resolvedOptions().timeZone}` };
  });
  await add("Your permissions", async () => {
    const s = await projectAdminStatus(pid);
    return s === "yes" ? { level: "ok", detail: "You are a project administrator." } : s === "no" ? { level: "warn", detail: "You are not a project administrator." } : { level: "warn", detail: "Permissions could not be read. Pages stay usable, but administrator-only rules cannot be checked." };
  });
  let limit = 0;
  await add("Document ids (storage)", async () => {
    const r = await probeIdLimit(); limit = r.safeUpTo;
    return r.safeUpTo >= 40 ? { level: "ok", detail: `Documents with ids up to ${r.safeUpTo >= r.tested ? `${r.tested}+` : r.safeUpTo} characters are kept apart. The extension's ids are about 30.` } : { level: "fail", detail: `This server keeps ids apart only up to ${r.safeUpTo} characters. The extension's ids may collide: send this result to the developer.` };
  });
  await add("Several records in one collection", async () => {
    const lines = await auditStorageCheck(pid);
    const bad = lines.filter(l => l.startsWith("✖"));
    return { level: bad.length ? "fail" : "ok", detail: lines.join(" · ") };
  });
  await add("Version check on saving settings", async () => {
    const ok = await etagCheck();
    return ok ? { level: "ok", detail: "A save made from an out-of-date copy is refused, so two administrators cannot silently overwrite each other." } : { level: "warn", detail: "This server accepts saves made from an out-of-date copy: if two people save at the same time, the later save wins." };
  });
  await add("Stored data with long ids", async () => {
    const rows = await scanLongIds(limit || 40);
    const legacy = rows.reduce((n, r) => n + r.legacy, 0);
    const text = rows.map(r => `${r.collection.replace("wig-", "")}: ${r.total} document(s)${r.legacy ? `, ${r.legacy} with an old long id` : ""}`).join(" · ");
    return legacy ? { level: "warn", detail: `${text}. Use “Move to short ids” below to migrate them.` } : { level: "ok", detail: text };
  });
  const cfg = await time("Settings", async () => {
    const d = await loadConfigDoc(pid);
    const size = JSON.stringify(d.config).length;
    const errors = Object.entries(d.config.grids).flatMap(([n, g]) => validateConfig(g).map(e => `${n}: ${e}`));
    return { level: errors.length ? "warn" : "ok", detail: `${Object.keys(d.config.grids).length} grid(s), ${d.config.rules.length} rule(s), ${d.config.cascades.length} dependent dropdown(s), ${(d.config.calculations ?? []).length} calculation(s) · ${(size / 1024).toFixed(1)} KB${errors.length ? ` · ${errors.length} problem(s), first: ${errors[0]}` : ""}` };
  });
  out.push(cfg);
  let firstTeam = "";
  await add("Azure DevOps: teams", async () => { const t = await listTeams(pid); firstTeam = t[0]?.id ?? ""; return { level: t.length ? "ok" : "warn", detail: `${t.length} team(s) read` }; });
  await add("Azure DevOps: team members", async () => {
    if (!firstTeam) return { level: "info", detail: "No team to read." };
    const m = await withTimeout(getTeamMembersCompat(pid, firstTeam, 50), "Reading team members");
    return { level: "ok", detail: `${m.length} member(s) read from the first team` };
  });
  await add("Azure DevOps: work item types and fields", async () => {
    const [types, fields] = await Promise.all([listWorkItemTypes(project.name), listFields(project.name)]);
    return { level: "ok", detail: `${types.length} work item type(s), ${fields.length} field(s) read` };
  });
  await add("Capacity", async () => {
    const s = await loadSettings(pid);
    if (s.source === "teams") {
      if (!s.capacityTeams.length) return { level: "warn", detail: "Source is Azure DevOps team capacity, but no team is selected." };
      const r = await readNativeCapacity(s.capacityTeams, true);
      const msgs = r.report.flatMap(x => x.messages);
      return { level: msgs.length ? "warn" : "ok", detail: `Team capacity: ${r.report.reduce((n, x) => n + x.members, 0)} person(s) in ${r.report.reduce((n, x) => n + x.iterations, 0)} iteration(s)${msgs.length ? ` · ${msgs[0]}` : ""}` };
    }
    const recs = await listRecords(pid);
    return { level: "ok", detail: `Register: ${recs.length} person(s)` };
  });
  await add("Live allocations", async () => ({ level: "ok", detail: `${(await listAllocations(pid)).length} Epic(s) with published hours` }));
  await add("Audit log", async () => ({ level: "ok", detail: `${(await listAudit(pid)).length} entr(ies) kept ${await loadRetention(pid)} months` }));
  return out;
}

export const checksText = (checks: Check[]) => checks.map(c => `${{ ok: "✔", warn: "⚠", fail: "✖", info: "ℹ" }[c.level]} ${c.title}: ${c.detail}${c.ms !== undefined ? ` (${c.ms} ms)` : ""}`).join("\n");
