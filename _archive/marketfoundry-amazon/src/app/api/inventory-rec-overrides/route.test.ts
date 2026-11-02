// src/app/api/inventory-rec-overrides/route.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const session = { user: { email: "a@x.com", role: "editor" as string, clientIdCode: null as string | null } };
vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn(async () => session) }));
const dbCalls: string[] = [];
vi.mock("@/lib/db", () => ({
  db: {
    select: () => { dbCalls.push("select"); return { from: () => ({ where: async () => [] }) }; },
    insert: () => {
      dbCalls.push("insert");
      return { values: () => ({ onConflictDoUpdate: () => ({ returning: async () => [{ asin: "B0", sku: "S", qty: 5, note: "", setBy: "a@x.com", setAt: new Date("2026-10-07T00:00:00Z") }] }) }) };
    },
    delete: () => { dbCalls.push("delete"); return { where: async () => undefined }; },
  },
}));

import { GET, PUT, DELETE } from "./route";

const req = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) => new NextRequest(`http://x${url}`, init);
const body = { clientIdCode: "POO_SC_US", asin: "B0", sku: "S", qty: 5, note: "" };

describe("inventory-rec-overrides", () => {
  beforeEach(() => { dbCalls.length = 0; session.user.role = "editor"; session.user.clientIdCode = null; });

  it("PUT upserts and returns an ISO setAt", async () => {
    const res = await PUT(req("/api/inventory-rec-overrides", { method: "PUT", body: JSON.stringify(body) }));
    expect(res.status).toBe(200);
    expect((await res.json()).override.setAt).toBe("2026-10-07T00:00:00.000Z");
  });
  it("viewer cannot PUT or DELETE", async () => {
    session.user.role = "viewer";
    expect((await PUT(req("/api/inventory-rec-overrides", { method: "PUT", body: JSON.stringify(body) }))).status).toBe(403);
    expect((await DELETE(req("/api/inventory-rec-overrides?client=POO_SC_US&sku=S", { method: "DELETE" }))).status).toBe(403);
    expect(dbCalls).toEqual([]);
  });
  it("clients cannot read overrides (notes are internal)", async () => {
    session.user.role = "client";
    session.user.clientIdCode = "POO_SC_US";
    expect((await GET(req("/api/inventory-rec-overrides?client=POO_SC_US"))).status).toBe(403);
  });
  it("400s a bad body", async () => {
    const res = await PUT(req("/api/inventory-rec-overrides", { method: "PUT", body: JSON.stringify({ ...body, qty: 1.5 }) }));
    expect(res.status).toBe(400);
  });
});
