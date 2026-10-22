import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/hours/queries", () => ({
  clientCodeExists: vi.fn(),
  listEntries: vi.fn(),
  insertEntries: vi.fn(),
  entriesOnDate: vi.fn(),
  isActiveCategory: vi.fn(),
}));

import { GET, POST } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import {
  clientCodeExists,
  listEntries,
  insertEntries,
  entriesOnDate,
  isActiveCategory,
} from "@/lib/hours/queries";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const ADMIN = { user: { id: "admin-1", role: "admin" } };
const VIEWER = { user: { id: "viewer-1", role: "viewer" } };
const CLIENT = { user: { id: "client-1", role: "client" } };

function getReq(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/hours");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

function postReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/hours", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const DB_ROW = {
  id: "e1",
  userId: "viewer-1",
  clientIdCode: "PURA",
  entryDate: "2026-07-16",
  startTime: "09:00:00",
  endTime: "11:30:00",
  hours: "2.50",
  note: null,
  createdAt: new Date(),
  updatedAt: null,
};

describe("GET /api/hours", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 when unauthenticated", async () => {
    asMock(getAuthSession).mockResolvedValue(null);
    const res = await GET(getReq({ from: "2026-07-13", to: "2026-07-19" }));
    expect(res.status).toBe(401);
  });

  it("403 for client role", async () => {
    asMock(getAuthSession).mockResolvedValue(CLIENT);
    const res = await GET(getReq({ from: "2026-07-13", to: "2026-07-19" }));
    expect(res.status).toBe(403);
  });

  it("400 without from/to", async () => {
    asMock(getAuthSession).mockResolvedValue(VIEWER);
    const res = await GET(getReq({}));
    expect(res.status).toBe(400);
  });

  it("returns own entries with HH:MM times and numeric hours", async () => {
    asMock(getAuthSession).mockResolvedValue(VIEWER);
    asMock(listEntries).mockResolvedValue([DB_ROW]);
    const res = await GET(getReq({ from: "2026-07-13", to: "2026-07-19" }));
    const json = await res.json();
    expect(listEntries).toHaveBeenCalledWith("viewer-1", "2026-07-13", "2026-07-19");
    expect(json.entries[0]).toMatchObject({
      id: "e1",
      startTime: "09:00",
      endTime: "11:30",
      hours: 2.5,
    });
  });

  it("ignores userId param for a non-admin — returns only the caller's own entries", async () => {
    asMock(getAuthSession).mockResolvedValue(VIEWER);
    asMock(listEntries).mockResolvedValue([]);
    const res = await GET(
      getReq({ from: "2026-07-13", to: "2026-07-19", userId: "someone-else" })
    );
    expect(res.status).toBe(200);
    expect(listEntries).toHaveBeenCalledWith("viewer-1", "2026-07-13", "2026-07-19");
  });

  it("ignores userId param for an admin — no cross-member read (hours are owner-only)", async () => {
    asMock(getAuthSession).mockResolvedValue(ADMIN);
    asMock(listEntries).mockResolvedValue([]);
    const res = await GET(
      getReq({ from: "2026-07-13", to: "2026-07-19", userId: "viewer-1" })
    );
    expect(res.status).toBe(200);
    expect(listEntries).toHaveBeenCalledWith("admin-1", "2026-07-13", "2026-07-19");
  });
});

