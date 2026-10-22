import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { ExportPdfButton } from "./export-pdf-button";

const fetchMock = vi.fn();
const openMock = vi.fn();
let tab: { opener: unknown; location: { href: string }; close: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.clearAllMocks();
  tab = { opener: {}, location: { href: "" }, close: vi.fn() };
  openMock.mockReturnValue(tab);
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("open", openMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

const setup = (stage: "drafting" | "in_review" | "approved" | "sent") => {
  const onExported = vi.fn();
  const onError = vi.fn();
  const r = render(<ExportPdfButton caseStudyId="cs1" stage={stage} onExported={onExported} onError={onError} />);
  return { ...r, onExported, onError, button: r.getByRole("button", { name: /export pdf/i }) };
};

describe("ExportPdfButton", () => {
  it("is disabled before Approved and does nothing", () => {
    for (const stage of ["drafting", "in_review"] as const) {
      const { button, unmount } = setup(stage);
      expect(button).toBeDisabled();
      fireEvent.click(button);
      unmount();
    }
    expect(openMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Sent: opens the autoprint print page in a new tab without PATCHing", () => {
    const { button, onExported } = setup("sent");
    fireEvent.click(button);
    expect(openMock).toHaveBeenCalledWith("/case-studies/cs1/print?autoprint=1", "_blank", "noopener");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onExported).not.toHaveBeenCalled();
  });

  it("Approved: PATCHes stage=sent, then points the new tab at the print page and reloads", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    const { button, onExported, onError } = setup("approved");
    fireEvent.click(button);
    // Tab is opened synchronously in the click so popup blockers allow it.
    expect(openMock).toHaveBeenCalledWith("", "_blank");
    await waitFor(() => expect(onExported).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/case-studies/cs1", expect.objectContaining({
      method: "PATCH", body: JSON.stringify({ stage: "sent" }),
    }));
    expect(tab.location.href).toBe("/case-studies/cs1/print?autoprint=1");
    expect(tab.opener).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it("Approved: a failed PATCH surfaces the error, closes the tab and does not print", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "Cannot move from approved to sent" }) });
    const { button, onExported, onError } = setup("approved");
    fireEvent.click(button);
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Cannot move from approved to sent"));
    expect(tab.close).toHaveBeenCalled();
    expect(tab.location.href).toBe("");
    expect(onExported).not.toHaveBeenCalled();
  });

  it("Approved: a network failure surfaces an error and closes the tab", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const { button, onError } = setup("approved");
    fireEvent.click(button);
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(tab.close).toHaveBeenCalled();
  });
});
