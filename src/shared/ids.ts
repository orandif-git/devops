/**
 * Short document ids. Azure DevOps keeps the documents of an extension apart by id, and ids longer than about 50 characters were seen
 * to be stored as the same document when they differ only near the end (audit entries replaced each other). So the project and the
 * record are each represented by a fixed-length hash and every id stays around 30 characters.
 */
const hashOf = (s: string, seed: number) => { let h = seed >>> 0; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h.toString(36).padStart(7, "0"); };
/** 14 characters: two independent 32-bit hashes. */
export const shortHash = (s: string) => hashOf(s, 2166136261) + hashOf(s, 0x9e3779b1);
export const MAX_SAFE_ID = 40;
