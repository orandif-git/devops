import * as SDK from "azure-devops-extension-sdk";
import { Current, RestorePlan } from "../core/backup";
import { CapacityRecord } from "../core/capacity";
import { loadConfig, saveConfig } from "./ado";
import { appendAudit, importAudit, listAudit } from "./auditStore";
import { deleteRecord, listRecords, loadSettings, saveRecord, saveSettings } from "./capacityStore";

export const extensionVersion = (): string => { try { return SDK.getExtensionContext().version || ""; } catch { return ""; } };

/** Everything stored for the project, as it is now. */
export async function readCurrent(projectId: string): Promise<Current> {
  const [config, settings, register, audit] = await Promise.all([loadConfig(projectId), loadSettings(projectId), listRecords(projectId), listAudit(projectId)]);
  return { config, capacitySettings: settings as unknown as Record<string, unknown>, register, audit };
}

const byKey = (rs: CapacityRecord[]) => Object.fromEntries(rs.map(r => [r.key, r]));

/**
 * Write what a restore plan says, then record it in the audit log with the previous and new values.
 * Order: settings first, the register second, the audit entries last, so a failure leaves a clear message about what was and was not done.
 */
export async function applyRestore(projectId: string, current: Current, plan: RestorePlan, why: { reason: string; comment: string }, source: { project: string; createdAt: string; by: string }): Promise<string[]> {
  const done: string[] = [];
  const touched = new Set(plan.sections.map(s => s.id));
  const configParts = ["grids", "rules", "cascades", "calculations", "lookups", "controls"].some(id => touched.has(id as never));
  if (configParts) { await saveConfig(projectId, plan.config); done.push("settings"); }
  if (plan.capacitySettings) { await saveSettings(projectId, plan.capacitySettings as never); done.push("capacity settings"); }
  for (const r of plan.register.save) await saveRecord(projectId, r);
  for (const k of plan.register.remove) await deleteRecord(projectId, k);
  if (touched.has("capacityRegister")) done.push("capacity register");
  const added = plan.audit.length ? await importAudit(projectId, plan.audit) : 0;
  if (added) done.push(`${added} audit entries`);
  const afterRegister = new Map(current.register.map(r => [r.key, r]));
  for (const r of plan.register.save) afterRegister.set(r.key, r);
  for (const k of plan.register.remove) afterRegister.delete(k);
  await appendAudit(projectId, {
    area: "backup-restore", reason: why.reason, comment: why.comment,
    before: { config: configParts ? current.config : undefined, capacitySettings: plan.capacitySettings ? current.capacitySettings : undefined, capacityRegister: touched.has("capacityRegister") ? byKey(current.register) : undefined },
    after: { config: configParts ? plan.config : undefined, capacitySettings: plan.capacitySettings, capacityRegister: touched.has("capacityRegister") ? Object.fromEntries(afterRegister) : undefined, restoredFrom: `${source.project} · ${source.createdAt} · ${source.by}` },
  });
  return done;
}
