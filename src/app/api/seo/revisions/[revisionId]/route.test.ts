import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ session: { user: { email: "pat@x.com", name: "Pat", role: "editor" } } as unknown, status: "pm_review",
  products: [{ id: "M1", asin: "A1", sku: "S1" }] as unknown[], skus: [{ asin: "A1", sku: "S1" }] as unknown[], images: [] as unknown[] }));
vi.mock("@/lib/auth-db", () => ({ getAuthSession: async () => h.session }));
vi.mock("@/lib/seo/revision-db", () => ({
  getRevisionWithProject: async (id: string) => id === "R1"
    ? { revision: { id: "R1", status: h.status, submittedByEmail: "sam@x.com", content: { A1: { Title: "t" } } }, project: { id: "P1", name: "TRS_v01", clientIdCode: "TRS_SC_US" } }
    : null,
  listComments: async () => [{ id: "C1", audience: "internal" }],
  listOpenCommentsOfPrevious: async () => [{ id: "C0", body: "still open from r1" }],
  listEvents: async () => [],
}));
vi.mock("@/lib/seo/revision-approvers", () => ({ loadClientApprovers: async () => ({ pm: { name: "Pat", email: "pat@x.com" }, am: null }) }));
vi.mock("@/lib/db", () => ({ db: {
  select: () => ({ from: (t: Record<symbol, unknown>) => ({ where: async () => (t?.[Symbol.for("drizzle:Name")] === "seo_asins" ? h.skus : h.products) }) }),
  execute: async () => h.images,
} }));

import { GET } from "./route";

describe("GET revision detail (staff)", () => {
  beforeEach(() => { h.status = "pm_review"; h.products = [{ id: "M1", asin: "A1", sku: "S1" }]; h.skus = [{ asin: "A1", sku: "S1" }]; h.images = []; });
  it("two catalog rows on one ASIN: returns only the project-SKU row, with its Listing Images", async () => {
    h.products = [{ id: "M0", asin: "A1", sku: "S1-MERCHANT" }, { id: "M1", asin: "A1", sku: "S1" }];
    h.images = [{ productId: "M1", slot: "MAIN", driveFileId: "d0" }];
    const body = await (await GET(new Request("http://x") as never, { params: Promise.resolve({ revisionId: "R1" }) })).json();
    expect(body.products.map((p: { id: string }) => p.id)).toEqual(["M1"]);
    expect(body.listingImages.M1.MainImageURL).toContain("d0");
  });
  it("assigned PM sees approve/request_changes", async () => {
    const body = await (await GET(new Request("http://x") as never, { params: Promise.resolve({ revisionId: "R1" }) })).json();
    expect(body.me).toEqual({ step: "pm", actedAs: "assigned", actions: ["approve", "request_changes"], overrideAs: null });
    expect(body.products).toHaveLength(1);
    expect(body.comments).toHaveLength(1);
    expect(body.previousOpenComments).toEqual([{ id: "C0", body: "still open from r1" }]);
  });
  it("unknown revision → 404; client role → 403", async () => {
    expect((await GET(new Request("http://x") as never, { params: Promise.resolve({ revisionId: "NOPE" }) })).status).toBe(404);
    h.session = { user: { email: "c@x.com", role: "client" } };
    expect((await GET(new Request("http://x") as never, { params: Promise.resolve({ revisionId: "R1" }) })).status).toBe(403);
  });
  it("a viewer-role session on the assigned PM's email gets no actions", async () => {
    h.session = { user: { email: "pat@x.com", name: "Pat", role: "viewer" } };
    const body = await (await GET(new Request("http://x") as never, { params: Promise.resolve({ revisionId: "R1" }) })).json();
    expect(body.me).toEqual({ step: "pm", actedAs: "assigned", actions: [], overrideAs: null });
  });
  it("client_review: an owner who is not the author gets the override actions; the author and an editor get none", async () => {
    h.status = "client_review";
    const get = async () => (await (await GET(new Request("http://x") as never, { params: Promise.resolve({ revisionId: "R1" }) })).json()).me;
    h.session = { user: { email: " Boss@X.com ", name: "Boss", role: "owner" } };
    expect(await get()).toEqual({ step: "client", actedAs: "override", actions: ["approve", "request_changes"], overrideAs: "Owner" });
    h.session = { user: { email: "SAM@x.com", name: "Sam", role: "owner" } };
    expect((await get()).actions).toEqual([]);
    h.session = { user: { email: "pat@x.com", name: "Pat", role: "editor" } };
    expect(await get()).toEqual({ step: "client", actedAs: null, actions: [], overrideAs: null });
  });
});
