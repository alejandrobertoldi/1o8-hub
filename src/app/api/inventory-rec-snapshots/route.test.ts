// src/app/api/inventory-rec-snapshots/route.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const session = { user: { email: "a@x.com", role: "editor" as string, clientIdCode: null as string | null } };
vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn(async () => session) }));

const header = {
  id: "11111111-1111-1111-1111-111111111111", clientIdCode: "POO_SC_US", sentBy: "a@x.com",
  sentAt: new Date("2026-10-07T14:00:00Z"), method: "recent", recentDays: 90, seasonalStart: null, seasonalEnd: null,
  upliftPct: 0, skuCount: 1, unitsToSend: 200, overstockSkus: 0, overstockUnits: 0,
};
const storedRow = { id: "r1", snapshotId: header.id, asin: "B0", sku: "S", productName: "T", mainImageUrl: "",
  available: 1, inbound: 0, reserved: 0, stockPosition: 1, basisUnits: 100, liveCalc: 109, overrideQty: 200, note: "internal", final: 200 };

const txInserts: unknown[] = [];
const selectQueue: unknown[][] = [];
const chain = () => {
  const c: Record<string, unknown> = {};
  for (const k of ["from", "where", "orderBy"]) c[k] = () => c;
  c.limit = async () => selectQueue.shift() ?? [];
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(selectQueue.shift() ?? []).then(res);
  return c;
};
vi.mock("@/lib/db", () => ({
  db: {
    select: () => chain(),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        insert: () => ({
          values: (v: unknown) => {
            txInserts.push(v);
            return { returning: async () => [header] };
          },
        }),
      }),
  },
}));

import { GET, POST } from "./route";
import { GET as GET_ONE } from "./[id]/route";

const rowIn = { asin: "B0", sku: "S", productName: "T", mainImageUrl: "", available: 1, inbound: 0, reserved: 0,
  stockPosition: 1, basisUnits: 100, liveCalc: 109, overrideQty: 200, note: "internal", final: 200 };
const settings = { method: "recent", recentDays: 90, seasonalStart: null, seasonalEnd: null, upliftPct: 0 };
const post = (b: unknown) => POST(new NextRequest("http://x/api/inventory-rec-snapshots", { method: "POST", body: JSON.stringify(b) }));
const getOne = () => GET_ONE(new NextRequest(`http://x/api/inventory-rec-snapshots/${header.id}`), { params: Promise.resolve({ id: header.id }) });

describe("inventory-rec-snapshots", () => {
  beforeEach(() => { txInserts.length = 0; selectQueue.length = 0; session.user.role = "editor"; session.user.clientIdCode = null; });

  it("POST writes header with server-computed totals and rows in one transaction", async () => {
    const res = await post({ clientIdCode: "POO_SC_US", settings, rows: [rowIn] });
    expect(res.status).toBe(200);
    expect(txInserts[0]).toMatchObject({ clientIdCode: "POO_SC_US", sentBy: "a@x.com", unitsToSend: 200, skuCount: 1 });
    expect(txInserts[1]).toEqual([expect.objectContaining({ snapshotId: header.id, final: 200, note: "internal" })]);
  });
  it("POST 400s zero rows and 403s viewers", async () => {
    expect((await post({ clientIdCode: "POO_SC_US", settings, rows: [] })).status).toBe(400);
    session.user.role = "viewer";
    expect((await post({ clientIdCode: "POO_SC_US", settings, rows: [rowIn] })).status).toBe(403);
    expect(txInserts).toEqual([]);
  });
  it("portal client gets their snapshot without note/overrideQty", async () => {
    session.user.role = "client";
    session.user.clientIdCode = "POO_SC_US";
    selectQueue.push([header], [storedRow]);
    const body = await (await getOne()).json();
    expect(body.rows[0]).not.toHaveProperty("note");
    expect(body.rows[0]).not.toHaveProperty("overrideQty");
    expect(body.snapshot.sentBy).toBe("");
  });
  it("portal client cannot read another client's snapshot", async () => {
    session.user.role = "client";
    session.user.clientIdCode = "OTHER_SC_US";
    selectQueue.push([header]);
    expect((await getOne()).status).toBe(403);
  });
  it("hub list returns ISO sentAt", async () => {
    selectQueue.push([header]);
    const body = await (await GET(new NextRequest("http://x/api/inventory-rec-snapshots?client=POO_SC_US"))).json();
    expect(body.snapshots[0].sentAt).toBe("2026-10-07T14:00:00.000Z");
  });
});
