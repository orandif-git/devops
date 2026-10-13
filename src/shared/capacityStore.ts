import { CapacityRecord, CapacityRegister, emptyRegister } from "../core/capacity";
import { keyNorm } from "../core/keys";
import { CalendarBook, CalendarSettings, defaultCalendar, nativeCalendarBook, registerCalendarBook } from "../core/schedule";
import { NativeReport, NativeTeam, normalizeWorkingDays, recordsFromNative, reportNative, toIsoDate } from "../core/nativeCapacity";
import { dataManager, getCompat, getProject, getTeamsCompat, withTimeout, workClient } from "./ado";
import { projectAdminStatus } from "./presetAccess";

const COLLECTION = "wig-capacity";

export interface TeamRef { id: string; name: string }
/** Where capacity is maintained: this extension's register, or Azure DevOps team capacity (Boards → Sprints → Capacity). */
export type CapacitySource = "register" | "teams";

export interface CapacitySettings {
  source: CapacitySource;
  /** source = "teams": the teams whose iterations hold the capacity (e.g. one yearly iteration "Capacity 2026") */
  capacityTeams: TeamRef[];
  /** no longer used: only project administrators edit capacity (kept so stored settings still load) */
  editorTeams: TeamRef[];
  /** hours per month for registered people who have no default of their own */
  defaultHours: number | null;
  /** source = "register": working week, hours per day and holidays used when effort is scheduled by dates */
  calendar: CalendarSettings;
}
export const defaultSettings = (): CapacitySettings => ({ source: "register", capacityTeams: [], editorTeams: [], defaultHours: null, calendar: defaultCalendar() });

const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(16); };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
const recordId = (projectId: string, key: string) => `res-${projectId}-${slug(key)}-${hash(key)}`;
const settingsId = (projectId: string) => `settings-${projectId}`;
const is404 = (e: unknown) => (e as { status?: number })?.status === 404 || /not exist|404|DocumentDoesNotExist/i.test(String((e as Error)?.message ?? e));

export async function loadSettings(projectId: string): Promise<CapacitySettings> {
  try {
    const doc = await (await dataManager()).getDocument(COLLECTION, settingsId(projectId));
    const stored = doc?.settings as Partial<CapacitySettings> | undefined;
    return { ...defaultSettings(), ...stored, calendar: { ...defaultCalendar(), ...(stored?.calendar ?? {}) } };
  } catch (e) { if (is404(e)) return defaultSettings(); throw e; }
}

export async function saveSettings(projectId: string, settings: CapacitySettings): Promise<void> {
  await (await dataManager()).setDocument(COLLECTION, { id: settingsId(projectId), kind: "settings", projectId, settings, __etag: -1 });
}