describe("POST /api/hours", () => {
  beforeEach(() => vi.clearAllMocks());

  const VALID_BODY = {
    entryDate: "2026-07-16",
    clientIdCode: "PURA",
    startTime: "09:00",
    endTime: "11:30",
    note: null,
    category: "PPC",
  };

  it("403 for client role", async () => {
    asMock(getAuthSession).mockResolvedValue(CLIENT);
    const res = await POST(postReq(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it("400 for unknown client code", async () => {
    asMock(getAuthSession).mockResolvedValue(VIEWER);
    asMock(clientCodeExists).mockResolvedValue(false);
    const res = await POST(postReq(VALID_BODY));
    expect(res.status).toBe(400);
  });

  it("400 for invalid range (end before start)", async () => {
    asMock(getAuthSession).mockResolvedValue(VIEWER);
    asMock(clientCodeExists).mockResolvedValue(true);
    const res = await POST(
      postReq({ ...VALID_BODY, startTime: "11:00", endTime: "09:00" })
    );
    expect(res.status).toBe(400);
  });

  it("400 for invalid entryDate", async () => {
    asMock(getAuthSession).mockResolvedValue(VIEWER);
    asMock(clientCodeExists).mockResolvedValue(true);
    const res = await POST(postReq({ ...VALID_BODY, entryDate: "16/07/2026" }));
    expect(res.status).toBe(400);
  });

  it("creates entry via durationHours and returns empty overlaps", async () => {
    asMock(getAuthSession).mockResolvedValue(VIEWER);
    asMock(clientCodeExists).mockResolvedValue(true);
    asMock(entriesOnDate).mockResolvedValue([]);
    asMock(isActiveCategory).mockResolvedValue(true);
    asMock(insertEntries).mockResolvedValue([DB_ROW]);
    const res = await POST(
      postReq({
        entryDate: "2026-07-16",
        clientIdCode: "PURA",
        startTime: "09:00",
        durationHours: 2.5,
        note: null,
        category: "PPC",
      })
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(insertEntries).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: "viewer-1",
        clientIdCode: "PURA",
        entryDate: "2026-07-16",
        startTime: "09:00",
        endTime: "11:30",
        hours: 2.5,
        note: null,
      }),
    ]);
    expect(json.overlaps).toEqual([]);
  });

  it("saves overlapping entry AND reports the conflict", async () => {
    asMock(getAuthSession).mockResolvedValue(VIEWER);
    asMock(clientCodeExists).mockResolvedValue(true);
    asMock(entriesOnDate).mockResolvedValue([
      { ...DB_ROW, id: "existing", startTime: "10:00:00", endTime: "12:00:00" },
    ]);
    asMock(isActiveCategory).mockResolvedValue(true);
    asMock(insertEntries).mockResolvedValue([DB_ROW]);
    const res = await POST(postReq(VALID_BODY));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(insertEntries).toHaveBeenCalled(); // saved despite overlap
    expect(json.overlaps).toEqual([
      { id: "existing", clientIdCode: "PURA", startTime: "10:00", endTime: "12:00" },
    ]);
  });

  it("accepts INTERNAL without hitting client lookup rejection", async () => {
    asMock(getAuthSession).mockResolvedValue(VIEWER);
    asMock(clientCodeExists).mockResolvedValue(true);
    asMock(entriesOnDate).mockResolvedValue([]);
    asMock(isActiveCategory).mockResolvedValue(true);
    asMock(insertEntries).mockResolvedValue([{ ...DB_ROW, clientIdCode: "INTERNAL" }]);
    const res = await POST(postReq({ ...VALID_BODY, clientIdCode: "INTERNAL" }));
    expect(res.status).toBe(201);
  });

  it("splits a cross-midnight entry into two rows", async () => {
    asMock(getAuthSession).mockResolvedValue(VIEWER);
    asMock(clientCodeExists).mockResolvedValue(true);
    asMock(entriesOnDate).mockResolvedValue([]);
    asMock(isActiveCategory).mockResolvedValue(true);
    asMock(insertEntries).mockResolvedValue([
      {
        ...DB_ROW, id: "s1", entryDate: "2026-07-20",
        startTime: "22:30:00", endTime: "00:00:00", hours: "1.50",
      },
      {
        ...DB_ROW, id: "s2", entryDate: "2026-07-21",
        startTime: "00:00:00", endTime: "02:00:00", hours: "2.00",
      },
    ]);

    const res = await POST(
      postReq({
        entryDate: "2026-07-20",
        clientIdCode: "PURA",
        startTime: "22:30",
        endTime: "02:00",
        note: null,
        category: "PPC",
      })
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(insertEntries).toHaveBeenCalledTimes(1);
    expect(insertEntries).toHaveBeenCalledWith([
      expect.objectContaining({
        entryDate: "2026-07-20", startTime: "22:30", endTime: "24:00", hours: 1.5,
      }),
      expect.objectContaining({
        entryDate: "2026-07-21", startTime: "00:00", endTime: "02:00", hours: 2,
      }),
    ]);
    expect(json.entries).toHaveLength(2);
  });
});

describe("POST /api/hours category", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(getAuthSession).mockResolvedValue(VIEWER);
    asMock(clientCodeExists).mockResolvedValue(true);
    asMock(entriesOnDate).mockResolvedValue([]);
    asMock(isActiveCategory).mockResolvedValue(true);
    asMock(insertEntries).mockResolvedValue([{ ...DB_ROW, category: "PPC" }]);
  });

  const validBody = {
    entryDate: "2026-07-16", clientIdCode: "PURA",
    startTime: "09:00", endTime: "11:30",
  };

  it("400 when category missing", async () => {
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/category/i);
  });

  it("400 when category is not an active category", async () => {
    asMock(isActiveCategory).mockResolvedValue(false);
    const res = await POST(postReq({ ...validBody, category: "Nope" }));
    expect(res.status).toBe(400);
  });

  it("201 and round-trips category on a valid entry", async () => {
    const res = await POST(postReq({ ...validBody, category: "PPC" }));
    expect(res.status).toBe(201);
    expect((await res.json()).entries[0].category).toBe("PPC");
    expect(asMock(insertEntries).mock.calls[0][0][0]).toMatchObject({ category: "PPC" });
  });
});
