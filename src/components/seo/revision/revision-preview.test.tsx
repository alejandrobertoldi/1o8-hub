import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/components/products/product-pdp", () => ({
  ProductPdp: ({ product, familyEnabled, defaultExpanded, storeName, variationAsins, onSelectAsin, annotate }: { product: { itemName: string }; familyEnabled?: boolean; defaultExpanded?: boolean; storeName?: string | null; variationAsins?: string[]; onSelectAsin?: (a: string) => void; annotate?: (k: string, n: React.ReactNode) => React.ReactNode }) => (
    <>
      {annotate?.("Title", <span>title node</span>)}
      <div data-testid="pdp" data-family={String(familyEnabled)} data-expanded={String(defaultExpanded)} data-store={String(storeName)} data-asins={(variationAsins ?? []).join(",")}>{product.itemName}</div>
      <button type="button" onClick={() => onSelectAsin?.("B2")}>pick B2</button>
    </>
  ),
}));
import { RevisionPreview } from "./revision-preview";

const products = [{ id: "M1", asin: "A1", itemName: "Old title", itemHighlight: null, genericKeywords: "old kw", contentSeo: {} }] as never;
const content = { A1: { Title: "New title", BackendSearchTerms: "new kw" } };

describe("RevisionPreview", () => {
  it("shows the proposed text by default and the current text when toggled", () => {
    render(<RevisionPreview products={products} content={content} familyEnabled={false} selectedField={null} onSelectField={() => {}} commentCounts={{}} tone="hub" />);
    expect(screen.getByTestId("pdp").textContent).toBe("New title");
    expect(screen.getByTestId("pdp").dataset.family).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Current" }));
    expect(screen.getByTestId("pdp").textContent).toBe("Old title");
  });
  it("opens the Product Detail Page expanded by default", () => {
    render(<RevisionPreview products={products} content={content} familyEnabled selectedField={null} onSelectField={() => {}} commentCounts={{}} tone="hub" />);
    expect(screen.getByTestId("pdp").dataset.expanded).toBe("true");
  });
  it("passes the client name through as the store name", () => {
    render(<RevisionPreview products={products} content={content} familyEnabled selectedField={null} onSelectField={() => {}} commentCounts={{}} tone="hub" storeName="ReadyRESCUE" />);
    expect(screen.getByTestId("pdp").dataset.store).toBe("ReadyRESCUE");
  });
  it("PDP variation buttons are limited to the revision's ASINs and switch the preview in place", () => {
    const both = [
      { id: "M1", asin: "A1", itemName: "Old title", itemHighlight: null, genericKeywords: null, contentSeo: {} },
      { id: "M2", asin: "B2", itemName: "Old B", itemHighlight: null, genericKeywords: null, contentSeo: {} },
    ] as never;
    render(<RevisionPreview products={both} content={{ A1: { Title: "New A" }, B2: { Title: "New B" } }} familyEnabled selectedField={null} onSelectField={() => {}} commentCounts={{}} tone="hub" />);
    expect(screen.getByTestId("pdp").dataset.asins).toBe("A1,B2");
    fireEvent.click(screen.getByRole("button", { name: "pick B2" }));
    expect(screen.getByTestId("pdp").textContent).toContain("New B");
  });
  it("hidden backend terms show with a char count and an open-comment badge", () => {
    render(<RevisionPreview products={products} content={content} familyEnabled selectedField={null} onSelectField={() => {}} commentCounts={{ "A1::BackendSearchTerms": 2 }} tone="hub" />);
    expect(screen.getByText("new kw")).toBeTruthy();
    expect(screen.getByText(/6 chars/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Comment on Backend search terms/ }).textContent).toContain("2");
  });
  it("portal: backend search terms are hidden from the client", () => {
    render(<RevisionPreview products={products} content={content} familyEnabled={false} selectedField={null} onSelectField={() => {}} commentCounts={{}} tone="portal" />);
    expect(screen.queryByText("new kw")).toBeNull();
  });
  it("comments in place: the PDP's annotate wraps fields in the revision; the open field shows its thread", () => {
    const { rerender } = render(<RevisionPreview products={products} content={content} familyEnabled selectedField={null} onSelectField={() => {}} commentCounts={{}} tone="hub"
      renderThread={(asin, key) => <p>THREAD {asin} {key}</p>} />);
    expect(screen.getByRole("button", { name: "Comment on Title" })).toBeTruthy();
    expect(screen.queryByText(/THREAD/)).toBeNull();
    rerender(<RevisionPreview products={products} content={content} familyEnabled selectedField={{ asin: "A1", key: "Title" }} onSelectField={() => {}} commentCounts={{}} tone="hub"
      renderThread={(asin, key) => <p>THREAD {asin} {key}</p>} />);
    expect(screen.getByText("THREAD A1 Title")).toBeTruthy();
  });
  it("selecting a field reports asin + key", () => {
    const onSelect = vi.fn();
    render(<RevisionPreview products={products} content={content} familyEnabled selectedField={null} onSelectField={onSelect} commentCounts={{}} tone="hub" />);
    fireEvent.click(screen.getByRole("button", { name: /Backend search terms/ }));
    expect(onSelect).toHaveBeenCalledWith("A1", "BackendSearchTerms");
  });
  it("follows content when the selected ASIN disappears", () => {
    const both = [
      { id: "M1", asin: "A1", itemName: "Old title", itemHighlight: null, genericKeywords: null, contentSeo: {} },
      { id: "M2", asin: "B2", itemName: "Old B", itemHighlight: null, genericKeywords: null, contentSeo: {} },
    ] as never;
    const props = { products: both, familyEnabled: false, selectedField: null, onSelectField: () => {}, commentCounts: {}, tone: "hub" as const };
    const { rerender } = render(<RevisionPreview {...props} content={{ A1: { Title: "A title" } }} />);
    expect(screen.getByTestId("pdp").textContent).toBe("A title");
    rerender(<RevisionPreview {...props} content={{ B2: { Title: "B title" } }} />);
    expect(screen.getByTestId("pdp").textContent).toBe("B title");
  });
});
