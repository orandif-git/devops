import * as SDK from "azure-devops-extension-sdk";
import { CommonServiceIds, IHostNavigationService, IHostPageLayoutService, ILocationService } from "azure-devops-extension-api";
import { encodeView, ViewState } from "../core/views";

/** The view and full-screen choice carried in the address of the page (the `pv` and `full` parameters), if any. */
export async function readLink(): Promise<{ pv?: string; full: boolean }> {
  try {
    const q = await (await SDK.getService<IHostNavigationService>(CommonServiceIds.HostNavigationService)).getQueryParams();
    const pv = q?.pv, full = q?.full;
    return { pv: pv ? String(pv) : undefined, full: pv ? full !== "0" : full === "1" };   // a shared view opens full screen unless asked otherwise
  } catch { return { full: false }; }
}

/** An address that opens this page with the given view, full screen. */
export async function buildLink(state: ViewState, defaults: ViewState): Promise<string> {
  const nav = await SDK.getService<IHostNavigationService>(CommonServiceIds.HostNavigationService);
  let base = "";
  try {
    const route = await nav.getPageRoute();
    base = await (await SDK.getService<ILocationService>(CommonServiceIds.LocationService)).routeUrl(route.id, route.routeValues);
  } catch { /* use the page that holds this one */ }
  if (!base) base = document.referrer.split("#")[0].split("?")[0];
  if (!base) throw new Error("The address of this page could not be read.");
  return `${base}?pv=${encodeView(state, defaults)}&full=1`;
}

/** Full screen of the Azure DevOps page (hides the menus and header), the way the expand icon on boards does. Best effort. */
export async function setHostFullScreen(on: boolean): Promise<void> {
  try { await (await SDK.getService<IHostPageLayoutService>(CommonServiceIds.HostPageLayoutService)).setFullScreenMode(on); } catch { /* not offered here */ }
}
