import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchClientLogo = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));
vi.mock("@/lib/client-logos/drive-logos", async (orig) => ({
  ...(await orig<typeof import("@/lib/client-logos/drive-logos")>()),
  fetchClientLogo,
}));

import { GET } from "./route";

const call = (file: string) =>
  GET(new Request(`https://hub.test/client-logos/${file}`), { params: Promise.resolve({ file }) });

beforeEach(() => vi.resetAllMocks());

describe("GET /client-logos/[file]", () => {
  it("serves the Drive logo with long edge-cache headers", async () => {
    fetchClientLogo.mockResolvedValue({ bytes: Buffer.from("PNGDATA"), mimeType: "image/png" });
    const res = await call("REA_SC_US.png");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("s-maxage=3600");
    expect(res.headers.get("cache-control")).toContain("stale-while-revalidate=2592000");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("PNGDATA");
    expect(fetchClientLogo).toHaveBeenCalledWith("REA_SC_US");
  });

  it("404s when Drive has no logo — there is no bundled fallback", async () => {
    fetchClientLogo.mockResolvedValue(null);
    const res = await call("REA_SC_US.png");
    expect(res.status).toBe(404);
    expect(res.headers.get("location")).toBeNull();
  });

  it("503s with a short cache when Drive errors, so an outage isn't cached for long", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchClientLogo.mockRejectedValue(new Error("drive down"));
    const res = await call("REA_SC_US.png");
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toContain("s-maxage=30");
  });

  it("404s on a malformed name without touching Drive", async () => {
    const res = await call("..%2Fsecret.png");
    expect(res.status).toBe(404);
    expect(fetchClientLogo).not.toHaveBeenCalled();
  });
});
