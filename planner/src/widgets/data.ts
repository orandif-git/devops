import { validateSettings } from "../core/settings";
import { WidgetConfig, WidgetData, widgetData } from "../core/widgets";
import { loadAll } from "../data/loadAll";
import { loadSettings } from "../data/settingsStore";

/** Read the planner's settings and data (cached, so a dashboard with several widgets reads the Epics only once per change) and compute what a widget draws. */
export async function fetchWidget(project: { id: string; name: string }, cfg: WidgetConfig): Promise<WidgetData> {
  const { settings } = await loadSettings(project.id);
  const problems = validateSettings(settings);
  if (problems.length) throw new Error("The Resource Planner is not set up for this project yet. Open Boards › Resource Planner › Settings first.");
  const loaded = await loadAll(project, settings, { queryId: cfg.queryId || undefined });
  return widgetData(loaded.bookings, loaded.epics, loaded.avail, settings.thresholds, cfg);
}
