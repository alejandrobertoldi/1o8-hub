import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as XLSX from "xlsx";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/hours/queries", () => ({
  clientCodeExists: vi.fn(),
  listEntries: vi.fn(),
  insertEntries: vi.fn(),
  entriesOnDate: vi.fn(),
  isActiveCategory: vi.fn(),
}));

import { GET } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import { listEntries } from "@/lib/hours/queries";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const VIEWER = { user: { id: "viewer-1", role: "viewer" } };
const CLIENT = { user: { id: "client-1", role: "client" } };

function getReq(params: Record<string, string>): NextRequest {
  const url = new URL("http://localhost/api/hours/export");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url);
}

const RANGE = { from: "2026-07-13", to: "2026-07-19" };

const DB_ROW = {
  id: "e1",
  userId: "viewer-1",
  clientIdCode: "INTERNAL",
  entryDate: "2026-07-16",
  startTime: "09:00:00",
  endTime: "11:30:00",
  hours: "2.50",
  note: "Standup",
  category: "Meetings",
  createdAt: new Date(),
  updatedAt: null,
};

describe("GET /api/hours/export", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 when unauthenticated", async () => {
    asMock(getAuthSession).mockResolvedValue(null);
    const res = await GET(getReq(RANGE));
    expect(res.status).toBe(401);
  });

  it("403 for client role", async () => {
    asMock(getAuthSession).mockResolvedValue(CLIENT);
    const res = await GET(getReq(RANGE));
    expect(res.status).toBe(403);
  });

  it("400 without from/to", async () => {
    asMock(getAuthSession).mockResolvedValue(VIEWER);
    const res = await GET(getReq({}));
    expect(res.status).toBe(400);
  });

  it("400 when from is after to", async () => {
    asMock(getAuthSession).mockResolvedValue(VIEWER);
    const res = await GET(getReq({ from: "2026-07-19", to: "2026-07-13" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "from must be on or before to",
    });
  });

  it("exports only the caller's entries as xlsx and ignores userId", async () => {
    asMock(getAuthSession).mockResolvedValue(VIEWER);
    asMock(listEntries).mockResolvedValue([DB_ROW]);

    const res = await GET(
      getReq({ ...RANGE, userId: "someone-else" })
    );

    expect(res.status).toBe(200);
    expect(listEntries).toHaveBeenCalledWith("viewer-1", RANGE.from, RANGE.to);
    expect(res.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(res.headers.get("Content-Disposition")).toBe(
      `attachment; filename="hours_${RANGE.from}_${RANGE.to}.xlsx"`
    );

    const buf = Buffer.from(await res.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const aoa = XLSX.utils.sheet_to_json<(string | number)[]>(wb.Sheets.Hours, {
      header: 1,
    });
    expect(aoa[1]).toEqual([
      "2026-07-16",
      "09:00",
      "11:30",
      2.5,
      "02:30",
      "1o8",
      "Meetings",
      "Standup",
    ]);
  });
});