/** One document per person, so two managers editing different people never overwrite each other. */
export async function listRecords(projectId: string): Promise<CapacityRecord[]> {
  let docs: { kind?: string; projectId?: string; record?: CapacityRecord }[] = [];
  try { docs = await (await dataManager()).getDocuments(COLLECTION); } catch (e) { if (!is404(e)) throw e; }
  return docs.filter(d => d.kind === "resource" && d.projectId === projectId && d.record).map(d => d.record!)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveRecord(projectId: string, record: CapacityRecord): Promise<void> {
  await (await dataManager()).setDocument(COLLECTION, { id: recordId(projectId, record.key), kind: "resource", projectId, record, __etag: -1 });
}

export async function deleteRecord(projectId: string, key: string): Promise<void> {
  try { await (await dataManager()).deleteDocument(COLLECTION, recordId(projectId, key)); } catch (e) { if (!is404(e)) throw e; }
}

// ---------- capacity from Azure DevOps team capacity ----------
/** Set once the explicit-version request succeeded after the library's own request was refused (older Azure DevOps Server). */
let typedRefused = false;
let nativeCache: { key: string; at: number; value: { teams: NativeTeam[]; report: NativeReport[] } } | undefined;

/** Read iterations, working days, per-person capacity and days off of the chosen teams. Cached for a minute. */
export async function readNativeCapacity(teamRefs: TeamRef[], force = false): Promise<{ teams: NativeTeam[]; report: NativeReport[] }> {
  const key = teamRefs.map(t => t.id).sort().join(",");
  if (!force && nativeCache && nativeCache.key === key && Date.now() - nativeCache.at < 60000) return nativeCache.value;
  const project = await getProject();
  const work = await workClient();
  const teams: NativeTeam[] = [];
  const enc = encodeURIComponent;
  /** The typed client first (it works on Services and newer servers); if the server refuses its api-version, ask again with an explicit 5.0. */
  const either = async <T,>(what: string, typed: () => Promise<T>, compat: () => Promise<T>): Promise<T> => {
    if (typedRefused) return withTimeout(compat(), what);              // this server already refused the library's api-version: do not ask it again
    try { return await withTimeout(typed(), what); }
    catch (first) {
      try { const r = await withTimeout(compat(), what); typedRefused = true; return r; }
      catch (second) { throw new Error(`${(first as Error).message} / ${(second as Error).message}`); }
    }
  };
  for (const t of teamRefs) {
    const ctx = { projectId: project.id, project: project.name, teamId: t.id, team: t.name } as never;
    const scope = `${enc(project.id)}/${enc(t.id)}`;
    const settings = await either(`Reading the settings of team ${t.name}`, () => work.getTeamSettings(ctx) as Promise<{ workingDays?: unknown[] }>, () => getCompat<{ workingDays?: unknown[] }>("work/teamsettings", {}, scope));
    const iterations = await either(`Reading the iterations of team ${t.name}`, () => work.getTeamIterations(ctx) as Promise<{ id: string; name: string; attributes?: { startDate?: unknown; finishDate?: unknown } }[]>,
      async () => (await getCompat<{ value?: { id: string; name: string; attributes?: { startDate?: unknown; finishDate?: unknown } }[] }>("work/teamsettings/iterations", {}, scope)).value ?? []);
    const team: NativeTeam = { teamName: t.name, workingDays: normalizeWorkingDays((settings.workingDays ?? []) as unknown[]), iterations: [] };
    for (const it of iterations) {
      type Cap = { teamMembers?: { teamMember: { displayName: string; uniqueName: string }; activities?: { capacityPerDay: number }[]; daysOff?: { start: unknown; end: unknown }[] }[] };
      const [caps, off] = await Promise.all([
        either(`Reading the capacity of ${it.name}`, () => work.getCapacitiesWithIdentityRefAndTotals(ctx, it.id) as unknown as Promise<Cap>,
          async () => { const r = await getCompat<Cap & { value?: Cap["teamMembers"] }>(`work/teamsettings/iterations/${enc(it.id)}/capacities`, {}, scope); return { teamMembers: r.teamMembers ?? r.value ?? [] }; }),
        either(`Reading the team days off of ${it.name}`, () => work.getTeamDaysOff(ctx, it.id) as unknown as Promise<{ daysOff?: { start: unknown; end: unknown }[] }>, () => getCompat<{ daysOff?: { start: unknown; end: unknown }[] }>(`work/teamsettings/iterations/${enc(it.id)}/teamdaysoff`, {}, scope))
          .catch(() => ({ daysOff: [] as { start: unknown; end: unknown }[] })),
      ]);
      team.iterations.push({
        name: it.name, start: toIsoDate(it.attributes?.startDate), finish: toIsoDate(it.attributes?.finishDate),
        teamDaysOff: (off.daysOff ?? []).map(d => ({ start: toIsoDate(d.start), end: toIsoDate(d.end) })),
        members: (caps.teamMembers ?? []).map(m => ({
          name: `${m.teamMember.displayName} <${m.teamMember.uniqueName}>`,
          capacityPerDay: (m.activities ?? []).reduce((sum, a) => sum + (a.capacityPerDay || 0), 0),
          daysOff: (m.daysOff ?? []).map(d => ({ start: toIsoDate(d.start), end: toIsoDate(d.end) })),
        })),
      });
    }
    teams.push(team);
  }
  const value = { teams, report: reportNative(teams) };
  nativeCache = { key, at: Date.now(), value };
  return value;
}

/** The people and their capacity, from whichever source is configured. */
export async function loadCapacityRecords(projectId: string, settings?: CapacitySettings): Promise<{ records: CapacityRecord[]; source: CapacitySource }> {
  const s = settings ?? await loadSettings(projectId);
  if (s.source === "teams") return { records: recordsFromNative((await readNativeCapacity(s.capacityTeams)).teams), source: "teams" };
  return { records: await listRecords(projectId), source: "register" };
}

/** Calendars of the people, from whichever source is configured (used to turn start date + effort into months). */
export async function loadCalendarBook(projectId: string): Promise<CalendarBook> {
  const s = await loadSettings(projectId);
  if (s.source === "teams") {
    if (!s.capacityTeams.length) throw new Error("No team is selected for Azure DevOps team capacity (Grid & Rules → Capacity).");
    return nativeCalendarBook((await readNativeCapacity(s.capacityTeams)).teams);
  }
  return registerCalendarBook(await listRecords(projectId), s.calendar);
}

export async function loadRegister(projectId: string): Promise<CapacityRegister> {
  const settings = await loadSettings(projectId);
  const { records } = await loadCapacityRecords(projectId, settings);
  const reg = emptyRegister();
  reg.projectDefault = settings.defaultHours;
  for (const r of records) reg.resources[keyNorm(r.key)] = r;
  return reg;
}

export const listTeams = async (projectId: string): Promise<TeamRef[]> =>
  (await withTimeout(getTeamsCompat(projectId, 200), "Loading teams")).map(t => ({ id: t.id, name: t.name })).sort((a, b) => a.name.localeCompare(b.name));

/**
 * May the current user edit capacity? Project administrators only.
 * If the permission check itself fails, editing stays possible (with a notice) so that a real administrator is not locked out.
 * Note: this is access control inside the extension's pages, not a security boundary of Azure DevOps.
 */
export async function checkCanEdit(projectId: string): Promise<{ canEdit: boolean; reason: string }> {
  const status = await projectAdminStatus(projectId);
  if (status === "yes") return { canEdit: true, reason: "You are a project administrator, so you can edit." };
  if (status === "unknown") return { canEdit: true, reason: "Your permissions could not be checked, so editing is allowed. Only project administrators should edit capacity." };
  return { canEdit: false, reason: "Read-only: only project administrators can edit capacity." };
}
