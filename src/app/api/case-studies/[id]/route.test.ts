// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
const exec = vi.fn();
vi.mock("@/lib/db", () => ({ db: { execute: (...a: unknown[]) => exec(...a),
  transaction: async (fn: (tx: unknown) => unknown) => fn({ execute: (...a: unknown[]) => exec(...a) }) } }));
const load = vi.fn();
const blockers = vi.fn();
vi.mock("@/lib/case-study/kit/load", () => ({ loadCaseStudy: (...a: unknown[]) => load(...a), blockersFor: (...a: unknown[]) => blockers(...a) }));
import { getAuthSession } from "@/lib/auth-db";
const session = getAuthSession as unknown as ReturnType<typeof vi.fn>;
const ctx = (id = "cs1", sectionId = "s1") => ({ params: Promise.resolve({ id, sectionId }) });
const patch = (body: unknown) => new NextRequest("http://x", { method: "PATCH", body: JSON.stringify(body) });
const deck = (stage: string) => ({ id: "cs1", stage, format: "high_level", metrics: { overrides: {} }, sections: [] });
const sqlText = () => exec.mock.calls.map((c) => JSON.stringify(c[0])).join("\n");
beforeEach(() => { vi.clearAllMocks(); session.mockResolvedValue({ user: { role: "editor", id: "u1" } }); exec.mockResolvedValue([]); blockers.mockReturnValue([]); });

import { GET, PATCH, DELETE } from "./route";

describe("PATCH owner", () => {
  it("non-uuid ownerId → 400 without touching the DB", async () => {
    load.mockResolvedValue(deck("drafting"));
    expect((await PATCH(patch({ ownerId: "not-a-uuid" }), ctx())).status).toBe(400);
    expect((await PATCH(patch({ ownerId: 42 }), ctx())).status).toBe(400);
    expect(exec).not.toHaveBeenCalled();
  });
  it("unknown owner (FK 23503, direct or on cause) → 400", async () => {
    load.mockResolvedValue(deck("drafting"));
    exec.mockRejectedValueOnce(Object.assign(new Error("fk"), { code: "23503" }));
    expect((await PATCH(patch({ ownerId: "11111111-2222-3333-4444-555555555555" }), ctx())).status).toBe(400);
    exec.mockRejectedValueOnce(Object.assign(new Error("wrapped"), { cause: { code: "23503" } }));
    const res = await PATCH(patch({ ownerId: "11111111-2222-3333-4444-555555555555" }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Unknown owner");
  });
  it("valid uuid and null both write owner_id", async () => {
    load.mockResolvedValue(deck("drafting"));
    expect((await PATCH(patch({ ownerId: "11111111-2222-3333-4444-555555555555" }), ctx())).status).toBe(200);
    expect((await PATCH(patch({ ownerId: null }), ctx())).status).toBe(200);
    expect(sqlText()).toContain("owner_id");
  });
  it("other DB errors still throw", async () => {
    load.mockResolvedValue(deck("drafting"));
    exec.mockRejectedValueOnce(new Error("boom"));
    await expect(PATCH(patch({ ownerId: null }), ctx())).rejects.toThrow("boom");
  });
});

describe("PATCH stage", () => {
  it("illegal transition → 400", async () => {
    load.mockResolvedValue(deck("drafting"));
    expect((await PATCH(patch({ stage: "approved" }), ctx())).status).toBe(400);
  });
  it("approve with blockers → 409 with the list", async () => {
    load.mockResolvedValue(deck("in_review"));
    blockers.mockReturnValue([{ slide: "hl_cover", kind: "metric", key: "salesTotal", message: "m" }]);
    const res = await PATCH(patch({ stage: "approved" }), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).blockers).toHaveLength(1);
  });
  it("approve without blockers → 200 and writes stage", async () => {
    load.mockResolvedValue(deck("in_review"));
    expect((await PATCH(patch({ stage: "approved" }), ctx())).status).toBe(200);
    expect(sqlText()).toContain("approved");
  });
  it("manual sent sets sent_at", async () => {
    load.mockResolvedValue(deck("approved"));
    await PATCH(patch({ stage: "sent" }), ctx());
    expect(sqlText()).toContain("sent_at");
  });
  it("viewer → 403; missing deck → 404", async () => {
    session.mockResolvedValue({ user: { role: "viewer" } });
    expect((await PATCH(patch({ stage: "in_review" }), ctx())).status).toBe(403);
    session.mockResolvedValue({ user: { role: "editor" } });
    load.mockResolvedValue(null);
    expect((await PATCH(patch({ stage: "in_review" }), ctx())).status).toBe(404);
  });
});
describe("PATCH clientSector/contactEmail null handling", () => {
  it("explicit null clears to empty string, never the literal string \"null\"", async () => {
    load.mockResolvedValue(deck("drafting"));
    expect((await PATCH(patch({ clientSector: null }), ctx())).status).toBe(200);
    expect(sqlText()).toContain('""');
    expect(sqlText()).not.toMatch(/"null"/);
  });
});
describe("PATCH ordering: stage transition must not be undone by the contact/sector update", () => {
  it("{ stage: 'approved', clientSector: 'x' } from in_review with no blockers → stage update runs LAST", async () => {
    load.mockResolvedValue(deck("in_review"));
    expect((await PATCH(patch({ stage: "approved", clientSector: "x" }), ctx())).status).toBe(200);
    const last = exec.mock.calls.at(-1)?.[0];
    expect(JSON.stringify(last)).toContain("approved");
  });
});
describe("GET", () => {
  it("client role → 403", async () => {
    session.mockResolvedValue({ user: { role: "client" } });
    expect((await GET(new NextRequest("http://x"), ctx())).status).toBe(403);
  });
  it("returns deck + blockers", async () => {
    load.mockResolvedValue(deck("drafting"));
    blockers.mockReturnValue([{ key: "x" }]);
    expect((await (await GET(new NextRequest("http://x"), ctx())).json()).blockers).toEqual([{ key: "x" }]);
  });
});
describe("DELETE", () => {
  it("viewer → 403", async () => {
    session.mockResolvedValue({ user: { role: "viewer" } });
    expect((await DELETE(new NextRequest("http://x"), ctx())).status).toBe(403);
  });
  it("editor → ok", async () => {
    expect((await DELETE(new NextRequest("http://x"), ctx())).status).toBe(200);
  });
});
