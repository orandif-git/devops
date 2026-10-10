// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { withTimeout } from "../src/shared/timeout";

afterEach(() => vi.useRealTimers());

describe("withTimeout", () => {
  it("passes results through", async () => { await expect(withTimeout(Promise.resolve(42), "Loading")).resolves.toBe(42); });
  it("turns a call that never answers into a clear error", async () => {
    vi.useFakeTimers();
    const p = withTimeout(new Promise(() => undefined), "Loading work item types", 5000);
    const assertion = expect(p).rejects.toThrow(/Loading work item types: Azure DevOps did not answer within 5 seconds/);
    await vi.advanceTimersByTimeAsync(5001);
    await assertion;
  });
  it("labels real errors with what was being done and the HTTP status", async () => {
    await expect(withTimeout(Promise.reject(Object.assign(new Error("TF401019: The Git repository does not exist"), { status: 404 })), "Reading work item 1")).rejects.toThrow(/Reading work item 1: TF401019.*\(HTTP 404\)/);
    await expect(withTimeout(Promise.reject(new Error("boom")), "Loading")).rejects.toThrow("Loading: boom");
  });
});
