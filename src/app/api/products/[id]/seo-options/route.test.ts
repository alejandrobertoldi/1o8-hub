import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockDb, mockedGetAuthSession, mockedGetSeoVersions } = vi.hoisted(() => ({
  mockDb: { select: vi.fn() },
  mockedGetAuthSession: vi.fn(),
  mockedGetSeoVersions: vi.fn(),
}));

vi.mock("@/lib/auth-db", () => ({ getAuthSession: mockedGetAuthSession }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/bigquery", () => ({ getSeoVersions: mockedGetSeoVersions }));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ eq: args })),
  or: vi.fn((...args: unknown[]) => ({ or: args })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  desc: vi.fn((col: unknown) => col),
}));

import { GET } from "./route";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const ctx = { params: Promise.resolve({ id: PRODUCT_ID }) };
const req = new NextRequest(`http://localhost/api/products/${PRODUCT_ID}/seo-options`);

const PRODUCT = {
  id: PRODUCT_ID,
  asin: "B00TEST123",
  sku: "SKU-1",
  clientIdCode: "HAL",
};

function mockSelects(results: {
  product?: unknown[];
  projects?: unknown[];
  listingAsins?: unknown[];
}) {
  const queue = [
    results.product ?? [],
    results.projects ?? [],
    results.listingAsins ?? [],
  ];
  mockDb.select.mockImplementation(() => {
    const next = queue.shift() ?? [];
    const chain: {
      from: ReturnType<typeof vi.fn>;
      where: ReturnType<typeof vi.fn>;
      limit: ReturnType<typeof vi.fn>;
      orderBy: ReturnType<typeof vi.fn>;
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>;
    } = {
      from: vi.fn(),
      where: vi.fn(),
      limit: vi.fn(),
      orderBy: vi.fn(),
      then: (resolve, reject) => Promise.resolve(next).then(resolve, reject),
    };
    chain.from.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    chain.limit.mockResolvedValue(next);
    chain.orderBy.mockResolvedValue(next);
    return chain;
  });
}

describe("GET /api/products/[id]/seo-options", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetSeoVersions.mockResolvedValue([]);
  });

  it("returns 401 when not authenticated", async () => {
    mockedGetAuthSession.mockResolvedValue(null);
    const res = await GET(req, ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the product does not exist", async () => {
    mockedGetAuthSession.mockResolvedValue({ user: { email: "a@b.com" } });
    mockSelects({ product: [] });
    const res = await GET(req, ctx);
    expect(res.status).toBe(404);
  });

  it("always includes CLR version 0 and SEO Manager project names", async () => {
    mockedGetAuthSession.mockResolvedValue({ user: { email: "a@b.com" } });
    mockedGetSeoVersions.mockResolvedValue([
      { SEOVersionNumber: "1", SEOCategory: "SEO", SEOStatus: "Current" },
    ]);
    mockSelects({
      product: [PRODUCT],
      projects: [
        {
          id: "proj-1",
          name: "HAL SEO V1",
          version: 1,
          status: "live",
          linkedProductId: PRODUCT_ID,
        },
        {
          id: "proj-old",
          name: "Archived",
          version: 9,
          status: "archived",
          linkedProductId: null,
        },
      ],
      listingAsins: [{ projectId: "proj-1" }],
    });

    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.projects.map((p: { name: string }) => p.name)).toEqual(["HAL SEO V1"]);
    expect(body.projects[0].linkedToProduct).toBe(true);
    expect(body.versions[0]).toMatchObject({
      seoVersionNumber: "0",
      source: "clr",
      label: "0 · Inherited (CLR)",
    });
    expect(body.versions.some((v: { seoVersionNumber: string }) => v.seoVersionNumber === "1")).toBe(
      true
    );
  });

  it("still returns version 0 when BigQuery is unavailable", async () => {
    mockedGetAuthSession.mockResolvedValue({ user: { email: "a@b.com" } });
    mockedGetSeoVersions.mockRejectedValue(new Error("BQ down"));
    mockSelects({
      product: [PRODUCT],
      projects: [],
      listingAsins: [],
    });

    const res = await GET(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.versions).toHaveLength(1);
    expect(body.versions[0].seoVersionNumber).toBe("0");
  });
});
