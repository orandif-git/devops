import * as SDK from "azure-devops-extension-sdk";
import { CommonServiceIds, ILocationService } from "azure-devops-extension-api";
import { withTimeout } from "../../src/shared/timeout";

/** The organization / collection address: directly on Services, asked from the host on Server. */
async function baseUrl(): Promise<string> {
  try { const h = SDK.getHost(); if (h.isHosted && h.name) return `https://dev.azure.com/${h.name}`; } catch { /* Server */ }
  return (await withTimeout((await SDK.getService<ILocationService>(CommonServiceIds.LocationService)).getServiceLocation(), "Finding the server address")).replace(/\/+$/, "");
}

/** Read-only REST call with an explicit api-version that Azure DevOps Server 2019/2020 and Services all accept. POST is used only for queries (WIQL, batch read). */
export async function rest<T>(method: "GET" | "POST", path: string, opts: { project?: string; query?: Record<string, string | number>; body?: unknown } = {}): Promise<T> {
  const token = await SDK.getAccessToken();
  const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(opts.query ?? {}).map(([k, v]) => [k, String(v)])), "api-version": "5.0" });
  const scope = opts.project ? `${encodeURIComponent(opts.project)}/` : "";
  const res = await withTimeout(fetch(`${await baseUrl()}/${scope}_apis/${path}?${qs}`, {
    method, headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(opts.body ? { "Content-Type": "application/json" } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined,
  }), `Calling ${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}${res.status === 400 ? " (the server refused the request)" : ""}`);
  return (await res.json()) as T;
}
