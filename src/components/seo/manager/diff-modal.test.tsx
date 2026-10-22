import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DiffModal } from "./diff-modal";
import type { SeoVersion } from "@/lib/seo-types";

function makeVersion(num: string, fields: Record<string, string>): SeoVersion {
  return {
    seoVersionNumber: num,
    seoCategory: "Standard",
    seoStatus: "Current",
    seoDocUrl: null,
    fields,
    populatedCount: Object.keys(fields).length,
  };
}

describe("DiffModal", () => {
  it("shows 'No differences found' when versions are identical", () => {
    const v1 = makeVersion("1", { Title: "Same" });
    const v2 = makeVersion("2", { Title: "Same" });
    render(<DiffModal v1={v1} v2={v2} onClose={vi.fn()} />);
    expect(screen.getByText("No differences found between these versions.")).toBeInTheDocument();
  });

  it("highlights added and removed text when versions differ", () => {
    const v1 = makeVersion("1", { Title: "Old Title Here" });
    const v2 = makeVersion("2", { Title: "New Title Here" });
    render(<DiffModal v1={v1} v2={v2} onClose={vi.fn()} />);
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText(/1 field changed/)).toBeInTheDocument();
  });

  it("shows version numbers in header", () => {
    const v1 = makeVersion("3", { Title: "A" });
    const v2 = makeVersion("4", { Title: "B" });
    render(<DiffModal v1={v1} v2={v2} onClose={vi.fn()} />);
    expect(screen.getByText(/v3/)).toBeInTheDocument();
    expect(screen.getByText(/v4/)).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    const v1 = makeVersion("1", { Title: "A" });
    const v2 = makeVersion("2", { Title: "B" });
    render(<DiffModal v1={v1} v2={v2} onClose={onClose} />);
    fireEvent.click(screen.getByText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when clicking the backdrop", () => {
    const onClose = vi.fn();
    const v1 = makeVersion("1", { Title: "A" });
    const v2 = makeVersion("2", { Title: "B" });
    const { container } = render(<DiffModal v1={v1} v2={v2} onClose={onClose} />);
    // Click the backdrop (outermost div)
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when clicking inside the dialog", () => {
    const onClose = vi.fn();
    const v1 = makeVersion("1", { Title: "A" });
    const v2 = makeVersion("2", { Title: "B" });
    render(<DiffModal v1={v1} v2={v2} onClose={onClose} />);
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows count of unchanged fields", () => {
    const v1 = makeVersion("1", { Title: "A", Bullet1: "Same" });
    const v2 = makeVersion("2", { Title: "B", Bullet1: "Same" });
    render(<DiffModal v1={v1} v2={v2} onClose={vi.fn()} />);
    expect(screen.getByText(/1 unchanged/)).toBeInTheDocument();
  });
});
