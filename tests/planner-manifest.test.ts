import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const read = (p: string) => JSON.parse(readFileSync(resolve(__dirname, "..", p), "utf8"));

describe("extension manifests", () => {
  for (const [name, path] of [["Grid & Rules", "vss-extension.json"], ["Resource Planner", "planner/vss-extension.json"]] as const) {
    it(`${name}: description fits the Marketplace limit and files exist`, () => {
      const m = read(path);
      expect(m.description.length).toBeLessThan(200);
      expect(m.name.length).toBeGreaterThan(3);
      const base = resolve(__dirname, "..", path.includes("/") ? path.split("/")[0] : ".");
      for (const f of [m.icons?.default, m.content?.details?.path, m.content?.license?.path].filter(Boolean)) expect(existsSync(resolve(base, f)), f).toBe(true);
    });
  }
  it("Resource Planner is read-only and its page matches the build output", () => {
    const m = read("planner/vss-extension.json");
    expect(m.id).toBe("resource-planner");
    expect(m.name).toBe("Resource Planner & Heatmap");
    expect(m.scopes.sort()).toEqual(["vso.project", "vso.work"]);                  // no write scope
    const hub = m.contributions.find((c: { id: string }) => c.id === "planner-hub");
    expect(hub.targets).toEqual(["ms.vss-work-web.work-hub-group"]);
    expect(hub.properties.uri).toBe("dist/hub/index.html");
    expect(m.files.find((f: { path: string }) => f.path === "dist").packagePath).toBe("dist");
    expect(m.contributions.some((c: { id: string }) => c.id === "exec-hub")).toBe(false);            // the Executive Dashboard is a tab inside the planner, shown only when enabled in Settings
  });
  it("the two extensions have different ids", () => {
    expect(read("planner/vss-extension.json").id).not.toBe(read("vss-extension.json").id);
  });
});
