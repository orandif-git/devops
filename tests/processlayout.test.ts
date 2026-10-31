import { describe, expect, it, vi } from "vitest";
vi.mock("azure-devops-extension-sdk", () => ({ getHost: () => ({ isHosted: true, name: "org" }), getAccessToken: async () => "tok", getService: async () => ({}), getExtensionContext: () => ({ publisherId: "pub", extensionId: "ext" }) }));
vi.mock("azure-devops-extension-api", () => ({ CommonServiceIds: { LocationService: "loc" } }));
import { addGroup, contributionId, detailsSlot, findGroup, findProcess, findType, getLayout, Layout, ProcessLayoutError, realRest, removeGroup, Rest } from "../src/shared/processLayout";

const layout = (groups: { id: string; label: string; controls?: { contribution?: { contributionId?: string } }[] }[] = []): Layout => ({ pages: [{ id: "home", label: "Home", pageType: "history" }, { id: "pg1", label: "Details", pageType: "custom", sections: [{ id: "Section1", groups }, { id: "Section2", groups: [] }] }] });
const fake = (over: Partial<Record<string, unknown>> = {}) => {
  const calls: { m: string; path: string; body?: unknown }[] = [];
  let lay = layout([{ id: "gDesc", label: "Description" }]);
  const rest: Rest = {
    async get(path) { calls.push({ m: "GET", path });
      if (path === "work/processes") return { value: [{ typeId: "proc-1", name: "Agile - Custom", customizationType: "inherited", projects: [{ id: "P", name: "Mine" }, { id: "Q", name: "Other" }] }, { typeId: "proc-2", name: "Scrum", customizationType: "system", projects: [{ id: "Z", name: "Zed" }] }] };
      if (path.endsWith("/workItemTypes")) return { value: [{ referenceName: "Microsoft.VSTS.WorkItemTypes.Epic", name: "Epic" }, { referenceName: "Microsoft.VSTS.WorkItemTypes.Feature", name: "Feature" }] };
      return lay; },
    async send(m, path, body) { calls.push({ m, path, body }); if (over.fail === path.split("/").pop()) throw new ProcessLayoutError("nope", "permission");
      if (m === "POST" && path.endsWith("/groups")) { lay = layout([{ id: "gNew", label: (body as { label: string }).label }, ...lay.pages![1].sections![0].groups!]); return { id: "gNew" }; }
      if (m === "POST" && path.endsWith("/controls")) { lay.pages![1].sections![0].groups![0].controls = [{ contribution: { contributionId: "pub.ext.delivery-progress" } }]; return {}; }
      if (m === "DELETE") { lay = layout(lay.pages![1].sections![0].groups!.filter(g => !path.endsWith("/" + g.id))); return undefined; } return undefined; } };
  return { rest, calls, layout: () => lay };
};
const base = { processId: "proc-1", typeRef: "Microsoft.VSTS.WorkItemTypes.Epic", label: "Delivery progress", contributionId: "pub.ext.delivery-progress", height: 46 };

