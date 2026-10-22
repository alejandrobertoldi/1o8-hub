import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProductPdp } from "./product-pdp";

const base = {
  id: "P1", asin: "A1", sku: "S1", parentAsin: null, parentageLevel: "Child", clientIdCode: "C1",
  marketplace: "US", status: "Active", brandName: "Brand", itemName: "My title", summarizedTitle: null,
  listPrice: null, mainImageUrl: null, isDirty: false, variations: null,
};

function renderPdp(product: Record<string, unknown>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProductPdp product={product as never} productId="P1" readOnly familyEnabled={false} defaultExpanded />
    </QueryClientProvider>,
  );
}

describe("ProductPdp item highlight", () => {
  it("shows the Item Highlight right under the title, like Amazon", () => {
    renderPdp({ ...base, itemHighlight: "Travel First Aid, Poison Detox Aid Kit" });
    const title = screen.getByRole("heading", { level: 1, name: "My title" });
    const hl = screen.getByText("Travel First Aid, Poison Detox Aid Kit");
    expect(title.nextElementSibling).toBe(hl);
  });

  it("renders nothing extra when there is no Item Highlight", () => {
    renderPdp({ ...base, itemHighlight: null });
    expect(screen.getByRole("heading", { level: 1 }).nextElementSibling?.getAttribute("data-testid")).not.toBe("pdp-item-highlight");
  });
});

describe("ProductPdp store line", () => {
  it("uses the client name over the product's brand when given", () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <ProductPdp product={{ ...base, brandName: "Dr.Cuddles" } as never} productId="P1" readOnly familyEnabled={false} defaultExpanded storeName="ReadyRESCUE" />
      </QueryClientProvider>,
    );
    expect(screen.getByText("ReadyRESCUE Store")).toBeTruthy();
    expect(screen.queryByText("Dr.Cuddles Store")).toBeNull();
  });
  it("falls back to the product's brand without a client name", () => {
    renderPdp({ ...base, brandName: "Brand", itemHighlight: null });
    expect(screen.getByText("Brand Store")).toBeTruthy();
  });
});

describe("ProductPdp Listing Images first, Amazon URL as fallback", () => {
  const renderWith = (product: Record<string, unknown>, listingImages?: Record<string, string>) => {
    const qc = new QueryClient();
    return render(
      <QueryClientProvider client={qc}>
        <ProductPdp product={{ ...base, itemHighlight: null, ...product } as never} productId="P1" readOnly familyEnabled={false} defaultExpanded listingImages={listingImages} />
      </QueryClientProvider>,
    );
  };
  it("an uploaded Listing Image wins over the Amazon URL for that slot", () => {
    const { container } = renderWith({ mainImageUrl: "https://m.media-amazon.com/amz.jpg" }, { MainImageURL: "/hub/main.jpg" });
    expect(container.innerHTML).toContain("/hub/main.jpg");
    expect(container.innerHTML).not.toContain("amz.jpg");
  });
  it("no upload for a slot → the Amazon URL is shown", () => {
    const { container } = renderWith({ mainImageUrl: "https://m.media-amazon.com/amz.jpg" }, {});
    expect(container.innerHTML).toContain("amz.jpg");
  });
  it("no Amazon URL either → the uploaded image still fills the slot", () => {
    renderWith({}, { MainImageURL: "/hub/main.jpg" });
    expect(screen.getByText("1/9 images")).toBeTruthy();
  });
});

describe("ProductPdp variation buttons limited to the project's ASINs", () => {
  const kid = (id: string, asin: string, size: string, price: string) => ({
    id, asin, sku: id, parentSku: null, parentAsin: "PAR", parentageLevel: "Child", clientIdCode: "C1", marketplace: "US",
    status: "Active", brandName: "B", itemName: size, summarizedTitle: null, listPrice: price, mainImageUrl: null, variations: { Size: size },
  });
  function renderFamily(props: Record<string, unknown>) {
    const family = { parent: null, currentId: "P1", variationTheme: "Size",
      children: [kid("P1", "A1", "30 g (Pack of 3)", "79.99"), kid("P2", "A2", "30 g (Pack of 2)", "59.99"), kid("P2dup", "A2", "30 g (Pack of 2)", "59.99"), kid("P3", "A3", "30 g (Pack of 1)", "29.99")] };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => family })));
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <ProductPdp product={{ ...base, asin: "A1", itemHighlight: null } as never} productId="P1" readOnly familyEnabled defaultExpanded {...props} />
      </QueryClientProvider>,
    );
  }
  it("one button per project ASIN (no duplicates, nothing outside the project); clicking switches in place", async () => {
    const onSelect = vi.fn();
    renderFamily({ variationAsins: ["A1", "A2"], onSelectAsin: onSelect });
    const b2 = await screen.findByRole("button", { name: /Pack of 2/ });
    expect(screen.queryByText(/Pack of 1/)).toBeNull();
    expect(screen.getAllByRole("button", { name: /Pack of 2/ })).toHaveLength(1);
    expect(screen.queryAllByRole("link").filter((a) => /\/products\//.test(a.getAttribute("href") ?? ""))).toHaveLength(0);
    fireEvent.click(b2);
    expect(onSelect).toHaveBeenCalledWith("A2");
  });
  it("hides the variation buttons when the project has a single ASIN", async () => {
    renderFamily({ variationAsins: ["A1"], onSelectAsin: vi.fn() });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/Pack of 2/)).toBeNull();
  });
});

describe("ProductPdp seoOnly", () => {
  it("keeps the SEO fields and hides the catalog-attribute sections", () => {
    const qc = new QueryClient();
    const product = { ...base, itemHighlight: "HL", brandName: "Brand", productType: "SUPPLEMENT",
      contentSeo: { ProductDescription: "Long description" } };
    const { rerender } = render(
      <QueryClientProvider client={qc}><ProductPdp product={product as never} productId="P1" readOnly familyEnabled={false} defaultExpanded /></QueryClientProvider>,
    );
    const hasTopHighlights = !!screen.queryByText("Top Highlights");
    rerender(<QueryClientProvider client={qc}><ProductPdp product={product as never} productId="P1" readOnly familyEnabled={false} defaultExpanded seoOnly /></QueryClientProvider>);
    expect(hasTopHighlights).toBe(true);
    expect(screen.queryByText("Top Highlights")).toBeNull();
    for (const t of ["Key Features", "Concise Bullet Points", "Item Details"]) expect(screen.queryByText(t)).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "My title" })).toBeTruthy();
    expect(screen.getByText("HL")).toBeTruthy();
  });
});

describe("ProductPdp annotate", () => {
  it("wraps each SEO field with its revision field key (bullets keep their slot number)", () => {
    const qc = new QueryClient();
    const seen: string[] = [];
    const product = { ...base, itemHighlight: "HL", contentSeo: { DetailedBulletPoint1: "one", DetailedBulletPoint3: "three", ProductDescription: "desc" } };
    render(
      <QueryClientProvider client={qc}>
        <ProductPdp product={product as never} productId="P1" readOnly familyEnabled={false} defaultExpanded seoOnly
          annotate={(key, node) => { seen.push(key); return <div data-key={key}>{node}</div>; }} />
      </QueryClientProvider>,
    );
    expect(seen).toEqual(expect.arrayContaining(["Title", "ItemHighlight", "DetailedBulletPoint_1", "DetailedBulletPoint_3", "ProductDescription"]));
    expect(seen).not.toContain("DetailedBulletPoint_2");
    expect(document.querySelector('[data-key="DetailedBulletPoint_3"]')?.textContent).toBe("three");
  });
});
