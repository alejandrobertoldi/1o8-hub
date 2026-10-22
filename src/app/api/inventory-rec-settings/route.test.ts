// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const session = { user: { email: "a@x.com", role: "editor" as string } };
vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn(async () => session) }));
const insertValues = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    insert: () => ({ values: (v: unknown) => { insertValues(v); return { onConflictDoUpdate: async () => undefined }; } }),
  },
}));

import { POST, toRecSettings } from "./route";

const post = (body: unknown) =>
  POST(new NextRequest("http://x/api/inventory-rec-settings", { method: "POST", body: JSON.stringify(body) }));

const valid = { clientIdCode: "POO_SC_US", method: "seasonal", recentDays: 90, seasonalStart: "2024-10-01", seasonalEnd: "2025-01-31", upliftPct: 30 };

describe("inventory-rec-settings", () => {
  beforeEach(() => { insertValues.mockClear(); session.user.role = "editor"; });

  it("defaults when no row exists", () => {
    expect(toRecSettings(undefined)).toEqual({ method: "greater", recentDays: 90, seasonalStart: null, seasonalEnd: null, upliftPct: 0 });
  });
  it("saves a valid config", async () => {
    const res = await post(valid);
    expect(res.status).toBe(200);
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ method: "seasonal", seasonalStart: "2024-10-01", upliftPct: 30 }));
  });
  it("403s a viewer before touching the db", async () => {
    session.user.role = "viewer";
    expect((await post(valid)).status).toBe(403);
    expect(insertValues).not.toHaveBeenCalled();
  });
  it("400s an injection date", async () => {
    const res = await post({ ...valid, seasonalStart: "2024-10-01' OR 1=1 --" });
    expect(res.status).toBe(400);
    expect(insertValues).not.toHaveBeenCalled();
  });
});
