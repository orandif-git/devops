/** "HTTP 400 for wit/workitemsbatch: TF51535: Cannot find field Custom.x." – Azure DevOps says what is wrong in the response body, so show it. */
export function httpError(status: number, path: string, body: string): string {
  let msg = "";
  try { const j = JSON.parse(body) as { message?: string; value?: { Message?: string } }; msg = j.message ?? j.value?.Message ?? ""; } catch { /* not JSON */ }
  msg = msg.replace(/\s+/g, " ").trim().slice(0, 240);
  return `HTTP ${status} for ${path}${msg ? `: ${msg}` : ""}`;
}
