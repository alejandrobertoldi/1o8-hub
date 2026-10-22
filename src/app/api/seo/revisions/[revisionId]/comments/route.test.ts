import { describe, it, expect, vi } from "vitest";

const h = vi.hoisted(() => ({ role: "editor", add: vi.fn(async (c: unknown) => ({ id: "C1", ...(c as object) })), resolve: vi.fn() }));
vi.mock("@/lib/auth-db", () => ({ getAuthSession: async () => ({ user: { email: "pat@x.com", name: "Pat", role: h.role } }) }));
vi.mock("@/lib/seo/revision-db", () => ({
  getRevisionWithProject: async () => ({ revision: { id: "R1", content: { A1: { Title: "t" } } }, project: { id: "P1" } }),
  addComment: h.add, setCommentResolved: h.resolve,
}));

import { PATCH, POST } from "./route";
const ctx = { params: Promise.resolve({ revisionId: "R1" }) };
const req = (method: string, body: unknown) => new Request("http://x", { method, body: JSON.stringify(body) }) as never;

describe("staff comments", () => {
  it("defaults to internal audience; rejects an ASIN or field not in the revision", async () => {
    expect((await POST(req("POST", { asin: "A1", fieldKey: "Title", body: "tighter" }), ctx)).status).toBe(201);
    expect(h.add).toHaveBeenLastCalledWith(expect.objectContaining({ audience: "internal", authorEmail: "pat@x.com" }));
    expect((await POST(req("POST", { asin: "ZZ", fieldKey: "Title", body: "x" }), ctx)).status).toBe(400);
    expect((await POST(req("POST", { asin: "A1", fieldKey: "Nope", body: "x" }), ctx)).status).toBe(400);
    expect((await POST(req("POST", { asin: "constructor", fieldKey: "toString", body: "x" }), ctx)).status).toBe(400);
  });
  it("resolve / unresolve", async () => {
    expect((await PATCH(req("PATCH", { commentId: "C1", resolved: true }), ctx)).status).toBe(200);
    expect(h.resolve).toHaveBeenLastCalledWith("C1", "R1", "pat@x.com");
    await PATCH(req("PATCH", { commentId: "C1", resolved: false }), ctx);
    expect(h.resolve).toHaveBeenLastCalledWith("C1", "R1", null);
  });
  it("viewers are read-only → 403 on POST and PATCH", async () => {
    h.role = "viewer"; h.add.mockClear(); h.resolve.mockClear();
    try {
      expect((await POST(req("POST", { asin: "A1", fieldKey: "Title", body: "x" }), ctx)).status).toBe(403);
      expect((await PATCH(req("PATCH", { commentId: "C1", resolved: true }), ctx)).status).toBe(403);
      expect(h.add).not.toHaveBeenCalled();
      expect(h.resolve).not.toHaveBeenCalled();
    } finally { h.role = "editor"; }
  });
});
