import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ session: null as unknown, decide: vi.fn(), status: "client_review", enabled: true, events: [] as unknown[], selects: 0, rows: [] as unknown[], kws: [] as unknown[], images: [] as unknown[] }));
vi.mock("@/lib/auth-db", () => ({ getAuthSession: async () => h.session }));
vi.mock("@/lib/seo/revision-db", async (orig) => ({
  ...(await orig<typeof import("@/lib/seo/revision-db")>()),
  getRevisionWithProject: async () => ({ revision: { id: "R1", revisionNumber: 2, status: h.status, submittedAt: new Date(), content: { A1: { Title: "t" } } }, project: { id: "P1", name: "TRS_v01", clientIdCode: "TRS_SC_US" } }),
  listComments: async () => [], listEvents: async () => h.events, decideRevision: h.decide,
}));
vi.mock("@/lib/seo/revision-portal", async (orig) => ({ ...(await orig<typeof import("@/lib/seo/revision-portal")>()), seoSectionEnabled: async () => h.enabled }));
vi.mock("@/lib/db", () => ({ db: {
  select: () => { h.selects++; return { from: (t: Record<symbol, unknown>) => ({ where: async () => (t?.[Symbol.for("drizzle:Name")] === "seo_keywords" ? h.kws : h.rows) }) }; },
  execute: async () => h.images,
} }));

import { GET, POST } from "./route";
const ctx = { params: Promise.resolve({ revisionId: "R1" }) };
const post = (body: unknown) => POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }) as never, ctx);

beforeEach(() => { h.decide.mockReset(); h.decide.mockResolvedValue({ id: "R1" }); h.status = "client_review"; h.events = []; h.selects = 0; h.rows = []; h.enabled = true; h.session = { user: { email: "maria@client.com", name: "Maria", role: "client", clientIdCode: "TRT_SC_US,TRS_SC_US" } }; });

describe("portal revision preview data", () => {
  it("returns positive keywords and Listing Images through the portal image route", async () => {
    h.rows = [{ id: "M1", asin: "A1", sku: "S1" }];
    h.kws = [{ text: "charcoal for dogs", tier: "T1", negative: false }, { text: "free", tier: "T4", negative: true }];
    h.images = [{ productId: "M1", slot: "MAIN", driveFileId: "secret-drive-id" }];
    const body = await (await GET(new Request("http://x") as never, ctx)).json();
    expect(body.keywords).toEqual([{ KeywordText: "charcoal for dogs", KeywordPriorityTier: "T1" }]);
    expect(body.listingImages.M1.MainImageURL).toBe("/api/portal/seo/revisions/R1/image?productId=M1&slot=MAIN");
    expect(JSON.stringify(body)).not.toContain("secret-drive-id");
  });
});

describe("portal revision", () => {
  it("second client of a multi-account user: GET 200", async () => {
    expect((await GET(new Request("http://x") as never, ctx)).status).toBe(200);
  });
  it("another client's user → 403; SEO section off → 403", async () => {
    h.session = { user: { email: "x@other.com", role: "client", clientIdCode: "REA_SC_US" } };
    expect((await GET(new Request("http://x") as never, ctx)).status).toBe(403);
    h.session = { user: { email: "maria@client.com", role: "client", clientIdCode: "TRS_SC_US" } };
    h.enabled = false;
    expect((await GET(new Request("http://x") as never, ctx)).status).toBe(403);
  });
  it("client approves → step client, actedAs client", async () => {
    expect((await post({ action: "approve", expectedStatus: "client_review" })).status).toBe(200);
    expect(h.decide).toHaveBeenCalledWith(expect.objectContaining({ step: "client", actedAs: "client", action: "approve" }));
  });
  it("only while in client_review; request_changes needs a note", async () => {
    expect((await post({ action: "request_changes", expectedStatus: "client_review" })).status).toBe(400);
    h.status = "am_review";
    expect((await post({ action: "approve", expectedStatus: "client_review" })).status).toBe(409);
  });
  it("a hub admin previewing the portal cannot decide for the client", async () => {
    h.session = { user: { email: "boss@x.com", role: "owner" } };
    expect((await post({ action: "approve", expectedStatus: "client_review" })).status).toBe(403);
  });
  it("only shows revisions that were sent to the client", async () => {
    h.status = "changes_requested"; h.events = [];
    expect((await GET(new Request("http://x") as never, ctx)).status).toBe(404);
    h.status = "approved"; h.events = [{ step: "client", action: "approve", actorName: "Maria", note: null, createdAt: new Date() }];
    expect((await GET(new Request("http://x") as never, ctx)).status).toBe(200);
    h.status = "pm_review"; h.events = [];
    expect((await GET(new Request("http://x") as never, ctx)).status).toBe(404);
  });
  it("the visibility 404 never queries the catalog", async () => {
    h.status = "changes_requested"; h.events = [];
    expect((await GET(new Request("http://x") as never, ctx)).status).toBe(404);
    expect(h.selects).toBe(0);
  });
  it("returns products without internal columns", async () => {
    h.rows = [{ id: "P1", asin: "A1", itemName: "Widget", changeLog: [{ changedBy: "staff@marketfoundry.agency" }], rawColumnValues: { PortalNotes: "SECRET" }, costPrice: "9.99", isDirty: true }];
    const res = await GET(new Request("http://x") as never, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.products).toHaveLength(1);
    expect(body.products[0].itemName).toBe("Widget");
    for (const k of ["changeLog", "rawColumnValues", "costPrice", "isDirty"]) expect(body.products[0]).not.toHaveProperty(k);
  });
});
