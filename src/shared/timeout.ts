export const REST_TIMEOUT_MS = 20000;
/** Turn a stalled call into a clear error instead of an endless "Loading…". */
export function withTimeout<T>(work: Promise<T>, what: string, ms = REST_TIMEOUT_MS): Promise<T> {
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = window.setTimeout(() => reject(new Error(`${what}: Azure DevOps did not answer within ${Math.round(ms / 1000)} seconds`)), ms); });
  return Promise.race([work, timeout]).finally(() => window.clearTimeout(timer)).catch(e => {
    const err = e as { message?: string; status?: number };
    throw new Error(err.message && err.message.startsWith(what) ? err.message : `${what}: ${err.message ?? e}${err.status ? ` (HTTP ${err.status})` : ""}`);
  });
}
