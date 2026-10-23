import { describe, expect, it, vi } from "vitest";

const recycle = vi.fn();
vi.mock("./index", () => ({ recycleDbPool: (r: string) => recycle(r) }));

import { guarded } from "./guarded-route";

describe("guarded", () => {
  it("passes a fast response through", async () => {
    const h = guarded("t", 50, async () => new Response("ok"));
    expect(await (await h()).text()).toBe("ok");
    expect(recycle).not.toHaveBeenCalled();
  });
  it("answers 503 and recycles the pool when the handler hangs", async () => {
    const h = guarded("GET /x", 20, () => new Promise<Response>(() => {}));
    const res = await h();
    expect(res.status).toBe(503);
    expect(recycle).toHaveBeenCalledWith("GET /x timed out");
  });
  it("rethrows other errors", async () => {
    const h = guarded("t", 50, async () => {
      throw new Error("boom");
    });
    await expect(h()).rejects.toThrow("boom");
  });
});
