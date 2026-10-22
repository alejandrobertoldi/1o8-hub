// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth-db", () => ({
  getAuthSession: vi.fn(),
}));

import { getAuthSession } from "@/lib/auth-db";
import { GET } from "./route";

const asMock = getAuthSession as unknown as ReturnType<typeof vi.fn>;

describe("GET /api/products/import/template", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock.mockResolvedValue({
      user: { email: "tester@example.com", role: "editor" },
    });
  });

  it("returns 401 when unauthenticated", async () => {
    asMock.mockResolvedValue(null);
    const res = await GET(
      new NextRequest("http://localhost/api/products/import/template?clientIdCode=AAC")
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when no client is selected", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/products/import/template")
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "Select a client before downloading the template",
    });
  });
});
