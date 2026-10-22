import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/hours/queries", () => ({
  clientCodeExists: vi.fn(),
  entriesOnDate: vi.fn(),
  getEntryById: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
  listEntries: vi.fn(),
  isActiveCategory: vi.fn(),
}));

import { PATCH, DELETE } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import {
  clientCodeExists,
  entriesOnDate,
  getEntryById,
  updateEntry,
  deleteEntry,
  isActiveCategory,
} from "@/lib/hours/queries";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const OWNER = { user: { id: "owner-1", role: "viewer" } };
const OTHER = { user: { id: "other-1", role: "editor" } };
const ADMIN = { user: { id: "admin-1", role: "admin" } };
const SUPER = { user: { id: "super-1", role: "admin", isSuperAdmin: true } };

const DB_ROW = {
  id: "e1",
  userId: "owner-1",
  clientIdCode: "PURA",
  entryDate: "2026-07-16",
  startTime: "09:00:00",
  endTime: "11:30:00",
  hours: "2.50",
  note: null,
  createdAt: new Date(),
  updatedAt: null,
};

const BODY = {
  entryDate: "2026-07-16",
  clientIdCode: "PURA",
  startTime: "10:00",
  endTime: "12:00",
  note: "updated",
};

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/hours/e1", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: "e1" }) };

describe("PATCH /api/hours/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(clientCodeExists).mockResolvedValue(true);
    asMock(entriesOnDate).mockResolvedValue([]);
  });

  it("404 when entry does not exist", async () => {
    asMock(getAuthSession).mockResolvedValue(OWNER);
    asMock(getEntryById).mockResolvedValue(null);
    const res = await PATCH(req("PATCH", BODY), params);
    expect(res.status).toBe(404);
  });

  it("403 when a non-owner edits someone else's entry", async () => {
    asMock(getAuthSession).mockResolvedValue(OTHER);
    asMock(getEntryById).mockResolvedValue(DB_ROW);
    const res = await PATCH(req("PATCH", BODY), params);
    expect(res.status).toBe(403);
    expect(updateEntry).not.toHaveBeenCalled();
  });

  it("owner can update; overlap check excludes the entry itself", async () => {
    asMock(getAuthSession).mockResolvedValue(OWNER);
    asMock(getEntryById).mockResolvedValue(DB_ROW);
    asMock(updateEntry).mockResolvedValue({
      ...DB_ROW,
      startTime: "10:00:00",
      endTime: "12:00:00",
      hours: "2.00",
      note: "updated",
    });
    const res = await PATCH(req("PATCH", BODY), params);
    expect(res.status).toBe(200);
    expect(entriesOnDate).toHaveBeenCalledWith("owner-1", "2026-07-16", "e1");
    const json = await res.json();
    expect(json.entry.hours).toBe(2);
  });

  it("403 when an admin edits someone else's entry (hours are owner-only)", async () => {
    asMock(getAuthSession).mockResolvedValue(ADMIN);
    asMock(getEntryById).mockResolvedValue(DB_ROW);
    const res = await PATCH(req("PATCH", BODY), params);
    expect(res.status).toBe(403);
    expect(updateEntry).not.toHaveBeenCalled();
  });

  it("super admin can update another user's entry", async () => {
    asMock(getAuthSession).mockResolvedValue(SUPER);
    asMock(getEntryById).mockResolvedValue(DB_ROW);
    asMock(updateEntry).mockResolvedValue({
      ...DB_ROW,
      startTime: "10:00:00",
      endTime: "12:00:00",
      hours: "2.00",
      note: "updated",
    });
    const res = await PATCH(req("PATCH", BODY), params);
    expect(res.status).toBe(200);
    expect(updateEntry).toHaveBeenCalled();
    expect(entriesOnDate).toHaveBeenCalledWith("owner-1", "2026-07-16", "e1");
  });

  it("400 when an edit would cross midnight", async () => {
    asMock(getAuthSession).mockResolvedValue(OWNER);
    asMock(getEntryById).mockResolvedValue(DB_ROW);
    const res = await PATCH(
      req("PATCH", { ...BODY, startTime: "22:30", endTime: "02:00" }),
      params
    );
    expect(res.status).toBe(400);
    expect(updateEntry).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/hours/[id] category", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(getAuthSession).mockResolvedValue(OWNER);
    asMock(getEntryById).mockResolvedValue(DB_ROW);
    asMock(clientCodeExists).mockResolvedValue(true);
    asMock(entriesOnDate).mockResolvedValue([]);
    asMock(isActiveCategory).mockResolvedValue(true);
    asMock(updateEntry).mockImplementation(async (_id, v) => ({
      ...DB_ROW,
      ...(v as Record<string, unknown>),
      hours: "2.50",
    }));
  });

  const base = { entryDate: "2026-07-16", clientIdCode: "PURA", startTime: "09:00", endTime: "11:30" };

  it("succeeds without a category (legacy row stays uncategorised)", async () => {
    const res = await PATCH(req("PATCH", base), params);
    expect(res.status).toBe(200);
    expect(asMock(updateEntry).mock.calls[0][1]).toMatchObject({ category: null });
  });

  it("sets a category on edit", async () => {
    const res = await PATCH(req("PATCH", { ...base, category: "SEO" }), params);
    expect(res.status).toBe(200);
    expect(asMock(updateEntry).mock.calls[0][1]).toMatchObject({ category: "SEO" });
  });

  it("400 on an inactive category", async () => {
    asMock(isActiveCategory).mockResolvedValue(false);
    const res = await PATCH(req("PATCH", { ...base, category: "Dead" }), params);
    expect(res.status).toBe(400);
  });

  it("grandfathers the entry's own now-inactive category on edit", async () => {
    asMock(getEntryById).mockResolvedValue({ ...DB_ROW, category: "Gmail" });
    asMock(isActiveCategory).mockResolvedValue(false);
    const res = await PATCH(req("PATCH", { ...base, category: "Gmail" }), params);
    expect(res.status).toBe(200);
    expect(asMock(updateEntry).mock.calls[0][1]).toMatchObject({ category: "Gmail" });
  });

  it("still blocks switching to a different inactive category", async () => {
    asMock(getEntryById).mockResolvedValue({ ...DB_ROW, category: "Gmail" });
    asMock(isActiveCategory).mockResolvedValue(false);
    const res = await PATCH(req("PATCH", { ...base, category: "Slack" }), params);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Unknown or inactive category: Slack");
    expect(updateEntry).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/hours/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("403 when a non-owner deletes someone else's entry", async () => {
    asMock(getAuthSession).mockResolvedValue(OTHER);
    asMock(getEntryById).mockResolvedValue(DB_ROW);
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(403);
    expect(deleteEntry).not.toHaveBeenCalled();
  });

  it("403 when an admin deletes someone else's entry (hours are owner-only)", async () => {
    asMock(getAuthSession).mockResolvedValue(ADMIN);
    asMock(getEntryById).mockResolvedValue(DB_ROW);
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(403);
    expect(deleteEntry).not.toHaveBeenCalled();
  });

  it("super admin can delete another user's entry", async () => {
    asMock(getAuthSession).mockResolvedValue(SUPER);
    asMock(getEntryById).mockResolvedValue(DB_ROW);
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(200);
    expect(deleteEntry).toHaveBeenCalledWith("e1");
  });

  it("owner can delete", async () => {
    asMock(getAuthSession).mockResolvedValue(OWNER);
    asMock(getEntryById).mockResolvedValue(DB_ROW);
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(200);
    expect(deleteEntry).toHaveBeenCalledWith("e1");
  });
});
