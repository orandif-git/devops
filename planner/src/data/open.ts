import * as SDK from "azure-devops-extension-sdk";
import { CommonServiceIds, ILocationService } from "azure-devops-extension-api";
import { IWorkItemFormNavigationService, WorkItemTrackingServiceIds } from "azure-devops-extension-api/WorkItemTracking/WorkItemTrackingServices";

async function base(): Promise<string> {
  try { const h = SDK.getHost(); if (h.isHosted && h.name) return `https://dev.azure.com/${h.name}`; } catch { /* Server */ }
  return (await (await SDK.getService<ILocationService>(CommonServiceIds.LocationService)).getServiceLocation()).replace(/\/+$/, "");
}

export async function workItemUrl(project: string, id: number): Promise<string> { return `${await base()}/${encodeURIComponent(project)}/_workitems/edit/${id}`; }

/** Open a work item: its form on top of this page when Azure DevOps offers that, otherwise in a new tab. `newTab` forces the tab. */
export async function openWorkItem(project: string, id: number, newTab = false): Promise<void> {
  if (!newTab) {
    try { await (await SDK.getService<IWorkItemFormNavigationService>(WorkItemTrackingServiceIds.WorkItemFormNavigationService)).openWorkItem(id, false); return; } catch { /* not available on this server: use the link */ }
  }
  window.open(await workItemUrl(project, id), "_blank", "noopener");
}
