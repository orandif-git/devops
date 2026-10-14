import { describe, expect, it, vi } from "vitest";
vi.mock("azure-devops-extension-sdk", () => ({ getUser: () => ({ id: "me" }) }));
vi.mock("../src/shared/presetAccess", () => ({ projectAdminStatus: () => Promise.resolve("no") }));
vi.mock("../src/shared/ado", () => ({ getTeamMembersCompat: () => Promise.resolve([]), withTimeout: (p: Promise<unknown>) => p }));
import { evaluateAccess } from "../planner/src/data/access";

const teams = [{ id: "t1", name: "A" }, { id: "t2", name: "B" }];
describe("planner access", () => {
  it("lets everyone in when no access teams are chosen", async () => {
    expect(await evaluateAccess([], "no", async () => false)).toEqual({ admin: "no", mayOpen: true });
  });
  it("lets administrators in whatever the teams", async () => {
    expect(await evaluateAccess(teams, "yes", async () => false)).toEqual({ admin: "yes", mayOpen: true });
  });
  it("lets members of any access team in and keeps others out", async () => {
    expect((await evaluateAccess(teams, "no", async id => id === "t2")).mayOpen).toBe(true);
    expect((await evaluateAccess(teams, "no", async () => false)).mayOpen).toBe(false);
  });
  it("does not lock anyone out when the administrator check could not run", async () => {
    expect(await evaluateAccess(teams, "unknown", async () => false)).toEqual({ admin: "unknown", mayOpen: true });
  });
});
