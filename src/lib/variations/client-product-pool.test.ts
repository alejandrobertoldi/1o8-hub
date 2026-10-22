import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchAllClientProducts, getColValue, type PoolProduct } from "./client-product-pool";

function mkProduct(id: string, extra: Partial<PoolProduct> = {}): PoolProduct {
  return {
    id, asin: id, sku: null, itemName: null, mainImageUrl: null,
    variationId: null, variationGroup: null, parentageLevel: null, status: null,
    variations: null, rawColumnValues: null, ...extra,
  };
}

function mockPages(pages: PoolProduct[][], total: number) {
  let call = 0;
  return vi.fn(async () => {
    const data = pages[call] ?? [];
    call += 1;
    return { ok: true, json: async () => ({ data, pagination: { total } }) } as Response;
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchAllClientProducts", () => {
  it("accumulates across pages until total is reached", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => mkProduct(`a${i}`));
    const page2 = Array.from({ length: 50 }, (_, i) => mkProduct(`b${i}`));
    vi.stubGlobal("fetch", mockPages([page1, page2], 150));
    const res = await fetchAllClientProducts("ACME");
    expect(res.products).toHaveLength(150);
    expect(res.total).toBe(150);
    expect(res.capped).toBe(false);
  });

  it("caps the result and flags capped=true when total exceeds the cap", async () => {
    const full = Array.from({ length: 100 }, (_, i) => mkProduct(`x${i}`));
    vi.stubGlobal("fetch", mockPages([full, full, full], 5000));
    const res = await fetchAllClientProducts("ACME", { cap: 200 });
    expect(res.products).toHaveLength(200);
    expect(res.capped).toBe(true);
  });

  it("stops when a page returns fewer rows than total claims (defensive)", async () => {
    vi.stubGlobal("fetch", mockPages([[mkProduct("only")], []], 999));
    const res = await fetchAllClientProducts("ACME");
    expect(res.products).toHaveLength(1);
  });

  it("returns empty for a client with no products", async () => {
    vi.stubGlobal("fetch", mockPages([[]], 0));
    const res = await fetchAllClientProducts("ACME");
    expect(res.products).toHaveLength(0);
    expect(res.total).toBe(0);
    expect(res.capped).toBe(false);
  });

  it("throws when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false }) as Response));
    await expect(fetchAllClientProducts("ACME")).rejects.toThrow("Failed to load products");
  });
});

describe("getColValue", () => {
  it("reads standard columns and theme-attr keys from the variations blob", () => {
    const p = mkProduct("p1", {
      status: "Active", variationId: "VID1", variationGroup: "G1",
      parentageLevel: "Child",
      variations: { VariationThemeName: "FLAVOR/SIZE", Flavor: "Vanilla", Size: "Large" },
    });
    expect(getColValue(p, "status")).toBe("Active");
    expect(getColValue(p, "varId")).toBe("VID1");
    expect(getColValue(p, "group")).toBe("G1");
    expect(getColValue(p, "theme")).toBe("FLAVOR/SIZE");
    expect(getColValue(p, "parentage")).toBe("Child");
    expect(getColValue(p, "Flavor")).toBe("Vanilla");
    expect(getColValue(p, "Missing")).toBe("");
  });
});
