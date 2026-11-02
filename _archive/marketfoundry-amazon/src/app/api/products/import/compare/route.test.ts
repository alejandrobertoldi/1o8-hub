// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth-db", () => ({
  getAuthSession: vi.fn(),
}));

const mockSelect = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

import { getAuthSession } from "@/lib/auth-db";
import { POST } from "./route";

const asMock = getAuthSession as unknown as ReturnType<typeof vi.fn>;

function jsonRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/products/import/compare", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/products/import/compare", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock.mockResolvedValue({
      user: { email: "tester@example.com", role: "editor" },
    });
    mockSelect.mockReturnValue({
      from: () => ({
        where: () => Promise.resolve([{ sku: "EXISTING-1" }]),
      }),
    });
  });

  it("returns 401 when unauthenticated", async () => {
    asMock.mockResolvedValue(null);
    const res = await POST(jsonRequest({ clientIdCode: "AAC", skus: ["A"] }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when no client is selected", async () => {
    const res = await POST(jsonRequest({ skus: ["A"] }));
    expect(res.status).toBe(400);
  });

  it("splits CLR SKUs into existing vs missing for the client", async () => {
    const res = await POST(
      jsonRequest({
        clientIdCode: "AAC",
        skus: ["EXISTING-1", "NEW-1", "new-1"],
      })
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      total: 2,
      existing: ["EXISTING-1"],
      missing: ["NEW-1"],
    });
  });
});
