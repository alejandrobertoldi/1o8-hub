import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AmazonPdpLink } from "./amazon-pdp-link";

describe("AmazonPdpLink", () => {
  it("links the smile to AmazonPDPURL for the ASIN", () => {
    render(<AmazonPdpLink asin="B0D5FDQ1W6" />);
    const link = screen.getByRole("link", { name: "Open Amazon product page" });
    expect(link).toHaveAttribute("href", "https://www.amazon.com/dp/B0D5FDQ1W6");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.querySelector("img")).toHaveAttribute("src", "/amazon-smile-black.png");
  });

  it("uses the white smile on dark backgrounds", () => {
    render(<AmazonPdpLink asin="B0D5FDQ1W6" variant="on-dark" />);
    expect(screen.getByRole("link", { name: "Open Amazon product page" }).querySelector("img")).toHaveAttribute(
      "src",
      "/amazon-smile-white.png",
    );
  });

  it("uses an explicit AmazonPDPURL when provided", () => {
    render(<AmazonPdpLink asin="B0D5FDQ1W6" href="https://www.amazon.co.uk/dp/B0D5FDQ1W6" />);
    expect(screen.getByRole("link", { name: "Open Amazon product page" })).toHaveAttribute(
      "href",
      "https://www.amazon.co.uk/dp/B0D5FDQ1W6",
    );
  });

  it("hides when there is no ASIN", () => {
    render(<AmazonPdpLink asin="" />);
    expect(screen.queryByRole("link", { name: "Open Amazon product page" })).toBeNull();
  });
});
