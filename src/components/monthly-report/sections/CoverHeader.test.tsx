import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CoverHeader } from "./CoverHeader";
import type { Report } from "../types";

function makeReport(partial: Partial<Report["meta"]> = {}): Report {
  return {
    meta: {
      client: "Poochie Butter",
      month: "July 2026",
      period: "Jul 01 – Jul 31",
      lead: "Manu Lancharro",
      issued: "Aug 25, 2026",
      reportId: "July|26|POO_SC_US",
      clientIdCode: "POO_SC_US",
      ...partial,
    },
    sections: ["cover"],
  };
}

describe("CoverHeader", () => {
  it("places the client logo between the title and the month", () => {
    const { container } = render(<CoverHeader data={makeReport()} />);
    const title = container.querySelector(".cover-title");
    const clientLogo = container.querySelector(".cover-client-logo img");
    const month = container.querySelector(".cover-period .month");
    expect(title).not.toBeNull();
    expect(clientLogo).toHaveAttribute("src", "/client-logos/POO_SC_US.png");
    expect(month).toHaveTextContent("July");
    expect(title!.compareDocumentPosition(clientLogo!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(clientLogo!.compareDocumentPosition(month!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("labels the cover field Account Manager", () => {
    render(<CoverHeader data={makeReport({ lead: "Alex Moreno" })} />);
    expect(screen.getByText("Account Manager")).toBeInTheDocument();
    expect(screen.getByText("Alex Moreno")).toBeInTheDocument();
    expect(screen.queryByText("Lead")).toBeNull();
  });

  it("omits the client mark when no code or URL is present", () => {
    render(<CoverHeader data={makeReport({ clientIdCode: undefined, clientLogoUrl: null })} />);
    expect(screen.queryByAltText(/logo/i)).toBeNull();
    expect(screen.getByAltText("1o8 Agency")).toBeInTheDocument();
  });
});
