import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Report } from "./Report";
import type { Report as ReportData } from "./types";

function makeReport(): ReportData {
  return {
    meta: {
      client: "ReadyRESCUE",
      month: "July 2026",
      period: "01 Jul – 31 Jul",
      lead: "Alex Moreno",
      issued: "Aug 04, 2026",
      reportId: "2026|07|REA",
    },
    sections: ["cover", "highlights"],
    highlights: [{ title: "Prime Day", body: "Conversion held.", meta: "Sessions −12%" }],
    sectionComments: {
      highlights: {
        text: "We paused branded search for two days.",
        authorName: "Sara Khan",
        role: "pm",
        updatedAt: "2026-09-01T10:00:00.000Z",
      },
    },
  };
}

describe("Report section comments", () => {
  it("places a client note after a rendered section, not on the cover", () => {
    const { container } = render(<Report data={makeReport()} showTopBar={false} showToc={false} />);
    expect(screen.getByText("We paused branded search for two days.")).toBeInTheDocument();
    const notes = container.querySelectorAll(".section-note");
    expect(notes).toHaveLength(1);
    const cover = container.querySelector("#cover, .cover, .cover-title");
    const highlights = container.querySelector("#highlights");
    expect(highlights).not.toBeNull();
    expect(highlights!.compareDocumentPosition(notes[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    if (cover) {
      expect(cover.compareDocumentPosition(notes[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("does not render an appendix even when stored JSON still lists one", () => {
    const data = makeReport();
    data.sections = ["cover", "highlights", "appendix"];
    data.appendix = {
      methodology: "Hidden",
      sources: [],
      glossary: [],
      changelog: [],
      contactLine: "do-not-show@example.com",
    };
    const { container } = render(<Report data={data} showTopBar={false} showToc={false} />);
    expect(container.querySelector("#appendix")).toBeNull();
    expect(screen.queryByText("Appendix")).toBeNull();
    expect(screen.queryByText("do-not-show@example.com")).toBeNull();
  });

  it("shows an empty editor when the reviewer can write", () => {
    const data = makeReport();
    delete data.sectionComments;
    render(
      <Report data={data} showTopBar={false} showToc={false} commentsEditable />,
    );
    expect(screen.getByRole("textbox", { name: "Client note for highlights" })).toBeInTheDocument();
  });
});
