import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TimeOffRequestsPage from "./page";

vi.mock("next-auth/react", () => ({ useSession: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useSession } from "next-auth/react";
import { toast } from "sonner";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TimeOffRequestsPage />
    </QueryClientProvider>
  );
}

const BASE_ROW = {
  id: "r1",
  userId: "u1",
  userName: "Jo",
  userEmail: "jo@marketfoundry.agency",
  startDate: "2026-08-01",
  endDate: "2026-08-02",
  reason: "Trip",
  workingDays: 2,
  decidedAt: null,
  decisionNote: null,
  createdAt: "2026-08-01T00:00:00.000Z",
};

function mockFetchSequence(selfBody: unknown, daysTakenBody: unknown) {
  global.fetch = vi.fn((url: unknown) => {
    const u = String(url);
    if (u.startsWith("/api/time-off/days-taken")) {
      return Promise.resolve({ ok: true, json: async () => daysTakenBody } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => selfBody } as Response);
  }) as unknown as typeof fetch;
}

describe("TimeOffRequestsPage — three-way role rendering", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows only own requests + day count for a plain editor", async () => {
    asMock(useSession).mockReturnValue({
      data: { user: { email: "jo@marketfoundry.agency", role: "editor" } },
    });
    mockFetchSequence(
      {
        requests: [{ ...BASE_ROW, status: "approved" }],
        countryCode: "PH",
        today: "2026-08-07",
      },
      { year: 2026, ownDays: 2 }
    );
    renderPage();
    await waitFor(() => expect(screen.getByText(/taken/i)).toBeInTheDocument());
    expect(screen.queryByText(/pending \(/i)).not.toBeInTheDocument();
  });

  it("shows the approver queue and breakdown for Jake", async () => {
    asMock(useSession).mockReturnValue({
      data: { user: { email: "jake@marketfoundry.agency", role: "admin" } },
    });
    mockFetchSequence(
      {
        requests: [{ ...BASE_ROW, status: "pending" }],
        countryCode: "US",
        today: "2026-08-07",
      },
      { year: 2026, ownDays: 0, breakdown: [{ userId: "u1", userName: "Jo", days: 2 }] }
    );
    renderPage();
    await waitFor(() => expect(screen.getByText("Pending (1)")).toBeInTheDocument());
    expect(screen.getByText("Days taken this year")).toBeInTheDocument();
  });

  it("shows all requests read-only for a non-approver admin", async () => {
    // Manu is an approver — use a different admin email for the read-only path.
    asMock(useSession).mockReturnValue({
      data: { user: { email: "aqib@marketfoundry.agency", role: "admin" } },
    });
    mockFetchSequence(
      {
        requests: [{ ...BASE_ROW, status: "approved" }],
        countryCode: "ES",
        today: "2026-08-07",
      },
      { year: 2026, ownDays: 0 }
    );
    renderPage();
    await waitFor(() => expect(screen.getByText("Jo")).toBeInTheDocument());
    expect(screen.queryByText(/pending \(/i)).not.toBeInTheDocument();
  });

  it("renders a My requests section, with Revoke on all requests, for an approver", async () => {
    asMock(useSession).mockReturnValue({
      data: { user: { email: "jake@marketfoundry.agency", role: "admin", id: "u1" } },
    });
    mockFetchSequence(
      {
        requests: [{ ...BASE_ROW, status: "approved" }],
        countryCode: "US",
        today: "2026-08-07",
      },
      { year: 2026, ownDays: 2, breakdown: [] }
    );
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/my requests/i)).toBeInTheDocument()
    );
    // onRevoke is wired only onto the approver's "All requests" list, so exactly
    // one Revoke control exists — "My requests" carries the owner actions instead.
    expect(screen.getByRole("button", { name: "Revoke" })).toBeInTheDocument();
  });

  it("renders a My requests section with the day count, and no Revoke, for a non-approver admin", async () => {
    asMock(useSession).mockReturnValue({
      data: { user: { email: "aqib@marketfoundry.agency", role: "admin", id: "u1" } },
    });
    mockFetchSequence(
      {
        requests: [
          { ...BASE_ROW, status: "approved" },
          {
            ...BASE_ROW,
            id: "r2",
            userId: "u2",
            userName: "Sam",
            startDate: "2026-09-10",
            endDate: "2026-09-11",
            reason: "Wedding",
            status: "approved",
          },
        ],
        countryCode: "ES",
        today: "2026-08-07",
      },
      { year: 2026, ownDays: 2 }
    );
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/my requests/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/taken/i)).toBeInTheDocument();
    // "My requests" is this user's own rows, not every row: u1 owns r1 only. The
    // requester name cannot tell the two lists apart because My requests hides
    // it, so key on the reason — "Trip" renders in both lists, "Wedding" only in
    // All requests.
    expect(screen.getAllByText("Trip")).toHaveLength(2);
    expect(screen.getAllByText("Wedding")).toHaveLength(1);
    // Only approvers revoke — this branch must pass no onRevoke.
    expect(
      screen.queryByRole("button", { name: "Revoke" })
    ).not.toBeInTheDocument();
  });

  it("sends a PATCH with the cancelled status and the note when an approver revokes", async () => {
    asMock(useSession).mockReturnValue({
      data: { user: { email: "jake@marketfoundry.agency", role: "admin", id: "u1" } },
    });
    mockFetchSequence(
      {
        requests: [{ ...BASE_ROW, status: "approved" }],
        countryCode: "US",
        today: "2026-08-07",
      },
      { year: 2026, ownDays: 2, breakdown: [] }
    );
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Revoke" })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    // The revoke dialog holds the only textbox: the approver queue renders a note
    // field per pending row, and every row here is already approved.
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "no cover" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Revoke request" }));

    // Ties this page to the PATCH contract the route actually accepts. Both ends
    // are tested elsewhere; without this the wire between them is not.
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/time-off/r1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ status: "cancelled", decisionNote: "no cover" }),
        })
      )
    );
    expect(asMock(toast.success)).toHaveBeenCalledWith("Time off revoked");
  });

  it("keeps the revoke dialog open with the server's error when the revoke fails", async () => {
    asMock(useSession).mockReturnValue({
      data: { user: { email: "jake@marketfoundry.agency", role: "admin", id: "u1" } },
    });
    global.fetch = vi.fn((url: unknown) => {
      const u = String(url);
      if (u.startsWith("/api/time-off/days-taken")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ year: 2026, ownDays: 2, breakdown: [] }),
        } as Response);
      }
      if (u.startsWith("/api/time-off/r1")) {
        return Promise.resolve({
          ok: false,
          json: async () => ({ error: "Request was decided by someone else" }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          requests: [{ ...BASE_ROW, status: "approved" }],
          countryCode: "US",
          today: "2026-08-07",
        }),
      } as Response);
    }) as unknown as typeof fetch;

    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Revoke" })).toBeInTheDocument()
    );

    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "no cover" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Revoke request" }));

    // handleRevoke must THROW on failure so RequestsList catches it and holds the
    // dialog open with the message. A toast-and-return would close the dialog and
    // read as success.
    await waitFor(() =>
      expect(
        screen.getByText("Request was decided by someone else")
      ).toBeInTheDocument()
    );
  });

  it("surfaces network errors to the user when decision fails", async () => {
    asMock(useSession).mockReturnValue({
      data: { user: { email: "jake@marketfoundry.agency", role: "admin" } },
    });
    asMock(toast.error).mockClear();

    global.fetch = vi.fn((url: unknown) => {
      const u = String(url);
      if (u.startsWith("/api/time-off/days-taken")) {
        return Promise.resolve({ ok: true, json: async () => ({ year: 2026, ownDays: 0, breakdown: [] }) } as Response);
      }
      if (u.startsWith("/api/time-off/r1")) {
        return Promise.reject(new Error("network down"));
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          requests: [{ ...BASE_ROW, status: "pending" }],
          countryCode: "US",
          today: "2026-08-07",
        }),
      } as Response);
    }) as unknown as typeof fetch;

    renderPage();
    await waitFor(() => expect(screen.getByText("Pending (1)")).toBeInTheDocument());

    const approveBtn = screen.getByRole("button", { name: /approve/i });
    await waitFor(() => approveBtn.click());

    await waitFor(() => {
      expect(asMock(toast.error)).toHaveBeenCalledWith("Failed to record decision");
    });
  });

  it("shows an error state instead of Loading… when the initial GET fails", async () => {
    asMock(useSession).mockReturnValue({
      data: { user: { email: "jo@marketfoundry.agency", role: "editor" } },
    });
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, json: async () => ({}) } as Response)) as unknown as typeof fetch;

    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/couldn.t load your requests/i)).toBeInTheDocument()
    );
    expect(screen.queryByText(/^loading/i)).not.toBeInTheDocument();
  });
});
