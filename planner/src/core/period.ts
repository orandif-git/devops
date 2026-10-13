import { Period } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");
const ym = (y: number, m0: number) => `${y + Math.floor(m0 / 12)}-${pad(((m0 % 12) + 12) % 12 + 1)}`;

/** The months ("YYYY-MM") a period covers. `today` is injectable for tests. */
export function monthsOfPeriod(p: Period, today = new Date()): string[] {
  const y = today.getUTCFullYear(), m = today.getUTCMonth();
  let first: number, count: number;                       // first = months since year 0
  switch (p.kind) {
    case "year": first = y * 12; count = 12; break;
    case "quarter": first = y * 12 + Math.floor(m / 3) * 3; count = 3; break;
    case "last12": first = y * 12 + m - 11; count = 12; break;
    case "next12": first = y * 12 + m; count = 12; break;
    case "custom": {
      const a = /^(\d{4})-(\d{2})/.exec(p.from ?? ""), b = /^(\d{4})-(\d{2})/.exec(p.to ?? "");
      if (!a || !b) return monthsOfPeriod({ kind: "year" }, today);
      first = +a[1] * 12 + +a[2] - 1; count = Math.max(1, Math.min(60, +b[1] * 12 + +b[2] - 1 - first + 1)); break;
    }
  }
  return Array.from({ length: count }, (_, i) => ym(0, first + i));
}
