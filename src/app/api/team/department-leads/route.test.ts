import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
vi.mock("@/lib/db", () => {
  const db: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn(),
    update: vi.fn(),
    transaction: vi.fn(),
  };
  return { db };
});
vi.mock("@/lib/event-logger", () => ({ logEventAsync: vi.fn() }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn() };
});

import { PUT } from "./route";
import { getAuthSession } from "@/lib/auth-db";
import { db } from "@/lib/db";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const THEM = "22222222-2222-4222-8222-222222222222";

function putReq(body: unknown) {
  return new Request("http://localhost/api/team/department-leads", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

let txDeleteWhere: ReturnType<typeof vi.fn>;
let txInsertValues: ReturnType<typeof vi.fn>;
let tx: { delete: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.clearAllMocks();
  txDeleteWhere = vi.fn().mockResolvedValue(undefined);
  txInsertValues = vi.fn().mockResolvedValue(undefined);
  tx = {
    delete: vi.fn().mockReturnValue({ where: txDeleteWhere }),
    insert: vi.fn().mockReturnValue({ values: txInsertValues }),
  };
  asMock(db.transaction).mockImplementation((cb: (tx: unknown) => unknown) =>
    cb(tx)
  );
  asMock(db.select).mockReturnValue({
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([
      { id: THEM, email: "alvin@marketfoundry.agency" },
    ]),
  });
});

describe("PUT /api/team/department-leads", () => {
  it("401s without a session", async () => {
    asMock(getAuthSession).mockResolvedValue(null);
    const res = await PUT(putReq({ department: "creative", userId: THEM }));
    expect(res.status).toBe(401);
  });

  it("403s for a non-admin", async () => {
    asMock(getAuthSession).mockResolvedValue({
      user: { id: "u1", role: "editor", email: "e@x" },
    });
    const res = await PUT(putReq({ department: "creative", userId: THEM }));
    expect(res.status).toBe(403);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("400s an unknown department", async () => {
    asMock(getAuthSession).mockResolvedValue({
      user: { id: "u1", role: "admin", email: "a@x" },
    });
    const res = await PUT(putReq({ department: "engineering", userId: THEM }));
    expect(res.status).toBe(400);
  });

  it("assigns a lead from OUTSIDE the department (no 'must belong' guard)", async () => {
    // THEM's own department need not be 'seo' — the decoupled model allows a
    // cross-department lead. No 'leadsDepartment' is set anymore; the junction
    // row is inserted instead.
    asMock(getAuthSession).mockResolvedValue({
      user: { id: "u1", role: "admin", email: "a@x", name: "Admin" },
    });
    const res = await PUT(putReq({ department: "seo", userId: THEM }));
    expect(res.status).toBe(200);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.delete).toHaveBeenCalledTimes(1);
    expect(txInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: THEM, department: "seo" })
    );
  });

  it("assigns a lead: clears the dept's prior holder then inserts, in one txn", async () => {
    asMock(getAuthSession).mockResolvedValue({
      user: { id: "u1", role: "admin", email: "a@x", name: "Admin" },
    });
    const res = await PUT(putReq({ department: "seo", userId: THEM }));
    expect(res.status).toBe(200);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(tx.delete).toHaveBeenCalledTimes(1);
    expect(txInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ userId: THEM, department: "seo" })
    );
  });

  it("clears a lead when userId is null (delete only, no insert)", async () => {
    asMock(getAuthSession).mockResolvedValue({
      user: { id: "u1", role: "admin", email: "a@x", name: "Admin" },
    });
    const res = await PUT(putReq({ department: "creative", userId: null }));
    expect(res.status).toBe(200);
    expect(tx.delete).toHaveBeenCalledTimes(1);
    expect(tx.insert).not.toHaveBeenCalled();
  });
});
