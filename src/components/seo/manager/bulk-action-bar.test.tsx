import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BulkActionBar } from "./bulk-action-bar";

const team = [
  { id: "u1", name: "Alice", email: "alice@test.com" },
  { id: "u2", name: "Bob", email: "bob@test.com" },
];

const noop = async () => {};

describe("BulkActionBar", () => {
  it("renders nothing when selectedCount is 0", () => {
    const { container } = render(
      <BulkActionBar
        selectedCount={0}
        onApprove={noop}
        onExport={noop}
        onReassign={noop}
        onClear={vi.fn()}
        team={team}
      />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders toolbar with count and action buttons when selected > 0", () => {
    render(
      <BulkActionBar
        selectedCount={3}
        onApprove={noop}
        onExport={noop}
        onReassign={noop}
        onClear={vi.fn()}
        team={team}
      />
    );
    expect(screen.getByText("3 selected")).toBeInTheDocument();
    expect(screen.getByText("Approve")).toBeInTheDocument();
    expect(screen.getByText("Export All")).toBeInTheDocument();
    expect(screen.getByText("Reassign")).toBeInTheDocument();
  });

  it("has proper accessibility attributes", () => {
    render(
      <BulkActionBar
        selectedCount={2}
        onApprove={noop}
        onExport={noop}
        onReassign={noop}
        onClear={vi.fn()}
        team={team}
      />
    );
    expect(
      screen.getByRole("toolbar", { name: /2 selected projects/ })
    ).toBeInTheDocument();
  });
});
