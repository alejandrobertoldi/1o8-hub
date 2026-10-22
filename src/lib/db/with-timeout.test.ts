// @vitest-environment node
import { describe, it, expect } from "vitest";
import { withDbTimeout, DbTimeoutError } from "./with-timeout";

describe("withDbTimeout", () => {
  it("resolves with the original value when the promise settles before the timeout", async () => {
    const fast = new Promise<string>((resolve) => setTimeout(() => resolve("ok"), 5));
    await expect(withDbTimeout(fast, 50)).resolves.toBe("ok");
  });

  it("rejects with DbTimeoutError when the promise hasn't settled by the timeout", async () => {
    const stuck = new Promise<string>(() => {}); // never settles, like a wedged DB query
    await expect(withDbTimeout(stuck, 10)).rejects.toBeInstanceOf(DbTimeoutError);
  });

  it("propagates the original rejection when the promise fails before the timeout", async () => {
    const failing = new Promise<string>((_, reject) => setTimeout(() => reject(new Error("boom")), 5));
    await expect(withDbTimeout(failing, 50)).rejects.toThrow("boom");
  });
});
