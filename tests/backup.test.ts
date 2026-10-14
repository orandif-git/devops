import { describe, expect, it } from "vitest";
import { buildBackup, countOf, DEFAULT_INCLUDE, parseBackup, planRestore, presentSections, restoreWarnings, Current } from "../src/core/backup";
import { emptyConfig, GridConfig } from "../src/core/types";

const grid = (name: string, opts: string[] = ["A", "B"]): GridConfig => ({ columns: [{ id: "c", name, type: "dropdown", options: opts }] });
const rec = (key: string, h = 160) => ({ key, name: key, defaultHours: h, overrides: {} });
const entry = (id: string) => ({ id, at: "2026-10-01T00:00:00.000Z", userId: "u", userName: "U", area: "configuration" as const, reason: "r", comment: "c", changes: [] });
const current = (): Current => ({
  config: { ...emptyConfig(), grids: { G1: grid("One"), G2: grid("Two") }, rules: [{ id: "r1", name: "R1" } as never], lookups: { T: { map: { a: "b" } } } },
  capacitySettings: { source: "register", defaultHours: 160 },
  register: [rec("a"), rec("b")],
  audit: [entry("e1")],
});
const make = (c: Current, inc = DEFAULT_INCLUDE) => buildBackup({ project: { id: "P", name: "Proj" }, user: { id: "u", name: "U" }, extensionVersion: "2.1.1", current: c, include: inc, now: new Date("2026-10-13T10:00:00Z") });

describe("backup file", () => {
  it("contains only the chosen parts and survives a round trip, including dropdown values", () => {
    const f = make(current(), { ...DEFAULT_INCLUDE, capacityRegister: false, audit: false });
    expect(presentSections(f)).not.toContain("capacityRegister");
    expect(presentSections(f)).not.toContain("audit");
    const back = parseBackup(JSON.stringify(f)).file!;
    expect(back.sections.grids!.G1.columns[0].options).toEqual(["A", "B"]);
    expect(countOf(back, "grids")).toBe(2);
    expect(make(current(), { ...DEFAULT_INCLUDE, audit: true }).sections.audit).toHaveLength(1);
  });
  it("refuses files that are not backups, are damaged, newer, or carry unsafe keys", () => {
    expect(parseBackup("nope").error).toMatch(/not valid JSON/);
    expect(parseBackup(JSON.stringify({ a: 1 })).error).toMatch(/not a Grid & Rules backup/);
    expect(parseBackup(JSON.stringify({ format: "wig-backup", formatVersion: 99, sections: {} })).error).toMatch(/newer version/);
    expect(parseBackup(JSON.stringify({ format: "wig-backup", formatVersion: 1, sections: { grids: { G: { columns: "x" } } } })).error).toMatch(/damaged/);
    expect(parseBackup('{"format":"wig-backup","formatVersion":1,"sections":{"lookups":{"__proto__":{"x":1}}}}').error).toMatch(/damaged/);
    expect(parseBackup(JSON.stringify({ format: "wig-backup", formatVersion: 1, sections: { rules: [{ name: "no id" }] } })).error).toMatch(/damaged/);
  });
});

describe("restore plan", () => {
  const file = () => make({ ...current(), config: { ...current().config, grids: { G1: grid("One changed"), G3: grid("Three") }, rules: [{ id: "r2", name: "R2" } as never] }, register: [rec("b", 100), rec("c")] });
  it("replace makes the part exactly like the file and counts the differences", () => {
    const p = planRestore(current(), file(), { grids: "replace", capacityRegister: "replace" });
    expect(Object.keys(p.config.grids).sort()).toEqual(["G1", "G3"]);
    expect(p.sections.find(s => s.id === "grids")).toMatchObject({ added: 1, changed: 1, removed: 1 });
    expect(p.register.save.map(r => r.key).sort()).toEqual(["b", "c"]);
    expect(p.register.remove).toEqual(["a"]);
    expect(p.config.rules.map(r => r.id)).toEqual(["r1"]);               // a part that was not chosen is untouched
  });
  it("add missing only keeps what exists and adds what is new", () => {
    const p = planRestore(current(), file(), { grids: "merge", rules: "merge", capacityRegister: "merge" });
    expect(Object.keys(p.config.grids).sort()).toEqual(["G1", "G2", "G3"]);
    expect(p.config.grids.G1.columns[0].name).toBe("One");               // the existing one is not overwritten
    expect(p.config.rules.map(r => r.id).sort()).toEqual(["r1", "r2"]);
    expect(p.register.save.map(r => r.key)).toEqual(["c"]);
    expect(p.register.remove).toEqual([]);
  });
  it("never overwrites the audit log: only unknown entries are added", () => {
    const f = make({ ...current(), audit: [entry("e1"), entry("e2")] }, { ...DEFAULT_INCLUDE, audit: true });
    const p = planRestore(current(), f, { audit: "merge" });
    expect(p.audit.map(e => e.id)).toEqual(["e2"]);
    expect(planRestore(current(), f, { audit: "skip" }).audit).toEqual([]);
  });
  it("does nothing for parts that are skipped or not in the file", () => {
    const p = planRestore(current(), make(current(), { ...DEFAULT_INCLUDE, rules: false }), { rules: "replace", grids: "skip" });
    expect(p.sections).toEqual([]);
    expect(p.config.grids).toEqual(current().config.grids);
  });
});

describe("restore warnings", () => {
  it("warns about another project and teams that do not exist here", () => {
    const f = make({ ...current(), config: { ...current().config, controls: [{ id: "r1", name: "R", enabled: true, mode: "comments" as const, workItemTypes: [], teams: [{ id: "t9", name: "Gone Team" }], people: [], fields: [] }] } });
    const w = restoreWarnings(f, { projectId: "OTHER", projectName: "Other", teamIds: new Set(["t1"]) });
    expect(w.join("|")).toMatch(/made in project “Proj”/);
    expect(w.join("|")).toMatch(/Gone Team/);
    expect(restoreWarnings(f, { projectId: "P", projectName: "Proj", teamIds: new Set(["t9"]) })).toEqual([]);
  });
});

describe("controls in a backup", () => {
  it("converts an older single comment-only rule into a rule and keeps new rule lists", () => {
    const base = { format: "wig-backup", formatVersion: 1, extensionVersion: "x", createdAt: "", createdBy: {}, project: {} };
    const old = parseBackup(JSON.stringify({ ...base, format: make(current()).format, sections: { controls: { enabled: true, workItemTypes: ["Epic"], teams: [], people: ["A <a>"], allowedFields: ["System.History"] } } }));
    expect(old.file!.sections.controls).toMatchObject([{ name: "Comment-only access", mode: "comments", enabled: true, people: ["A <a>"], workItemTypes: ["Epic"] }]);
    const bad = parseBackup(JSON.stringify({ ...base, format: make(current()).format, sections: { controls: [1] } }));
    expect(bad.error).toMatch(/controls/);
  });
});
