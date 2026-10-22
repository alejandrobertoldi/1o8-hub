// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-db", () => ({
  getAuthSession: vi.fn(async () => ({
    user: { email: "tester@example.com", role: "editor" },
  })),
}));
const mockSelectFn = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelectFn(...args),
    delete: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));
vi.mock("@/lib/alr-parser", async () => {
  const actual = await vi.importActual<typeof import("@/lib/alr-parser")>(
    "@/lib/alr-parser"
  );
  return {
    ...actual,
    parseAlr: vi.fn(() => [
      { rowIndex: 0, sellerSku: "SKU-1", asin1: "B01", status: "Active", itemName: "Red" },
      { rowIndex: 1, sellerSku: "SKU-2", asin1: "B02", status: "Inactive", itemName: "Blue" },
      { rowIndex: 2, sellerSku: "SKU-3", asin1: "B03", status: "Active", itemName: "Green" },
    ]),
  };
});

import { POST } from "./route";

describe("POST /api/onboarding/alr-link", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectFn.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          // staged_clr_products for the client: SKU-1 + SKU-2 only (SKU-3 is ALR-only)
          { sku: "SKU-1" },
          { sku: "SKU-2" },
        ]),
      }),
    });
  });

  function previewRequest(): Request {
    const fd = new FormData();
    fd.set("file", new File(["ignored, parser is mocked"], "alr.txt"));
    fd.set("clientIdCode", "TEST_CLIENT");
    return new Request("http://localhost/api/onboarding/alr-link?phase=preview", {
      method: "POST",
      body: fd,
    });
  }

  it("preview returns join report against staged_clr_products", async () => {
    // @ts-expect-error
    const res = await POST(previewRequest());
    const body = await res.json();
    expect(body.totalRows).toBe(3);
    expect(body.statusCounts).toEqual({ active: 2, inactive: 1, incomplete: 0, other: 0 });
    expect(body.joinReport).toEqual({ matched: 2, alrOnly: 1, clrOnly: 0 });
  });

  it("execute writes to staged_alr_links", async () => {
    const rows = [{ sku: "SKU-1", asin: "B01", status: "Active" }];
    const req = new Request("http://localhost/api/onboarding/alr-link?phase=execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientIdCode: "TEST_CLIENT", parsedRows: rows }),
    });
    // @ts-expect-error
    const res = await POST(req);
    const body = await res.json();
    expect(body.staged).toBe(1);
  });

  it("preview returns 401 when unauthenticated", async () => {
    const auth = await import("@/lib/auth-db");
    (auth.getAuthSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    // @ts-expect-error
    const res = await POST(previewRequest());
    expect(res.status).toBe(401);
  });
});
