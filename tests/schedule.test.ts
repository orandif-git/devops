import { describe, expect, it } from "vitest";
import { applySchedule, defaultCalendar, expandMonths, nativeCalendarBook, registerCalendarBook, scheduleEffort, setCalendarBook, PersonDays } from "../src/core/schedule";
import { NativeTeam } from "../src/core/nativeCapacity";
import { CapacityRecord } from "../src/core/capacity";

const monFri: PersonDays = { day: iso => { const d = new Date(iso + "T00:00:00Z").getUTCDay(); return d >= 1 && d <= 5 ? 8 : 0; } };

describe("scheduleEffort", () => {
  it("80 h from a Sunday: 40 h in October, 40 h in November, ends 6 Nov", () => {
    const r = scheduleEffort("2026-10-25", 80, 100, monFri);
    expect(r.months).toEqual({ "2026-10": 40, "2026-11": 40 });
    expect(r.end).toBe("2026-11-06");
    expect(r.workingDays).toBe(10);
  });
  it("16 h at 50% takes 4 working days", () => {
    const r = scheduleEffort("2026-11-02", 16, 50, monFri);
    expect(r.end).toBe("2026-11-05");
    expect(r.months).toEqual({ "2026-11": 16 });
  });
  it("80 h at 50% from 16 Nov: 44 h Nov, 36 h Dec", () => {
    const r = scheduleEffort("2026-11-16", 80, 50, monFri);
    expect(r.months).toEqual({ "2026-11": 44, "2026-12": 36 });
    expect(r.end).toBe("2026-12-11");
  });
  it("160 h from 9 Nov: 128 h Nov, 32 h Dec", () => {
    const r = scheduleEffort("2026-11-09", 160, 100, monFri);
    expect(r.months).toEqual({ "2026-11": 128, "2026-12": 32 });
    expect(r.end).toBe("2026-12-04");
  });
  it("the last day can be partial and the months always add up to the effort", () => {
    const r = scheduleEffort("2026-11-02", 13.5, 100, monFri);
    expect(r.end).toBe("2026-11-03");
    expect(Object.values(r.months).reduce((a, b) => a + b, 0)).toBe(13.5);
  });
  it("allocation above 100% finishes sooner", () => {
    expect(scheduleEffort("2026-11-02", 16, 200, monFri).end).toBe("2026-11-02");
  });
  it("rejects bad input", () => {
    expect(scheduleEffort("x", 8, 100, monFri).error).toMatch(/start date/);
    expect(scheduleEffort("2026-11-02", 0, 100, monFri).error).toMatch(/Effort/);
    expect(scheduleEffort("2026-11-02", 8, 0, monFri).error).toMatch(/Allocation/);
  });
  it("stops with a clear message when the calendar does not cover a date", () => {
    const limited: PersonDays = { day: iso => (iso <= "2026-11-03" ? 8 : null) };
    const r = scheduleEffort("2026-11-02", 40, 100, limited);
    expect(r.error).toMatch(/No calendar data for 2026-11-04/);
    expect(r.end).toBe("");
  });
  it("fails when the person never has working hours", () => {
    expect(scheduleEffort("2026-11-02", 8, 100, { day: () => 0 }).error).toMatch(/does not fit/);
  });
});

