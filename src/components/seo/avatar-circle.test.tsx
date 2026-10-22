import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AvatarCircle } from "./avatar-circle";

const URL_OK = "https://lh3.googleusercontent.com/a/xyz=s96-c";

describe("AvatarCircle", () => {
  it("renders the image for a valid http(s) URL", () => {
    render(<AvatarCircle name="Jane Doe" image={URL_OK} />);
    expect(screen.getByRole("img")).toHaveAttribute("src", URL_OK);
  });

  it("renders initials, not a broken <img>, when image is not a URL", () => {
    // The exact corrupt users.image value seen in prod (2026-09-28).
    render(<AvatarCircle name="Manu Lancharro" image="2026-07-23 23:33:19.953594+00" />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("ML")).toBeInTheDocument();
  });

  it("falls back to initials when the image fails to load", () => {
    render(<AvatarCircle name="Sohail Asghar" image={URL_OK} />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("SA")).toBeInTheDocument();
  });

  it("renders initials when image is null", () => {
    render(<AvatarCircle name="Jane Doe" image={null} />);
    expect(screen.getByText("JD")).toBeInTheDocument();
  });
});
