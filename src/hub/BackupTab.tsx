import * as React from "react";
import * as SDK from "azure-devops-extension-sdk";
import { BackupFile, backupFileName, buildBackup, countOf, DEFAULT_INCLUDE, Mode, parseBackup, planRestore, presentSections, restoreWarnings, RestorePlan, SECTIONS, SectionId } from "../core/backup";
import { formatStamp, localTimeZone } from "../core/time";
import { downloadFile, getProject } from "../shared/ado";
import { applyRestore, extensionVersion, readCurrent } from "../shared/backupStore";
import { listTeams } from "../shared/capacityStore";
import { Section } from "./ui";
import { useReason } from "./ReasonDialog";

const MODE_LABEL: Record<Mode, string> = { skip: "Do not restore", replace: "Replace (make it exactly like the file)", merge: "Add missing only" };
const effect = (s: RestorePlan["sections"][number]) => s.mode === "skip" ? "" : [s.added && `${s.added} added`, s.changed && `${s.changed} changed`, s.removed && `${s.removed} removed`, s.kept && `${s.kept} kept`].filter(Boolean).join(", ") || "no difference";

/** Download everything the extension stores for the project, or restore it (all of it, or only chosen parts) from such a file. */
export function BackupTab(p: { projectId: string; projectName: string; dirty: boolean; onRestored(): void }) {
  const [include, setInclude] = React.useState<Record<SectionId, boolean>>({ ...DEFAULT_INCLUDE });
  const [counts, setCounts] = React.useState<Partial<Record<SectionId, number>>>({});
  const [msg, setMsg] = React.useState<{ text: string; bad?: boolean }>({ text: "" });
  const [file, setFile] = React.useState<BackupFile>();
  const [modes, setModes] = React.useState<Partial<Record<SectionId, Mode>>>({});
  const [teamIds, setTeamIds] = React.useState<Set<string>>();
  const [busy, setBusy] = React.useState(false);
  const [plan, setPlan] = React.useState<RestorePlan>();
  const { ask, dialog } = useReason();
  const tz = React.useMemo(localTimeZone, []);
  const picker = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    readCurrent(p.projectId).then(c => setCounts({
      grids: Object.keys(c.config.grids).length, rules: c.config.rules.length, cascades: c.config.cascades.length, calculations: (c.config.calculations ?? []).length,
      lookups: Object.keys(c.config.lookups ?? {}).length, controls: c.config.commentOnly ? 1 : 0, capacitySettings: 1, capacityRegister: c.register.length, audit: c.audit.length,
    })).catch(() => undefined);
    listTeams(p.projectId).then(t => setTeamIds(new Set(t.map(x => x.id)))).catch(() => undefined);
  }, [p.projectId]);

  const user = () => { const u = SDK.getUser(); return { id: u.name || u.id, name: u.displayName }; };
  const download = async (inc: Partial<Record<SectionId, boolean>>, prefix = "") => {
    const current = await readCurrent(p.projectId);
    const f = buildBackup({ project: { id: p.projectId, name: p.projectName }, user: user(), extensionVersion: extensionVersion(), current, include: inc });
    downloadFile(prefix + backupFileName(p.projectName), JSON.stringify(f, null, 2), "application/json");
  };

  const backup = async () => {
    setBusy(true);
    try { await download(include); setMsg({ text: "Backup downloaded. It contains names, emails and business rules: keep it somewhere safe." }); }
    catch (e) { setMsg({ text: "Backup failed: " + (e as Error).message, bad: true }); } finally { setBusy(false); }
  };

  const choose = async (f: File) => {
    setPlan(undefined);
    const parsed = parseBackup(await f.text());
    if (!parsed.file) { setFile(undefined); setMsg({ text: parsed.error!, bad: true }); return; }
    setFile(parsed.file);
    setModes(Object.fromEntries(presentSections(parsed.file).map(id => [id, id === "audit" ? "skip" : "replace"])) as Partial<Record<SectionId, Mode>>);
    setMsg({ text: "" });
  };

  // the preview is recomputed whenever the choices change
  React.useEffect(() => {
    if (!file) { setPlan(undefined); return; }
    let live = true;
    readCurrent(p.projectId).then(c => { if (live) setPlan(planRestore(c, file, modes)); }).catch(e => live && setMsg({ text: "Could not read the current settings: " + e.message, bad: true }));
    return () => { live = false; };
  }, [file, modes, p.projectId]);

  const warnings = file ? restoreWarnings(file, { projectId: p.projectId, projectName: p.projectName, teamIds }) : [];
  const chosen = Object.values(modes).some(m => m && m !== "skip");

  const restore = async () => {
    if (!file || !plan) return;
    const why = await ask("Restore from backup?", `${plan.sections.filter(s => s.mode !== "skip").map(s => `${SECTIONS.find(x => x.id === s.id)!.label.split(" (")[0]}: ${effect(s)}`).join(" · ")}. A backup of the current settings is downloaded first.`);
    if (!why) return;
    setBusy(true);
    try {
      const current = await readCurrent(p.projectId);
      const fresh = planRestore(current, file, modes);                 // computed again from what is stored right now
      await download({ ...DEFAULT_INCLUDE, audit: false }, "before-restore-");
      const done = await applyRestore(p.projectId, current, fresh, why, { project: file.project.name || file.project.id, createdAt: file.createdAt, by: file.createdBy.name });
      setFile(undefined); setPlan(undefined); setModes({});
      setMsg({ text: `Restored: ${done.join(", ") || "nothing to change"}. A backup of the previous settings was downloaded.` });
      p.onRestored();
    } catch (e) { setMsg({ text: "Restore stopped: " + (e as Error).message + " Part of it may have been applied; the audit log and the downloaded backup show the state before.", bad: true }); }
    finally { setBusy(false); }
  };

  return (
    <div>
      {dialog}
      <Section id="backup" no={1} title="Backup" help="Download everything the extension stores for this project as one file." status="ok" open>
        <div className="help">Choose what goes into the file. Process settings (fields, picklists, layouts, rules) and the rows on work items are not part of it: they live in Azure DevOps.</div>
        {SECTIONS.map(s => (
          <label key={s.id} style={{ display: "block", margin: "3px 0" }}>
            <input type="checkbox" checked={include[s.id]} onChange={e => setInclude({ ...include, [s.id]: e.target.checked })} /> {s.label}
            {counts[s.id] !== undefined && <span className="muted"> – {s.id === "capacitySettings" || s.id === "controls" ? (counts[s.id] ? "set" : "not set") : `${counts[s.id]} now`}</span>}
          </label>
        ))}
        <div className="toolbar"><button className="btn primary" disabled={busy || !Object.values(include).some(Boolean)} onClick={backup}>Download backup</button></div>
      </Section>

      <Section id="restore" no={2} title="Restore" help="Load a backup file, choose which parts to restore and how." status={file ? "todo" : "off"} open>
        {p.dirty && <div className="err" role="alert">You have unsaved changes. Save or discard them before restoring, otherwise they would be lost.</div>}
        <div className="toolbar">
          <input ref={picker} type="file" accept=".json,application/json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) choose(f); e.target.value = ""; }} />
          <button className="btn" disabled={busy} onClick={() => picker.current?.click()}>Choose backup file…</button>
        </div>
        {file && (
          <>
            <div className="card">
              <b>{file.project.name || "(unknown project)"}</b> · made {file.createdAt ? formatStamp(new Date(file.createdAt), tz) : "?"} by {file.createdBy.name || "?"} · extension {file.extensionVersion || "?"}
            </div>
            {warnings.map((w, i) => <div key={i} className="err" role="status">⚠ {w}</div>)}
            <table className="grid" style={{ width: "100%" }}>
              <thead><tr><th>Part</th><th>In the file</th><th>Restore</th><th>What would happen</th></tr></thead>
              <tbody>
                {presentSections(file).map(id => (
                  <tr key={id}>
                    <td>{SECTIONS.find(s => s.id === id)!.label}</td>
                    <td>{id === "capacitySettings" || id === "controls" ? "included" : countOf(file, id)}</td>
                    <td>
                      <select value={modes[id] ?? "skip"} onChange={e => setModes({ ...modes, [id]: e.target.value as Mode })}>
                        <option value="skip">{MODE_LABEL.skip}</option>
                        {id !== "audit" && <option value="replace">{MODE_LABEL.replace}</option>}
                        <option value="merge">{id === "audit" ? "Add entries the log does not have" : MODE_LABEL.merge}</option>
                      </select>
                    </td>
                    <td>{plan?.sections.find(s => s.id === id) ? effect(plan.sections.find(s => s.id === id)!) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="help">Replace makes the part exactly like the file: anything that is not in the file is removed. Add missing only keeps everything you have and adds what the file has and you do not. The audit log is never overwritten.</div>
            <div className="toolbar">
              <button className="btn primary" disabled={busy || p.dirty || !chosen || !plan} onClick={restore}>Restore…</button>
              <button className="btn" disabled={busy} onClick={() => { setFile(undefined); setPlan(undefined); }}>Cancel</button>
              <span className="muted">You will be asked for a reason, and a backup of the current settings is downloaded first.</span>
            </div>
          </>
        )}
      </Section>
      {msg.text && <div className={msg.bad ? "err" : "ok"} role="status">{msg.text}</div>}
    </div>
  );
}
