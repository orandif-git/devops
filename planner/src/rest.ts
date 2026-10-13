import * as SDK from "azure-devops-extension-sdk";
import { CommonServiceIds, ILocationService } from "azure-devops-extension-api";
import { getCompat } from "../../src/shared/ado";
import { withTimeout } from "../../src/shared/timeout";

/**
 * Read-only REST access, written the way Work Item Grid & Rules does it (which runs on Azure DevOps Server 2020 and Services):
 * an explicit api-version 5.0 request to the organization address, never the typed clients' newer version.
 * GET is the shared getCompat itself. POST (used only for queries and batch reads) mirrors its address and token handling.
 */
export const restGet = <T,>(path: string, query: Record<string, string | number> = {}, project?: string): Promise<T> =>
  getCompat<T>(path, query, project ? encodeURIComponent(project) : "");

async function baseUrl(): Promise<string> {
  try { const h = SDK.getHost(); if (h.isHosted && h.name) return `https://dev.azure.com/${h.name}`; } catch { /* Server: ask the host */ }
  return (await withTimeout((await SDK.getService<ILocationService>(CommonServiceIds.LocationService)).getServiceLocation(), "Finding the server address")).replace(/\/+$/, "");
}

export async function restPost<T>(path: string, body: unknown, opts: { project?: string; query?: Record<string, string | number> } = {}): Promise<T> {
  const token = await SDK.getAccessToken();
  const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(opts.query ?? {}).map(([k, v]) => [k, String(v)])), "api-version": "5.0" });
  const scope = opts.project ? `${encodeURIComponent(opts.project)}/` : "";
  const res = await withTimeout(fetch(`${await baseUrl()}/${scope}_apis/${path}?${qs}`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(body),
  }), `Calling ${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return (await res.json()) as T;
}