describe("process layout", () => {
  it("finds the process of the project with the other projects on it, and the work item type by name", async () => {
    const f = fake(); const p = await findProcess(f.rest, "P"); expect(p).toEqual({ id: "proc-1", name: "Agile - Custom", kind: "inherited", projects: [{ id: "P", name: "Mine" }, { id: "Q", name: "Other" }] });
    expect(await findType(f.rest, "proc-1", "epic")).toBe("Microsoft.VSTS.WorkItemTypes.Epic");
    await expect(findProcess(f.rest, "nobody")).rejects.toMatchObject({ kind: "notfound" }); await expect(findType(f.rest, "proc-1", "Bug")).rejects.toThrow(/not in this process/);
  });
  it("uses the Details page and its first column, and finds the group by its control or its name", () => {
    expect(detailsSlot(layout())).toEqual({ pageId: "pg1", sectionId: "Section1" }); expect(() => detailsSlot({ pages: [] })).toThrow(ProcessLayoutError);
    const l = layout([{ id: "a", label: "Description" }, { id: "b", label: "Other name", controls: [{ contribution: { contributionId: "pub.ext.delivery-progress" } }] }, { id: "c", label: "Delivery progress" }]);
    expect(findGroup(l, "pub.ext.delivery-progress", "Delivery progress")).toMatchObject({ groupId: "b", position: 1 }); expect(findGroup(layout([{ id: "c", label: "Delivery progress" }]), "x", "Delivery progress")?.groupId).toBe("c"); expect(findGroup(layout(), "x", "y")).toBeUndefined();
  });
  it("adds the group first in the first column, then the control", async () => {
    const f = fake(); const r = await addGroup(f.rest, base);
    expect(r).toEqual({ groupId: "gNew" }); const posts = f.calls.filter(c => c.m === "POST");
    expect(posts[0].path).toBe("work/processes/proc-1/workItemTypes/Microsoft.VSTS.WorkItemTypes.Epic/layout/pages/pg1/sections/Section1/groups"); expect(posts[0].body).toEqual({ label: "Delivery progress", order: 0, visible: true });
    expect(posts[1].path).toBe("work/processes/proc-1/workItemTypes/Microsoft.VSTS.WorkItemTypes.Epic/layout/groups/gNew/controls"); expect(posts[1].body).toEqual({ label: "Delivery progress", isContribution: true, visible: true, contribution: { contributionId: "pub.ext.delivery-progress", inputs: {}, height: 46 } });
  });
  it("does nothing when the group is already there", async () => { const f = fake(); await addGroup(f.rest, base); const before = f.calls.length; const r = await addGroup(f.rest, base); expect(r.groupId).toBe("gNew"); expect(f.calls.slice(before).every(c => c.m === "GET")).toBe(true); });
  it("takes the new group out again when the control cannot be added", async () => {
    const f = fake({ fail: "controls" }); await expect(addGroup(f.rest, base)).rejects.toMatchObject({ kind: "permission" });
    expect(f.calls.some(c => c.m === "DELETE" && c.path.endsWith("/groups/gNew"))).toBe(true); expect(f.layout().pages![1].sections![0].groups!.map(g => g.id)).toEqual(["gDesc"]);
  });
  it("removes the group, or does nothing when it is not there", async () => {
    const f = fake(); expect(await removeGroup(f.rest, base)).toBe(false); await addGroup(f.rest, base); expect(await removeGroup(f.rest, base)).toBe(true);
    expect(f.calls.filter(c => c.m === "DELETE").pop()!.path).toBe("work/processes/proc-1/workItemTypes/Microsoft.VSTS.WorkItemTypes.Epic/layout/pages/pg1/sections/Section1/groups/gNew"); expect(f.layout().pages![1].sections![0].groups!.map(g => g.id)).toEqual(["gDesc"]);
    expect(await getLayout(f.rest, "proc-1", "Microsoft.VSTS.WorkItemTypes.Epic")).toBeTruthy();
  });
  it("builds the contribution id from the publisher and the extension", () => { expect(contributionId()).toBe("pub.ext.delivery-progress"); });
  it("turns an HTTP failure into a plain message: permission, not found, other", async () => {
    const res = (status: number, body: unknown) => vi.fn(async () => ({ ok: false, status, json: async () => body }));
    for (const [status, kind] of [[403, "permission"], [401, "permission"], [404, "notfound"], [500, "other"]] as const) {
      vi.stubGlobal("fetch", res(status, { message: "boom" })); await expect(realRest.send("POST", "work/processes/x/layout", {})).rejects.toMatchObject({ kind }); await expect(realRest.get("work/processes")).rejects.toMatchObject({ kind });
    }
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 204, json: async () => { throw new Error("no body"); } }))); await expect(realRest.send("DELETE", "work/processes/x/layout/groups/g")).resolves.toBeUndefined();
    const ok = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ value: [] }) })); vi.stubGlobal("fetch", ok); await realRest.get("work/processes", { $expand: "projects" });
    expect((ok.mock.calls[0] as unknown as string[])[0]).toBe("https://dev.azure.com/org/_apis/work/processes?%24expand=projects&api-version=5.0-preview.2"); vi.unstubAllGlobals();
  });
});
