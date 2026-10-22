import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ExportBadge, ExportHistory } from "./export-history";

describe("ExportBadge", () => {
  it("shows 'Never exported' when exportInfo is null", () => {
    render(<ExportBadge exportInfo={null} />);
    expect(screen.getByText("Never exported")).toBeInTheDocument();
  });

  it("shows 'Never exported' when export_count is 0", () => {
    render(
      <ExportBadge
        exportInfo={{ export_count: 0, last_exported_at: "", last_url: null }}
      />
    );
    expect(screen.getByText("Never exported")).toBeInTheDocument();
  });

  it("shows exported badge with relative date", () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    render(
      <ExportBadge
        exportInfo={{ export_count: 3, last_exported_at: yesterday, last_url: null }}
      />
    );
    expect(screen.getByLabelText(/Last exported yesterday/)).toBeInTheDocument();
  });
});

describe("ExportHistory", () => {
  it("shows 'Never exported' when no export info", () => {
    render(<ExportHistory exportInfo={null} />);
    expect(screen.getByText("Never exported")).toBeInTheDocument();
  });

  it("shows export count and link when exports exist", () => {
    const now = new Date().toISOString();
    render(
      <ExportHistory
        exportInfo={{
          export_count: 5,
          last_exported_at: now,
          last_url: "https://drive.google.com/file/d/123/view",
        }}
      />
    );
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText(/exports/)).toBeInTheDocument();
    expect(screen.getByText(/Open latest export/)).toHaveAttribute(
      "href",
      "https://drive.google.com/file/d/123/view"
    );
  });

  it("hides link when last_url is null", () => {
    const now = new Date().toISOString();
    render(
      <ExportHistory
        exportInfo={{ export_count: 1, last_exported_at: now, last_url: null }}
      />
    );
    expect(screen.queryByText(/Open latest export/)).not.toBeInTheDocument();
  });
});
