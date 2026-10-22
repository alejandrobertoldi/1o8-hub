import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: vi.fn(), insert: vi.fn() } }));

import { GET, POST } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import { VALID_COUNTRY_CODES } from "@/lib/constants";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

function getReq(url: string) {
  const req = new Request(url);
  return Object.assign(req, {
    nextUrl: new URL(url),
  }) as unknown as import("next/server").NextRequest;
}

function postReq(body: unknown) {
  return new Request("http://localhost/api/holidays", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  asMock(getAuthSession).mockResolvedValue({
    user: { id: "a1", role: "admin", email: "admin@marketfoundry.agency" },
  });
});

describe("holiday 400 messages name every valid code", () => {
  it("GET names all six codes, not the stale three", async () => {
    const res = await GET(getReq("http://localhost/api/holidays?country=ZZ"));
    expect(res.status).toBe(400);
    const { error } = await res.json();
    for (const code of VALID_COUNTRY_CODES) expect(error).toContain(code);
  });

  it("POST names all six codes, not the stale three", async () => {
    const res = await POST(postReq({ countryCode: "ZZ", holidayDate: "2026-01-01", name: "x" }));
    expect(res.status).toBe(400);
    const { error } = await res.json();
    for (const code of VALID_COUNTRY_CODES) expect(error).toContain(code);
  });
});
