/** "1,234.5" and "1,234" use the comma as thousands separator; "7,5" and "7,25" use it as decimal comma. */
export function parseNumber(text: string): number {
  const t = text.trim();
  return parseFloat(/^-?\d+,\d{1,2}$/.test(t) ? t.replace(",", ".") : t.replace(/,/g, ""));
}
