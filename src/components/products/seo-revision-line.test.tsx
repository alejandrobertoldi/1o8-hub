import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SeoRevisionLine } from "./seo-revision-line";

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });

describe("SeoRevisionLine", () => {
  it("renders the pushed revision with approval source", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ push: { projectName: "TRS_v01", projectId: "P1", revisionId: "R3", revisionNumber: 3, approvedAt: "2026-10-04T10:00:00Z", finalVia: "client", pushedAt: "2026-10-05T09:00:00Z", pushedBy: "abid@x.com", approvedByName: "Maria Lopez", overrideReason: null } }) });
    render(<SeoRevisionLine productId="M1" />);
    await waitFor(() => expect(screen.getByText(/SEO: TRS_v01 r3 · approved 2026-10-04 by Maria Lopez \(client\) · pushed 2026-10-05 by abid@x.com/)).toBeTruthy());
    expect(screen.getByRole("link").getAttribute("href")).toBe("/seo/P1/review/R3");
  });
  it("falls back without a name when approvedByName is null", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ push: { projectName: "TRS_v01", projectId: "P1", revisionId: "R3", revisionNumber: 3, approvedAt: "2026-10-04T10:00:00Z", finalVia: "am", pushedAt: "2026-10-05T09:00:00Z", pushedBy: "abid@x.com", approvedByName: null, overrideReason: null } }) });
    render(<SeoRevisionLine productId="M1" />);
    await waitFor(() => expect(screen.getByText(/approved 2026-10-04 \(AM final\) · pushed/)).toBeTruthy());
    expect(screen.queryByText(/approved 2026-10-04 by/)).toBeNull();
  });
  it("override push says so; no push renders nothing", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ push: { projectName: "TRS_v01", projectId: "P1", revisionId: null, revisionNumber: null, approvedAt: null, finalVia: null, pushedAt: "2026-10-05T09:00:00Z", pushedBy: "boss@x.com", overrideReason: "urgent" } }) });
    const { container, rerender } = render(<SeoRevisionLine productId="M1" />);
    await waitFor(() => expect(screen.getByText(/pushed without review/)).toBeTruthy());
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ push: null }) });
    rerender(<SeoRevisionLine productId="M2" />);
    await waitFor(() => expect(container.textContent).toBe(""));
  });
});
