/** True when the browser knows this IANA time zone name (for example "Asia/Qatar"). */
export function isTimeZone(tz: string): boolean {
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; }
}

/** Time zone names offered as suggestions (the browser's list when it has one). */
export function knownTimeZones(): string[] {
  const f = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
  try { return typeof f === "function" ? f("timeZone") : ["UTC", "Asia/Qatar"]; } catch { return ["UTC", "Asia/Qatar"]; }
}

/** The time zone of the computer this runs on, or "UTC" when it cannot be told. */
export const localTimeZone = (): string => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { return "UTC"; } };

/**
 * "2026-10-12 17:03 UTC+03:00": the moment in the given IANA time zone, with its offset at that moment (daylight saving included).
 * UTC (or an unknown zone) gives "2026-10-12 14:03 UTC".
 */
export function formatStamp(d: Date, timeZone?: string): string {
  const tz = timeZone && isTimeZone(timeZone) ? timeZone : "UTC";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(d).filter(p => p.type !== "literal").map(p => [p.type, p.value]));
  const text = `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
  const minute = Math.floor(d.getTime() / 60000) * 60000;
  const offset = Math.round((Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute) - minute) / 60000);
  if (offset === 0) return `${text} UTC`;
  const a = Math.abs(offset);
  return `${text} UTC${offset < 0 ? "-" : "+"}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}
