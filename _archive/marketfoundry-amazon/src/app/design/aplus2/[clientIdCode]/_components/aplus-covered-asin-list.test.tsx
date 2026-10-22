import { render, screen, within } from "@testing-library/react";
import {
  AplusCoveredAsinList,
  peelParentProduct,
  splitIntoSections,
} from "./aplus-covered-asin-list";

describe("splitIntoSections", () => {
  it("keeps the first two sections equal and puts leftover ASINs in the third", () => {
    expect(splitIntoSections([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3)).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
      [9, 10],
    ]);
  });

  it("splits into two equal sets so a narrow card does not scroll", () => {
    expect(splitIntoSections([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 2)).toEqual([
      [1, 2, 3, 4, 5],
      [6, 7, 8, 9, 10],
    ]);
  });

  it("does not emit empty sections when there are fewer items than columns", () => {
    expect(splitIntoSections(["a", "b"], 3)).toEqual([["a"], ["b"]]);
  });
});

describe("peelParentProduct", () => {
  it("pulls the Parent out so remaining items can start on the next row", () => {
    expect(
      peelParentProduct([
        { id: "p", parentageLevel: "Parent" },
        { id: "c1", parentageLevel: "Child" },
        { id: "c2", parentageLevel: "Child" },
      ]),
    ).toEqual({
      parent: { id: "p", parentageLevel: "Parent" },
      rest: [
        { id: "c1", parentageLevel: "Child" },
        { id: "c2", parentageLevel: "Child" },
      ],
    });
  });

  it("leaves a child-only list unchanged", () => {
    const items = [{ id: "c1", parentageLevel: "Child" }];
    expect(peelParentProduct(items)).toEqual({ parent: undefined, rest: items });
  });
});

describe("AplusCoveredAsinList", () => {
  const products = [
    { id: "p1", asin: "B0PARENT", parentageLevel: "Parent", summarizedTitle: "Vintage Black Tee" },
    { id: "p2", asin: "B0CHILD1", parentageLevel: "Child", itemName: "Vintage Black Tee — Large" },
    { id: "p3", asin: "B0CHILD2", parentageLevel: "Child", summarizedTitle: "Medium" },
    { id: "p4", asin: "B0CHILD3", parentageLevel: "Child", summarizedTitle: "Small" },
    { id: "p5", asin: "B0CHILD4", parentageLevel: "Child", summarizedTitle: "XL" },
    { id: "p6", asin: "B0CHILD5", parentageLevel: "Child", summarizedTitle: "2XL" },
    { id: "p7", asin: "B0CHILD6", parentageLevel: "Child", summarizedTitle: "3XL" },
    { id: "p8", asin: "B0CHILD7", parentageLevel: "Child", summarizedTitle: "XS" },
    { id: "p9", asin: "B0CHILD8", parentageLevel: "Child", summarizedTitle: "S" },
    { id: "p10", asin: "B0CHILD9", parentageLevel: "Child", summarizedTitle: "M" },
  ];

  it("renders inline rows: parentage, orange ASIN, Amazon icon, title", () => {
    render(<AplusCoveredAsinList products={products} />);
    expect(screen.queryByRole("columnheader")).toBeNull();
    expect(screen.getByText("Parent")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "B0PARENT" })).toHaveAttribute(
      "href",
      "/products/p1?from=aplus",
    );
    expect(screen.getAllByRole("link", { name: "Open Amazon product page" })).toHaveLength(10);
    expect(screen.getByText("Vintage Black Tee")).toBeInTheDocument();
  });

  it("puts the parent above the child grid so col-2 starts beside the first child", () => {
    const { container } = render(<AplusCoveredAsinList products={products} />);
    const grid = container.querySelector(".grid") as HTMLElement;
    expect(grid).toBeTruthy();
    expect(within(grid).queryByRole("link", { name: "B0PARENT" })).toBeNull();

    const columns = grid.querySelectorAll(":scope > div");
    expect(columns).toHaveLength(2);
    expect(within(columns[0] as HTMLElement).getAllByRole("link", { name: /^B0/ })[0]).toHaveTextContent(
      "B0CHILD1",
    );
    expect(within(columns[1] as HTMLElement).getAllByRole("link", { name: /^B0/ })[0]).toHaveTextContent(
      "B0CHILD6",
    );
  });

  it("puts the parent above a 3-column child grid on the editor", () => {
    const { container } = render(
      <AplusCoveredAsinList products={products} sectionCount={3} />,
    );
    expect(screen.queryByRole("columnheader")).toBeNull();
    const grid = container.querySelector(".grid") as HTMLElement;
    expect(within(grid).queryByRole("link", { name: "B0PARENT" })).toBeNull();
    const columns = grid.querySelectorAll(":scope > div");
    expect(columns).toHaveLength(3);
    expect(within(columns[0] as HTMLElement).getAllByRole("link", { name: /^B0/ })[0]).toHaveTextContent(
      "B0CHILD1",
    );
    expect(within(columns[1] as HTMLElement).getAllByRole("link", { name: /^B0/ })[0]).toHaveTextContent(
      "B0CHILD4",
    );
    expect(within(columns[2] as HTMLElement).getAllByRole("link", { name: /^B0/ })[0]).toHaveTextContent(
      "B0CHILD7",
    );
  });
});
