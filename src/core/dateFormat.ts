/** Display formats for month and date values. Stored values (YYYY-MM, YYYY-MM-DD) never change; only the text shown does. */
export const DATE_FORMATS = ["YYYY-MM", "MM-YYYY", "MMM-YY", "MMM YYYY", "MMMM YYYY", "DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"] as const;

const TOKEN = /YYYY|YY|MMMM|MMM|MM|M|DD|D/g;
const SHAPE = /^(\d{4})-(\d{2})(?:-(\d{2}))?/;

export const isDateFormat = (f: string) => f.trim().length > 0 && f.length <= 30 && /^[YMD\s\-/.,]+$/.test(f) && /YY|M|D/.test(f);

function monthName(month: number, style: "long" | "short"): string {
  try { return new Intl.DateTimeFormat(undefined, { month: style, timeZone: "UTC" }).format(new Date(Date.UTC(2000, month - 1, 1))); }
  catch { return String(month).padStart(2, "0"); }
}

/** "2026-10" or "2026-10-12" shown as the given format; anything that is not a month/date is returned unchanged. */
export function formatDateText(value: unknown, format: string | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (!format || !isDateFormat(format)) return text;
  const m = SHAPE.exec(text.trim());
  if (!m) return text;
  const y = m[1], mo = Number(m[2]);
  if (mo < 1 || mo > 12) return text;
  const d = m[3];
  if (!d && /D/.test(format.replace(/YYYY|YY/g, ""))) return text;       // a month cannot be shown as a day
  return format.replace(TOKEN, t => {
    switch (t) {
      case "YYYY": return y;
      case "YY": return y.slice(2);
      case "MMMM": return monthName(mo, "long");
      case "MMM": return monthName(mo, "short");
      case "MM": return String(mo).padStart(2, "0");
      case "M": return String(mo);
      case "DD": return d!;
      default: return String(Number(d));
    }
  });
}
