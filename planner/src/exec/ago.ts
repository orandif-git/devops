/** "just now", "5 min ago", "2 h ago", or the date when older than a day. */
export function ago(from: number, now: number = Date.now()): string {
  if (!Number.isFinite(from)) return "just now";
  const s = Math.max(0, Math.round((now - from) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(from).toLocaleDateString();
}
