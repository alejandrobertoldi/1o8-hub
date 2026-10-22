// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn() }));
const exec = vi.fn();
vi.mock("@/lib/db", () => ({ db: { execute: (...a: unknown[]) => exec(...a),
  transaction: async (fn: (tx: unknown) => unknown) => fn({ execute: (...a: unknown[]) => exec(...a) }) } }));
const load = vi.fn();
const blockers = vi.fn();
vi.mock("@/lib/case-study/kit/load", () => ({ loadCaseStudy: (...a: unknown[]) => load(...a), blockersFor: (...a: unknown[]) => blockers(...a) }));
import { getAuthSession } from "@/lib/auth-db";
const session = getAuthSession as unknown as ReturnType<typeof vi.fn>;
const ctx = (id = "cs1", sectionId = "s1") => ({ params: Promise.resolve({ id, sectionId }) });
const deck = (stage: string) => ({ id: "cs1", stage, format: "high_level", metrics: { overrides: {} }, sections: [] });
const sqlText = () => exec.mock.calls.map((c) => JSON.stringify(c[0])).join("\n");
beforeEach(() => { vi.clearAllMocks(); session.mockResolvedValue({ user: { role: "editor", id: "u1" } }); exec.mockResolvedValue([]); blockers.mockReturnValue([]); });

const pull = vi.fn();
vi.mock("@/lib/case-study/kit/pull", () => ({ pullEverything: (...a: unknown[]) => pull(...a) }));
import { EMPTY_DESIGN_IMAGES } from "@/lib/case-study/kit/slides";
import { POST } from "./route";

describe("POST refresh", () => {
  const prevMetrics = { pulledAt: "x", period: { start: "2025-01-01", end: "2025-12-31" }, auto: {}, overrides: { sessions: 9 }, failed: [] };
  const sections = [{ id: "s1", sectionType: "hl_creative", sortOrder: 4,
    content: { copy: { bsJob: "STALE_COPY" }, designImages: { li1: ["OLD_URL"] }, manualImages: { li2: ["STALE_MANUAL"] } } }];
  beforeEach(() => {
    load.mockResolvedValue({ ...deck("approved"), clientIdCode: "C", dateRangeStart: "2025-01-01", dateRangeEnd: "2025-12-31", metrics: prevMetrics, sections });
    pull.mockResolvedValue({ metrics: { ...prevMetrics, pulledAt: "NEW_PULL", auto: { salesTotal: 1 } }, design: { ...EMPTY_DESIGN_IMAGES, heroListing: ["new"] }, noAccount: false });
  });

  it("writes new design images + auto metrics, passes prev metrics, drops the stage", async () => {
    const res = await POST(new NextRequest("http://x", { method: "POST" }), ctx());
    expect(res.status).toBe(200);
    expect(pull).toHaveBeenCalledWith("C", "2025-01-01", "2025-12-31", prevMetrics);
    const all = sqlText();
    expect(all).toContain("new"); expect(all).toContain("NEW_PULL"); expect(all).toContain("salesTotal");
    expect(all).not.toContain("OLD_URL");
    expect(all).toContain("drafting");
  });

  it("never writes the pre-pull overrides, copy or manual images (merges into the row's current jsonb)", async () => {
    await POST(new NextRequest("http://x", { method: "POST" }), ctx());
    const all = sqlText();
    expect(all).not.toContain("overrides");
    expect(all).not.toContain("copy");
    expect(all).not.toContain("manualImages");
    expect(all).not.toContain("STALE_COPY"); expect(all).not.toContain("STALE_MANUAL");
    expect(all).toContain("jsonb_set"); expect(all).toContain("{designImages}"); expect(all).toContain("{creativeCounts}");
    expect(all).toContain("COALESCE(metrics, '{}'::jsonb) ||");
  });

  it("skips a legacy section_type instead of throwing", async () => {
    load.mockResolvedValue({ ...deck("drafting"), clientIdCode: "C", dateRangeStart: "2025-01-01", dateRangeEnd: "2025-12-31", metrics: prevMetrics,
      sections: [{ id: "legacy1", sectionType: "executive_summary", sortOrder: 0, content: { copy: {}, designImages: {}, manualImages: {} } }, ...sections] });
    const res = await POST(new NextRequest("http://x", { method: "POST" }), ctx());
    expect(res.status).toBe(200);
    expect(exec).toHaveBeenCalledTimes(2); // s1 + case_studies; legacy1 skipped
    expect(sqlText()).not.toContain("legacy1");
  });
});
