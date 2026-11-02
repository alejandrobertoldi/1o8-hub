// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

// The portal routes add no logic: they hand the request to the hub handlers,
// which keep every scope check (recReadScope, portal row allowlist, sentBy blanking).
const h = vi.hoisted(() => ({
  listGet: vi.fn<(...args: unknown[]) => Promise<Response>>(async () => Response.json({ snapshots: [] })),
  oneGet: vi.fn<(...args: unknown[]) => Promise<Response>>(async () => Response.json({ snapshot: null, rows: [] })),
}));
vi.mock("@/app/api/inventory-rec-snapshots/route", () => ({ GET: h.listGet }));
vi.mock("@/app/api/inventory-rec-snapshots/[id]/route", () => ({ GET: h.oneGet }));

import * as list from "./route";
import * as one from "./[id]/route";

describe("portal inventory-rec-snapshots routes", () => {
  it("are GET-only", () => {
    expect(Object.keys(list).sort()).toEqual(["GET"]);
    expect(Object.keys(one).sort()).toEqual(["GET"]);
  });

  it("list delegates the request to the hub handler", async () => {
    const req = new NextRequest("http://x/api/portal/inventory-rec-snapshots?client=POO_SC_US");
    const res = await list.GET(req);
    expect(h.listGet).toHaveBeenCalledWith(req);
    expect(res.status).toBe(200);
  });

  it("detail delegates the request and params to the hub handler", async () => {
    const req = new NextRequest("http://x/api/portal/inventory-rec-snapshots/abc");
    const ctx = { params: Promise.resolve({ id: "abc" }) };
    const res = await one.GET(req, ctx);
    expect(h.oneGet).toHaveBeenCalledWith(req, ctx);
    expect(res.status).toBe(200);
  });
});
