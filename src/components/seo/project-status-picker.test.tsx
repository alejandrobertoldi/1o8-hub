import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProjectStatusPicker } from "./project-status-picker";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ version: 1, asins: [], liveCount: 0, total: 0 }) });
  vi.stubGlobal("fetch", fetchMock);
});

function renderInCard() {
  // Mirrors the project card: a transformed ancestor (animate-card-enter) creates a
  // stacking context, so an in-card menu is painted under the NEXT card (prod 2026-09-30).
  render(
    <div data-testid="card" style={{ transform: "translateY(0)" }}>
      <ProjectStatusPicker projectId="P1" status="draft" />
    </div>,
  );
  fireEvent.click(screen.getByRole("button", { name: "draft" }));
}

describe("ProjectStatusPicker", () => {
  it("portals the status menu to document.body so later cards can't cover it", () => {
    renderInCard();
    const listbox = screen.getByRole("listbox");
    expect(screen.getByTestId("card").contains(listbox)).toBe(false);
    expect(listbox.parentElement).toBe(document.body);
    expect(listbox.style.position).toBe("fixed");
  });

  it("clicking go live… in the portaled menu opens the go-live popover (not treated as an outside click)", async () => {
    renderInCard();
    fireEvent.mouseDown(screen.getByText("go live…"));
    fireEvent.click(screen.getByText("go live…"));
    expect(screen.queryByRole("listbox")).toBeNull();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/seo/projects/P1/live")));
  });

  it("choosing a status in the portaled menu still PATCHes it", async () => {
    renderInCard();
    fireEvent.mouseDown(screen.getByText("completed"));
    fireEvent.click(screen.getByText("completed"));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/seo/projects/P1", expect.objectContaining({ method: "PATCH" })),
    );
  });
});