describe("calendar sources", () => {
  const team: NativeTeam = {
    teamName: "IT", workingDays: [1, 2, 3, 4, 5],
    iterations: [{ name: "Capacity 2026", start: "2026-01-01", finish: "2026-12-31", teamDaysOff: [{ start: "2026-11-03", end: "2026-11-03" }],
      members: [{ name: "Aman S <aman@x.com>", capacityPerDay: 8, daysOff: [{ start: "2026-11-04", end: "2026-11-04" }] }] }],
  };
  it("Azure DevOps capacity skips team days off and the person's days off", () => {
    const book = nativeCalendarBook([team]);
    const cal = book("Aman S <aman@x.com>");
    const r = scheduleEffort("2026-11-02", 24, 100, cal.days!);
    expect(r.end).toBe("2026-11-06");                 // 2 Nov, (3rd team day off), (4th own day off), 5, 6
  });
  it("unknown person and uncovered dates are reported", () => {
    const book = nativeCalendarBook([team]);
    expect(book("Nobody <n@x.com>").error).toMatch(/no capacity/);
    expect(book("").error).toMatch(/Choose a resource/);
    expect(book("Aman S <aman@x.com>").days!.day("2027-02-01")).toBeNull();
  });
  it("extension table: working week, holidays, own hours per day and leave", () => {
    const rec: CapacityRecord = { key: "aman@x.com", name: "Aman S <aman@x.com>", defaultHours: null, overrides: {}, hoursPerDay: 6, leave: [{ start: "2026-11-03", end: "2026-11-03" }] };
    const cal = { ...defaultCalendar(), holidays: [{ start: "2026-11-04", name: "Holiday" }] };
    const book = registerCalendarBook([rec], cal);
    const r = scheduleEffort("2026-11-02", 18, 100, book("Aman S <aman@x.com>").days!);
    expect(r.end).toBe("2026-11-06");                 // 2 Nov 6 h, 3 leave, 4 holiday, 5 Nov 6 h, 6 Nov 6 h
    expect(book("Other <o@x.com>").error).toMatch(/not in the Capacity register/);
  });
  it("Sunday–Thursday working week", () => {
    const book = registerCalendarBook([{ key: "a@x.com", name: "A <a@x.com>", defaultHours: null, overrides: {} }], { workingDays: [0, 1, 2, 3, 4], hoursPerDay: 8, holidays: [] });
    const r = scheduleEffort("2026-10-25", 80, 100, book("A <a@x.com>").days!);
    expect(r.months).toEqual({ "2026-10": 40, "2026-11": 40 });
    expect(r.end).toBe("2026-11-05");
  });
});

describe("applySchedule on a row", () => {
  const cols = { resource: "res", start: "start", effort: "effort", allocation: "alloc", end: "end" };
  const book = registerCalendarBook([{ key: "a@x.com", name: "A <a@x.com>", defaultHours: null, overrides: {} }], defaultCalendar());
  it("fills end date and months; incomplete rows have neither; keeps stored values without a calendar", () => {
    setCalendarBook(undefined);
    const stored: Record<string, unknown> = { res: "A <a@x.com>", start: "2026-11-02", effort: 16, alloc: 100, end: "2026-11-03", _months: { "2026-11": 16 } };
    applySchedule(stored, cols);
    expect(stored.end).toBe("2026-11-03");
    setCalendarBook(book);
    const row: Record<string, unknown> = { res: "A <a@x.com>", start: "2026-11-02", effort: 16, alloc: null, end: "" };
    applySchedule(row, cols);
    expect(row.end).toBe("2026-11-03");
    expect(row._months).toEqual({ "2026-11": 16 });
    const incomplete: Record<string, unknown> = { res: "A <a@x.com>", start: "", effort: 16, end: "x", _months: { a: 1 } };
    applySchedule(incomplete, cols);
    expect(incomplete.end).toBe("");
    expect(incomplete._months).toBeUndefined();
    const noRes: Record<string, unknown> = { res: "", start: "2026-11-02", effort: 8, alloc: 150 };
    applySchedule(noRes, cols);
    expect(noRes._schedErr).toMatch(/Choose a resource/);
    expect(noRes.end).toBe("");
    const over: Record<string, unknown> = { res: "A <a@x.com>", start: "2026-11-02", effort: 8, alloc: 150 };
    applySchedule(over, cols);
    expect(over._schedNote).toMatch(/double-booked/);
    setCalendarBook(undefined);
  });
  it("expandMonths gives one pseudo row per month", () => {
    const out = expandMonths([{ _id: "1", _months: { "2026-10": 40, "2026-11": 40 } }, { _id: "2" }]);
    expect(out.map(r => [r._month, r._hours])).toEqual([["2026-10-01", 40], ["2026-11-01", 40]]);
  });
});
