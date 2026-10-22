import { render, screen } from "@testing-library/react";
import { AplusAsinLinks } from "./aplus-asin-links";

describe("AplusAsinLinks", () => {
  it("links the ASIN to product detail and the icon to Amazon PDP", () => {
    render(<AplusAsinLinks asin="B0DJLWKT4J" productId="prod-1" />);

    expect(screen.getByRole("link", { name: "B0DJLWKT4J" })).toHaveAttribute(
      "href",
      "/products/prod-1?from=aplus",
    );

    const amazon = screen.getByRole("link", { name: "Open Amazon product page" });
    expect(amazon).toHaveAttribute("href", "https://www.amazon.com/dp/B0DJLWKT4J");
    expect(amazon).toHaveAttribute("target", "_blank");
    expect(amazon).toHaveAttribute("rel", "noopener noreferrer");
    expect(amazon.querySelector("img")).toHaveAttribute("src", "/amazon-smile-black.png");
  });

  it("renders the ASIN as text when there is no product id", () => {
    render(<AplusAsinLinks asin="B0DJLWKT4J" productId={null} />);

    expect(screen.queryByRole("link", { name: "B0DJLWKT4J" })).toBeNull();
    expect(screen.getByText("B0DJLWKT4J")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Amazon product page" })).toHaveAttribute(
      "href",
      "https://www.amazon.com/dp/B0DJLWKT4J",
    );
  });

  it("links the ASIN back to the A+ editor when opened from a set", () => {
    render(
      <AplusAsinLinks
        asin="B0GWZGW426"
        productId="prod-1"
        from="aplus-editor"
        marketplace="US"
        setIdentifier="B0GWZGW426"
      />,
    );
    expect(screen.getByRole("link", { name: "B0GWZGW426" })).toHaveAttribute(
      "href",
      "/products/prod-1?from=aplus-editor&marketplace=US&set=B0GWZGW426",
    );
  });

  it("hides the Amazon icon when the ASIN is empty", () => {
    render(<AplusAsinLinks asin="" productId="prod-1" />);
    expect(screen.queryByRole("link", { name: "Open Amazon product page" })).toBeNull();
  });
});
