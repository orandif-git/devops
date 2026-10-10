/** Edit an auto-fill lookup "by category": { External: [Vendor, IT Contract], Business: [Business] } + fallback Internal. */
export type Groups = { category: string; values: string[] }[];

export const mapToGroups = (map: Record<string, string>): Groups => {
  const by = new Map<string, string[]>();
  for (const [value, category] of Object.entries(map)) { if (!by.has(category)) by.set(category, []); by.get(category)!.push(value); }
  return Array.from(by, ([category, values]) => ({ category, values }));
};

/** A value listed under two categories keeps the first; empty categories/values are dropped. */
export const groupsToMap = (groups: Groups): Record<string, string> => {
  const map: Record<string, string> = {};
  for (const g of groups) for (const v of g.values) { const key = v.trim(); if (key && g.category.trim() && !(key in map)) map[key] = g.category.trim(); }
  return map;
};

/** Source values that no category lists (they will receive the fallback). */
export const unassigned = (options: string[], map: Record<string, string>) =>
  options.filter(o => !Object.keys(map).some(k => k.toLowerCase() === o.toLowerCase()));
