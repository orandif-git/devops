import { describe, expect, it } from "vitest";
import { createRequire } from "module";
const { nextVersion } = createRequire(import.meta.url)("../scripts/versions.js") as { nextVersion(m: string, last?: string): string };

describe("package version numbers", () => {
  it("goes one patch above the manifest on a fresh machine", () => { expect(nextVersion("2.2.2")).toBe("2.2.3"); });
  it("goes one patch above the last version built here when that is higher", () => { expect(nextVersion("2.2.2", "2.2.7")).toBe("2.2.8"); });
  it("ignores an older or invalid remembered version and follows a raised manifest version", () => {
    expect(nextVersion("2.3.0", "2.2.9")).toBe("2.3.1");
    expect(nextVersion("2.2.2", "junk")).toBe("2.2.3");
    expect(nextVersion("2.2.10", "2.2.9")).toBe("2.2.11");        // compared as numbers, not text
  });
  it("refuses a manifest version that is not major.minor.patch", () => { expect(() => nextVersion("2.2")).toThrow(); });
});
