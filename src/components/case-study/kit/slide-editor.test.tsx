import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SlideEditor } from "./slide-editor";
import { slidesFor, defaultSectionContent, EMPTY_DESIGN_IMAGES } from "@/lib/case-study/kit/slides";
import { emptyMetrics } from "@/lib/case-study/kit/metrics";
import type { KitCaseStudy } from "@/lib/case-study/kit/types";

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }); vi.stubGlobal("fetch", fetchMock); });

const cs = (): KitCaseStudy => {
  const metrics = emptyMetrics("2025-01-01", "2025-12-31");
  metrics.auto = { sessions: 1000 };
  const defs = slidesFor("detailed");
  return { id: "cs", clientIdCode: "A", clientName: "Acme", title: "t", format: "detailed", stage: "drafting", ownerId: null, ownerName: null,
    sentAt: null, dateRangeStart: "2025-01-01", dateRangeEnd: "2025-12-31", clientSector: "", contactEmail: "", metrics, updatedAt: "",
    sections: defs.map((def, i) => ({ id: `s${i}`, sectionType: def.type, sortOrder: i, content: defaultSectionContent(def, { ...EMPTY_DESIGN_IMAGES, heroListing: ["/m"] }) })) };
};

describe("SlideEditor", () => {
  it("renders the slide's copy fields and saves them", async () => {
    render(<SlideEditor cs={cs()} sectionId="s0" open onOpenChange={() => {}} onSaved={() => {}} readOnly={false} />);
    fireEvent.change(screen.getByLabelText("Bold claim"), { target: { value: "Big win" } });
    fireEvent.click(screen.getByRole("button", { name: /save copy/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/case-studies/cs/sections/s0", expect.objectContaining({ method: "PATCH" })));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).copy.claim).toBe("Big win");
  });
  it("shows Redshift value and saves a numeric override", async () => {
    render(<SlideEditor cs={cs()} sectionId="s3" open onOpenChange={() => {}} onSaved={() => {}} readOnly={false} />); // snapshot
    expect(screen.getByText(/1,000/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/override sessions/i), { target: { value: "1500" } });
    fireEvent.click(screen.getByRole("button", { name: /save sessions/i }));
    await waitFor(() => expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ key: "sessions", value: 1500 }));
  });
  it("manual image input lives behind the emergency disclosure and tags the source", () => {
    render(<SlideEditor cs={cs()} sectionId="s0" open onOpenChange={() => {}} onSaved={() => {}} readOnly={false} />);
    expect(screen.getAllByText(/from design/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/emergency only/i).length).toBeGreaterThan(0);
  });
  it("read-only hides save buttons", () => {
    render(<SlideEditor cs={cs()} sectionId="s0" open onOpenChange={() => {}} onSaved={() => {}} readOnly />);
    expect(screen.queryByRole("button", { name: /save copy/i })).toBeNull();
  });
  it("does not leak stale copy state across slides when keyed by sectionId (the mount site's fix)", () => {
    const shared = cs();
    function Wrapper({ sectionId }: { sectionId: string }) {
      return <SlideEditor key={sectionId} cs={shared} sectionId={sectionId} open onOpenChange={() => {}} onSaved={() => {}} readOnly={false} />;
    }
    const { rerender } = render(<Wrapper sectionId="s0" />);
    fireEvent.change(screen.getByLabelText("Bold claim"), { target: { value: "Big win" } });
    expect((screen.getByLabelText("Bold claim") as HTMLInputElement).value).toBe("Big win");

    // Switch to a different slide (forces a remount via the changed key).
    rerender(<Wrapper sectionId="s1" />);
    expect(screen.queryByLabelText("Bold claim")).toBeNull();

    // Switch back to s0: a fresh instance must reflect s0's own saved content,
    // not the unsaved "Big win" edit left behind by the previous instance.
    rerender(<Wrapper sectionId="s0" />);
    expect((screen.getByLabelText("Bold claim") as HTMLInputElement).value).toBe("");
  });
});
