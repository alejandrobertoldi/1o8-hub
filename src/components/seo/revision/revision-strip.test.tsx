import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RevisionStrip } from "./revision-strip";

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
const reply = (body: unknown) => fetchMock.mockResolvedValue({ ok: true, json: async () => body });

describe("RevisionStrip", () => {
  it("open revision → stage + waiting-for text, link to review, onOpenChange(true)", async () => {
    reply({ revisions: [{ id: "R2", revisionNumber: 2, status: "pm_review", submittedAt: "2026-10-02T00:00:00Z", isCurrent: false }], open: { id: "R2", revisionNumber: 2, status: "pm_review" }, current: null, approvers: { pm: { name: "Pat Smith", email: "pat@x.com" }, am: null }, canSubmit: false });
    const onOpen = vi.fn();
    render(<RevisionStrip projectId="P1" refreshKey={0} onOpenChange={onOpen} onCurrentChange={() => {}} />);
    await waitFor(() => expect(screen.getByText(/r2 · PM review · waiting for Pat Smith/)).toBeTruthy());
    expect(screen.getByRole("link", { name: /Open review/ }).getAttribute("href")).toBe("/seo/P1/review/R2");
    expect(onOpen).toHaveBeenLastCalledWith(true);
  });
  it("embedded (onOpenReview): Open review and History switch in place — no links; reports the latest revision", async () => {
    reply({ revisions: [{ id: "R2", revisionNumber: 2, status: "pm_review", isCurrent: false }, { id: "R1", revisionNumber: 1, status: "changes_requested", isCurrent: false }], open: { id: "R2", revisionNumber: 2, status: "pm_review" }, current: null, approvers: { pm: { name: "Pat Smith", email: "pat@x.com" }, am: null }, canSubmit: false });
    const onOpenReview = vi.fn(); const onLatest = vi.fn();
    render(<RevisionStrip projectId="P1" refreshKey={0} onOpenChange={() => {}} onCurrentChange={() => {}} onOpenReview={onOpenReview} onLatestChange={onLatest} />);
    await waitFor(() => expect(onLatest).toHaveBeenLastCalledWith("R2"));
    expect(screen.queryByRole("link")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Open review/ }));
    expect(onOpenReview).toHaveBeenLastCalledWith("R2");
    fireEvent.click(screen.getByRole("button", { name: "History" }));
    fireEvent.click(screen.getByRole("button", { name: /r1 · /i }));
    expect(onOpenReview).toHaveBeenLastCalledWith("R1");
  });
  it("closed duplicate (server displayId = approved r1) → reports r1 and fetches no comments to address", async () => {
    reply({ revisions: [{ id: "R2", revisionNumber: 2, status: "changes_requested", isCurrent: false }, { id: "R1", revisionNumber: 1, status: "approved", isCurrent: true }], open: null, current: { id: "R1", revisionNumber: 1, status: "approved", isCurrent: true }, approvers: { pm: null, am: null }, canSubmit: false, displayId: "R1" });
    const onLatest = vi.fn();
    render(<RevisionStrip projectId="P1" refreshKey={0} onOpenChange={() => {}} onCurrentChange={() => {}} onOpenReview={() => {}} onLatestChange={onLatest} compact />);
    await waitFor(() => expect(onLatest).toHaveBeenLastCalledWith("R1"));
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/api/seo/revisions/R2"))).toBe(false);
  });
  it("reports whether content was ever pushed (S8 tick after reload)", async () => {
    reply({ revisions: [{ id: "R1", revisionNumber: 1, status: "approved", isCurrent: true }], open: null, current: { id: "R1", revisionNumber: 1, status: "approved", isCurrent: true }, approvers: { pm: null, am: null }, canSubmit: false, pushed: true });
    const onPushed = vi.fn();
    render(<RevisionStrip projectId="P1" refreshKey={0} onOpenChange={() => {}} onCurrentChange={() => {}} onPushedChange={onPushed} compact />);
    await waitFor(() => expect(onPushed).toHaveBeenLastCalledWith(true));
  });
  it("compact: nothing visible when there's nothing to act on — but it still locks S6 and reports the latest revision", async () => {
    reply({ revisions: [{ id: "R2", revisionNumber: 2, status: "pm_review", isCurrent: false }], open: { id: "R2", revisionNumber: 2, status: "pm_review" }, current: null, approvers: { pm: { name: "Pat Smith", email: "pat@x.com" }, am: null }, canSubmit: false });
    const onOpen = vi.fn(); const onLatest = vi.fn();
    const { container } = render(<RevisionStrip projectId="P1" refreshKey={0} onOpenChange={onOpen} onCurrentChange={() => {}} onOpenReview={() => {}} onLatestChange={onLatest} compact />);
    await waitFor(() => expect(onLatest).toHaveBeenLastCalledWith("R2"));
    expect(onOpen).toHaveBeenLastCalledWith(true);
    expect(container.textContent).toBe("");
  });
  it("compact: still shows a missing-approver warning", async () => {
    reply({ revisions: [{ id: "R2", revisionNumber: 2, status: "pm_review", isCurrent: false }], open: { id: "R2", revisionNumber: 2, status: "pm_review" }, current: null, approvers: { pm: { name: "Pat Smyth", email: null }, am: null }, canSubmit: false });
    render(<RevisionStrip projectId="P1" refreshKey={0} onOpenChange={() => {}} onCurrentChange={() => {}} compact />);
    await waitFor(() => expect(screen.getByText(/No user matched "Pat Smyth"/)).toBeTruthy());
    expect(screen.queryByText(/Open review/)).toBeNull();
  });
  it("unmatched PM → says so", async () => {
    reply({ revisions: [{ id: "R2", revisionNumber: 2, status: "pm_review", isCurrent: false }], open: { id: "R2", revisionNumber: 2, status: "pm_review" }, current: null, approvers: { pm: { name: "Pat Smyth", email: null }, am: null }, canSubmit: false });
    render(<RevisionStrip projectId="P1" refreshKey={0} onOpenChange={() => {}} onCurrentChange={() => {}} />);
    await waitFor(() => expect(screen.getByText(/No user matched "Pat Smyth"/)).toBeTruthy());
  });
  it("changes requested → lists that revision's comments grouped by ASIN with resolve ticks", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ revisions: [{ id: "R2", revisionNumber: 2, status: "changes_requested", isCurrent: false }], open: null, current: null, approvers: { pm: null, am: null }, canSubmit: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ comments: [{ id: "C1", asin: "A1", fieldKey: "Title", authorName: "Ann", body: "Too long", resolvedAt: null }] }) });
    render(<RevisionStrip projectId="P1" refreshKey={0} onOpenChange={() => {}} onCurrentChange={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Comments to address \(1 open\)/)).toBeTruthy());
    expect(screen.getByRole("checkbox")).toBeTruthy();
  });
  it("zero revisions + canSubmit → Submit for review button that POSTs, then refetches", async () => {
    const body = { revisions: [], open: null, current: null, approvers: { pm: null, am: null }, canSubmit: true };
    fetchMock.mockResolvedValue({ ok: true, json: async () => body });
    render(<RevisionStrip projectId="P1" refreshKey={0} onOpenChange={() => {}} onCurrentChange={() => {}} />);
    const btn = await screen.findByRole("button", { name: /Submit for review/ });
    fireEvent.click(btn);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/seo/projects/P1/revisions", expect.objectContaining({ method: "POST" })));
    await waitFor(() => expect(fetchMock.mock.calls.filter((c) => c[0] === "/api/seo/projects/P1/revisions" && !c[1]).length).toBeGreaterThan(1));
  });
  it("submit failure shows the server error text", async () => {
    const body = { revisions: [], open: null, current: null, approvers: { pm: null, am: null }, canSubmit: true };
    fetchMock.mockImplementation(async (_u: string, init?: { method?: string }) => init?.method === "POST"
      ? { ok: false, status: 400, json: async () => ({ error: "Save & lock S6 before submitting for review" }) }
      : { ok: true, json: async () => body });
    render(<RevisionStrip projectId="P1" refreshKey={0} onOpenChange={() => {}} onCurrentChange={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Submit for review/ }));
    await waitFor(() => expect(screen.getByText(/Save & lock S6 before submitting/)).toBeTruthy());
  });
  it("no revisions → nothing open, onOpenChange(false)", async () => {
    reply({ revisions: [], open: null, current: null, approvers: { pm: null, am: null }, canSubmit: true });
    const onOpen = vi.fn();
    render(<RevisionStrip projectId="P1" refreshKey={0} onOpenChange={onOpen} onCurrentChange={() => {}} />);
    await waitFor(() => expect(onOpen).toHaveBeenLastCalledWith(false));
  });
  it("403 → fails closed: visible error, no throw, onOpenChange(true)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "Forbidden" }) });
    const onOpen = vi.fn(); const onCur = vi.fn();
    render(<RevisionStrip projectId="P1" refreshKey={0} onOpenChange={onOpen} onCurrentChange={onCur} />);
    await waitFor(() => expect(screen.getByText(/Could not load review status/)).toBeTruthy());
    expect(onOpen).toHaveBeenLastCalledWith(true);
    expect(onCur).toHaveBeenLastCalledWith(null);
  });
  it("network failure → fails closed: visible error, onOpenChange(true)", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const onOpen = vi.fn();
    render(<RevisionStrip projectId="P1" refreshKey={0} onOpenChange={onOpen} onCurrentChange={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Could not load review status/)).toBeTruthy());
    expect(onOpen).toHaveBeenLastCalledWith(true);
  });
  it("comments fetch failure → visible message", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ revisions: [{ id: "R2", revisionNumber: 2, status: "changes_requested", isCurrent: false }], open: null, current: null, approvers: { pm: null, am: null }, canSubmit: true }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "x" }) });
    render(<RevisionStrip projectId="P1" refreshKey={0} onOpenChange={() => {}} onCurrentChange={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Could not load comments/)).toBeTruthy());
  });
});
