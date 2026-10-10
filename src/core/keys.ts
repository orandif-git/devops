/** Comparable form of a person/key value: "Aman S <A.M@x.com>" -> "a.m@x.com"; other text -> trimmed lower case. */
export function keyNorm(v: unknown): string {
  const s = String(v ?? "").trim();
  const m = /<([^<>]+)>\s*$/.exec(s);
  return (m ? m[1] : s).trim().toLowerCase();
}
