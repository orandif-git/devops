/**
 * Comparable form of a person/key value: "Aman S <A.M@x.com>" -> "a.m@x.com"; other text -> trimmed lower case.
 * On servers with Active Directory the same person appears as "DOMAIN\\user" in one place and "user" in another
 * (people picker versus team capacity), so a domain prefix is dropped: both give "user".
 */
export function keyNorm(v: unknown): string {
  const s = String(v ?? "").trim();
  const m = /<([^<>]+)>\s*$/.exec(s);
  const k = (m ? m[1] : s).trim().toLowerCase();
  const i = k.lastIndexOf("\\");
  return i >= 0 && !k.includes("@") ? k.slice(i + 1) : k;
}
