import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  session: { user: { email: "sam@x.com", name: "Sam", role: "editor" } } as unknown,
  current: null as unknown,
  products: [] as unknown[],
  skus: [] as unknown[],
  clientCode: "TRS_SC_US" as string | null,
  masterUpdates: [] as unknown[],
  pushes: vi.fn(),
}));
vi.mock("@/lib/auth-db", () => ({ getAuthSession: async () => h.session }));
vi.mock("@/lib/event-logger", () => ({ logEvent: vi.fn() }));
vi.mock("@/lib/seo/revision-db", () => ({ currentApprovedRevision: async () => h.current, recordPushes: h.pushes }));
vi.mock("@/lib/db", () => {
  const db: Record<string, unknown> = {
    select: () => ({ from: (t: Record<symbol, unknown>) => ({ where: () => Object.assign(Promise.resolve(t?.[Symbol.for("drizzle:Name")] === "seo_asins" ? h.skus : h.products), { limit: async () => [{ id: "P1", name: "TRS_v01", brandName: "B", clientIdCode: h.clientCode }] }) }) }),
    update: () => ({ set: (s: unknown) => ({ where: async () => { h.masterUpdates.push(s); } }) }),
    insert: () => ({ values: async () => undefined }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return { db };
});

import { GET, POST } from "./route";
const call = (body: unknown = {}) => POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }) as never, { params: Promise.resolve({ id: "P1" }) });
const preview = () => GET(new Request("http://x") as never, { params: Promise.resolve({ id: "P1" }) });

beforeEach(() => {
  h.session = { user: { email: "sam@x.com", name: "Sam", role: "editor" } };
  h.clientCode = "TRS_SC_US";
  h.masterUpdates.length = 0; h.pushes.mockReset();
  h.current = { id: "R3", revisionNumber: 3, approvedAt: new Date("2026-10-04T00:00:00Z"), finalVia: "client", content: { A1: { Title: "Approved title" } } };
  h.skus = [{ asin: "A1", sku: "S" }];
  h.products = [{ id: "M1", asin: "A1", sku: "S", clientIdCode: "TRS_SC_US", itemName: "Old", itemHighlight: null, genericKeywords: null, contentSeo: {}, rawColumnValues: {}, changeLog: [] }];
});

describe("push approved revision", () => {
  it("no approved revision → 409", async () => {
    h.current = null;
    expect((await call()).status).toBe(409);
  });
  it("pushes the revision's text (not S6) and records the push", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect((h.masterUpdates[0] as { itemName: string }).itemName).toBe("Approved title");
    expect(h.pushes).toHaveBeenCalledWith([{ revisionId: "R3", projectId: "P1", productId: "M1", pushedBy: "sam@x.com", overrideReason: null }], expect.anything());
  });
  it("catalog drift after approval → 409 with drift until confirmDrift (Review Focus 5)", async () => {
    (h.products[0] as { changeLog: unknown[] }).changeLog = [{ field: "ItemName", changedAt: "2026-10-05T00:00:00.000Z", changedBy: "cat@x.com" }];
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).drift[0]).toMatchObject({ asin: "A1", key: "Title" });
    expect((await call({ confirmDrift: true })).status).toBe(200);
  });
  it("override without an approved revision: owner + reason only", async () => {
    h.current = null;
    expect((await call({ override: { reason: "urgent" } })).status).toBe(403);
    h.session = { user: { email: "boss@x.com", role: "owner" } };
    expect((await call({ override: { reason: " " } })).status).toBe(400);
  });
});

describe("two catalog rows share an ASIN", () => {
  it("preview and push both use the row on the project's SKU, never the other", async () => {
    const dup = { ...(h.products[0] as object), id: "M0", sku: "S-MERCHANT", itemName: "Other" };
    h.products = [dup, h.products[0], dup];
    const pv = await (await preview()).json();
    expect(pv.asins[0].productId).toBe("M1");
    const res = await call();
    expect(res.status).toBe(200);
    expect(h.masterUpdates).toHaveLength(1);
    expect(h.pushes).toHaveBeenCalledWith([expect.objectContaining({ productId: "M1" })], expect.anything());
  });
});

describe("project without a client", () => {
  it("POST and GET → 400 instead of matching ASINs across all clients", async () => {
    h.clientCode = null;
    const post = await call();
    expect(post.status).toBe(400);
    expect((await post.json()).error).toBe("Project has no client");
    const get = await preview();
    expect(get.status).toBe(400);
    expect((await get.json()).error).toBe("Project has no client");
    expect(h.masterUpdates).toHaveLength(0);
  });
});

describe("role gates (controller ruling)", () => {
  it("client-role session: POST 403 and no master update", async () => {
    h.session = { user: { email: "c@x.com", name: "C", role: "client" } };
    expect((await call()).status).toBe(403);
    expect(h.masterUpdates).toHaveLength(0);
    expect(h.pushes).not.toHaveBeenCalled();
  });
  it("client-role session: GET preview 403", async () => {
    h.session = { user: { email: "c@x.com", name: "C", role: "client" } };
    expect((await preview()).status).toBe(403);
  });
  it("staff GET preview reports the revision source", async () => {
    const res = await preview();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.source).toBe("revision");
    expect(json.asins[0]).toMatchObject({ asin: "A1", productId: "M1" });
  });
});
