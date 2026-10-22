import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ status: "client_review", add: vi.fn(async (c: unknown) => ({ id: "C1", authorName: "Maria", parentCommentId: null, createdAt: new Date(), ...(c as object) })) }));
vi.mock("@/lib/auth-db", () => ({ getAuthSession: async () => ({ user: { email: "maria@client.com", name: "Maria", role: "client", clientIdCode: "TRS_SC_US" } }) }));
vi.mock("@/lib/seo/revision-db", () => ({
  getRevisionWithProject: async () => ({ revision: { id: "R1", status: h.status, content: { A1: { Title: "t" } } }, project: { id: "P1", clientIdCode: "TRS_SC_US" } }),
  addComment: h.add,
}));
vi.mock("@/lib/seo/revision-portal", async (orig) => ({ ...(await orig<typeof import("@/lib/seo/revision-portal")>()), seoSectionEnabled: async () => true }));
vi.mock("@/lib/db", () => ({ db: {} }));

import { POST } from "./route";
const ctx = { params: Promise.resolve({ revisionId: "R1" }) };
const post = (body: unknown) => POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }) as never, ctx);

beforeEach(() => { h.status = "client_review"; h.add.mockClear(); });

describe("portal comments", () => {
  it("valid target → 201 with audience forced to client", async () => {
    expect((await post({ asin: "A1", fieldKey: "Title", body: "Shorter", audience: "internal" })).status).toBe(201);
    expect(h.add).toHaveBeenLastCalledWith(expect.objectContaining({ audience: "client", authorEmail: "maria@client.com" }));
  });
  it("prototype keys are rejected → 400", async () => {
    expect((await post({ asin: "constructor", fieldKey: "toString", body: "x" })).status).toBe(400);
    expect(h.add).not.toHaveBeenCalled();
  });
  it("revision not in client_review → 409", async () => {
    h.status = "approved";
    expect((await post({ asin: "A1", fieldKey: "Title", body: "x" })).status).toBe(409);
  });
});
