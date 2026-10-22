import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// vi.mock is hoisted above plain consts → create mocks with vi.hoisted.
const { getAuthSession, returningResult, invalidateSeoProjectsCache } = vi.hoisted(() => ({
  getAuthSession: vi.fn(),
  returningResult: [] as unknown[],
  invalidateSeoProjectsCache: vi.fn(),
}));

vi.mock("@/lib/auth-db", () => ({ getAuthSession }));
vi.mock("@/lib/seo-projects-cache", () => ({ invalidateSeoProjectsCache }));
vi.mock("@/lib/db", () => ({
  db: {
    update: () => ({ set: () => ({ where: () => ({ returning: async () => returningResult }) }) }),
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    delete: () => ({ where: async () => undefined }),
  },
}));

import { PATCH } from "./route";

const mockParams = { params: Promise.resolve({ id: "proj-1" }) };

function patchRequest(body: unknown) {
  return new NextRequest("http://localhost/api/seo/projects/proj-1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  returningResult.length = 0;
  getAuthSession.mockResolvedValue({ user: { email: "test@marketfoundry.agency", role: "editor" } });
});

describe("PATCH /api/seo/projects/[id] — status", () => {
  it("403 for a viewer", async () => {
    getAuthSession.mockResolvedValue({ user: { role: "viewer" } });
    const res = await PATCH(patchRequest({ status: "draft" }), mockParams);
    expect(res.status).toBe(403);
  });

  it("PATCH status live → 400 (derived now)", async () => {
    const res = await PATCH(patchRequest({ status: "live" }), mockParams);
    expect(res.status).toBe(400);
  });

  it("PATCH status deprecated → 400", async () => {
    const res = await PATCH(patchRequest({ status: "deprecated" }), mockParams);
    expect(res.status).toBe(400);
  });
});
