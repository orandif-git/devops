import { describe, expect, it } from "vitest";
import { diagnose, diagText } from "../planner/src/core/diagnostics";
import { defaultSettings } from "../planner/src/core/types";

const ok = { ...defaultSettings(), epicStartField: "Custom.Start", epicTargetField: "Custom.End", sources: [{ id: "s", name: "S", dataField: "Custom.G", columns: { resource: "r" }, excludedStatuses: [] }], capacityTeams: [{ id: "1", name: "T" }] } as never;
const stats = { rows: 10, counted: 8, excluded: 1, noPerson: 1, unscheduled: 2, estimated: 2, errored: 0, unreadable: false };
const b = (person: string) => ({ epicId: 1, sourceId: "s", person, personName: person + " X", month: "2026-10", hours: 5, estimated: false });

describe("planner diagnostics", () => {
  it("flags incomplete settings and asks to load data first", () => {
    const d = diagnose({ settings: defaultSettings() });
    expect(d[0].level).toBe("bad"); expect(d[d.length - 1].title).toBe("Data"); expect(d[d.length - 1].level).toBe("warn");
  });
  it("reports rows without hours, people without capacity and capacity messages", () => {
    const d = diagnose({ settings: ok, loaded: { epics: 3, bookings: [b("ann"), b("zed")] as never, stats, capacityPeople: ["ann"], capacityMessages: [{ team: "T", messages: ["no working days"] }], ms: 1500 } });
    const by = Object.fromEntries(d.map(x => [x.title, x]));
    expect(by["Settings"].level).toBe("ok"); expect(by["Rows without monthly hours"].detail).toContain("2 row");
    expect(by["People without capacity"].detail).toContain("zed X"); expect(by["People without capacity"].detail).not.toContain("ann");
    expect(by["Team capacity"].detail).toContain("no working days");
    expect(diagText(d)).toContain("WARN People without capacity");
  });
  it("is clean when everything matches", () => {
    const d = diagnose({ settings: ok, loaded: { epics: 3, bookings: [b("ann")] as never, stats: { ...stats, unscheduled: 0, noPerson: 0, estimated: 0 }, capacityPeople: ["ann"], capacityMessages: [], ms: 900 } });
    expect(d.every(x => x.level === "ok")).toBe(true);
  });
});
