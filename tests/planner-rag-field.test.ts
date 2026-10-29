import { describe, expect, it, vi } from "vitest";
const items = [
  { id: 1, fields: { "System.CreatedDate": "2026-03-04T08:00:00Z", "System.Title": "Core upgrade", "System.State": "Active", "System.AreaPath": "P\\A", "System.WorkItemType": "Epic", "Custom.Start": "2026-02-01T00:00:00Z", "Custom.GoLive": "2027-06-30T00:00:00Z", "Custom.RAGStatus": "Red" } },
  { id: 2, fields: { "System.Title": "Mobile app", "System.State": "Active", "System.AreaPath": "P\\A", "System.WorkItemType": "Epic", "Custom.Start": "2026-02-01T00:00:00Z", "Custom.GoLive": "2026-09-30T00:00:00Z", "Custom.RAGStatus": "Green" } },   // past go-live but Green
  { id: 3, fields: { "System.Title": "Payments", "System.State": "Active", "System.AreaPath": "P\\A", "System.WorkItemType": "Epic", "Custom.Start": "2026-02-01T00:00:00Z", "Custom.GoLive": "2027-06-30T00:00:00Z", "Custom.RAGStatus": "Amber" } },
  { id: 4, fields: { "System.Title": "No RAG", "System.State": "Active", "System.AreaPath": "P\\A", "System.WorkItemType": "Epic", "Custom.Start": "2026-02-01T00:00:00Z", "Custom.GoLive": "2027-06-30T00:00:00Z" } },
];
vi.mock("../planner/src/rest", () => ({
  restPost: (path: string, body: { fields?: string[] }) => Promise.resolve(path === "wit/wiql" ? { workItems: items.map(i => ({ id: i.id })) } : { value: items.map(i => ({ id: i.id, fields: Object.fromEntries(Object.entries(i.fields).filter(([k]) => !body.fields || body.fields.includes(k) || k === "System.Id")) })) }),
  restGet: () => Promise.resolve({ value: [] }),
}));
vi.mock("../planner/src/data/idb", () => ({ cacheGet: () => Promise.resolve(undefined), cacheSet: () => Promise.resolve() }));
vi.mock("../planner/src/data/queries", () => ({ runSavedQuery: () => Promise.resolve([]) }));
import { loadEpics } from "../planner/src/data/epics";
import { buildExec } from "../planner/src/core/executive";
import { normalizeSettings } from "../planner/src/core/settings";

describe("a RAG Status picklist field, end to end", () => {
  it("is requested, read as text and used as the status, with the data as a check", async () => {
    const s = normalizeSettings({ epicStartField: "Custom.Start", epicTargetField: "Custom.GoLive", executive: { enabled: true, declaredField: "Custom.RAGStatus", statusSource: "rag-check" } });
    const r = await loadEpics({ id: "P", name: "Proj" }, s, { force: true });
    expect(r.epics.map(e => e.extra["Custom.RAGStatus"])).toEqual(["Red", "Green", "Amber", ""]);
    expect(r.epics[0].created).toBe("2026-03-04T08:00:00Z"); expect(r.epics[1].created).toBeUndefined();       // the created date is read for the period filter
    const x = buildExec({ epics: r.epics, gridDone: {}, bookings: [], avail: { records: [], hours: () => null, team: () => "" }, settings: s, today: new Date("2026-10-28T00:00:00Z") });
    const st = (id: number) => x.rows.find(q => q.epic.id === id)!;
    expect(st(1).status).toBe("red"); expect(st(2).status).toBe("green"); expect(st(3).status).toBe("amber");
    expect(st(2).check).toMatch(/^RAG is Green, but past its go-live date/);                 // Green, but the date has passed
    expect(st(4).status).not.toBe("green"); expect(st(4).reasons[0]).toContain("comes from the data");
  });
});
