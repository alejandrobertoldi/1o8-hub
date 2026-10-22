import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NotConnectedCard } from "./page";

describe("NotConnectedCard", () => {
  it("shows the brand label and a not-connected badge", () => {
    render(
      <NotConnectedCard
        client={{
          clientIdCode: "PUR_WM_US",
          clientName: "Purina Walmart",
          brandName: "Purina",
          tier: "T2",
          marketplace: "Walmart",
          accountIds: [],
        } as never}
      />,
    );
    expect(screen.getByTestId("not-connected-card")).toBeInTheDocument();
    expect(screen.getByText("Purina")).toBeInTheDocument();
    expect(screen.getByText(/Not connected/i)).toBeInTheDocument();
  });
});
