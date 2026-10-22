import { render, screen } from "@testing-library/react";
import { AplusAsinRow, ParentageBadge } from "./aplus-asin-row";

describe("ParentageBadge", () => {
  it("uses the Parent chip width so Child badges align in a column", () => {
    const { rerender } = render(<ParentageBadge value="Parent" />);
    expect(screen.getByText("Parent")).toHaveClass("w-[43px]");
    rerender(<ParentageBadge value="Child" />);
    expect(screen.getByText("Child")).toHaveClass("w-[43px]");
  });
});

describe("AplusAsinRow", () => {
  it("renders parentage, Hub PDP ASIN, Amazon icon, then summarized title", () => {
    render(
      <AplusAsinRow
        product={{
          id: "p1",
          asin: "B08DL9YZPS",
          parentageLevel: "Parent",
          summarizedTitle: "T-Shirt | Parent",
        }}
      />,
    );

    expect(screen.getByText("Parent")).toBeInTheDocument();
    const asin = screen.getByRole("link", { name: "B08DL9YZPS" });
    expect(asin).toHaveAttribute("href", "/products/p1?from=aplus");
    expect(asin).toHaveClass("text-sm");
    expect(screen.getByRole("link", { name: "Open Amazon product page" })).toHaveAttribute(
      "href",
      "https://www.amazon.com/dp/B08DL9YZPS",
    );
    expect(screen.getByText("T-Shirt | Parent")).toBeInTheDocument();
  });

  it("renders child ASINs smaller than parent ASINs", () => {
    render(
      <AplusAsinRow
        product={{
          id: "c1",
          asin: "B0DKSR7ZSK",
          parentageLevel: "Child",
          summarizedTitle: "T-Shirt | Large",
        }}
      />,
    );
    expect(screen.getByRole("link", { name: "B0DKSR7ZSK" })).toHaveClass("text-[11px]");
    expect(screen.getByRole("link", { name: "B0DKSR7ZSK" })).not.toHaveClass("text-sm");
  });

  it("emphasizes the featured ASIN on an ASIN-scope card even when it is a Child", () => {
    render(
      <AplusAsinRow
        emphasized
        product={{
          id: "c1",
          asin: "B06XP296LV",
          parentageLevel: "Child",
          summarizedTitle: "Hot Sauce",
        }}
      />,
    );
    expect(screen.getByRole("link", { name: "B06XP296LV" })).toHaveClass("text-sm");
  });

  it("keeps supporting Parent ASINs small on an ASIN-scope card", () => {
    render(
      <AplusAsinRow
        emphasized={false}
        showParentage={false}
        product={{
          id: "p1",
          asin: "B0B7KK9ZWW",
          parentageLevel: "Parent",
          summarizedTitle: "Hot Sauce | Parent",
        }}
      />,
    );
    expect(screen.getByRole("link", { name: "B0B7KK9ZWW" })).toHaveClass("text-[11px]");
  });

  it("can hide the parentage badge for a data-only column", () => {
    render(
      <AplusAsinRow
        showParentage={false}
        product={{
          id: "p1",
          asin: "B08DL9YZPS",
          parentageLevel: "Parent",
          summarizedTitle: "T-Shirt | Parent",
        }}
      />,
    );
    expect(screen.queryByText("Parent")).toBeNull();
    expect(screen.getByRole("link", { name: "B08DL9YZPS" })).toBeInTheDocument();
  });

  it("skips the hub product link when linkToProduct is false", () => {
    render(
      <AplusAsinRow
        linkToProduct={false}
        product={{
          id: "p1",
          asin: "B08DL9YZPS",
          parentageLevel: "Parent",
          summarizedTitle: "T-Shirt | Parent",
        }}
      />,
    );
    expect(screen.queryByRole("link", { name: "B08DL9YZPS" })).toBeNull();
    expect(screen.getByText("B08DL9YZPS")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Amazon product page" })).toBeInTheDocument();
  });
});
