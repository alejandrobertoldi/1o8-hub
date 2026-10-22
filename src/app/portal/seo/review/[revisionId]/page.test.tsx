import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("@/components/seo/revision/revision-preview", () => ({
  RevisionPreview: (p: { familyEnabled: boolean; tone: string }) => <div data-testid="preview" data-family={String(p.familyEnabled)} data-tone={p.tone} />,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import Page from "./page";

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
const detail = (status: string, decision: unknown = null) => ({ ok: true, json: async () => ({ revision: { id: "R2", revisionNumber: 2, status, projectName: "TRS_v01", submittedAt: "2026-10-02T00:00:00Z", content: { A1: { Title: "t" } }, comments: [], decision } }) });

describe("portal review page", () => {
  it("uses the portal tone without variation loading, and approves the whole revision", async () => {
    fetchMock.mockResolvedValueOnce(detail("client_review")).mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) }).mockResolvedValueOnce(detail("approved", { at: "2026-10-04T00:00:00Z", byName: "Maria", action: "approve" }));
    render(<Page params={Promise.resolve({ revisionId: "R2" })} />);
    await waitFor(() => expect(screen.getByTestId("preview").dataset.family).toBe("false"));
    expect(screen.getByTestId("preview").dataset.tone).toBe("portal");
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/portal/seo/revisions/R2", expect.objectContaining({ method: "POST" })));
    await waitFor(() => expect(screen.getByText(/Approved by Maria/)).toBeTruthy());
  });
  it("a failed decision shows the server error in the bar and keeps the note", async () => {
    fetchMock.mockResolvedValueOnce(detail("client_review")).mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: "Already decided — reload" }) });
    render(<Page params={Promise.resolve({ revisionId: "R2" })} />);
    await waitFor(() => expect(screen.getByTestId("preview")).toBeTruthy());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "please fix the title" } });
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    await waitFor(() => expect(screen.getByText("Already decided — reload")).toBeTruthy());
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("please fix the title");
  });
});
