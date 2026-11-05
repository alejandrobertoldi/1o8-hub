import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/time-logs/auth", () => ({ timeLogSession: vi.fn() }));
vi.mock("@/lib/time-logs/insights", () => ({ buildInsights: vi.fn() }));

import { timeLogSession } from "@/lib/time-logs/auth";
import { buildInsights } from "@/lib/time-logs/insights";
import { GET } from "./route";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const req = (qs: string) => new NextRequest(`http://localhost/api/time-logs/insights?${qs}`);
const RANGE = "from=2026-11-01&to=2026-11-30";

describe("GET /api/time-logs/insights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(buildInsights).mockResolvedValue({ people: [{ id: "u2", name: "Someone" }], clientVsEstimate: [{ client: "KSS" }], totals: {} });
  });

  it("gives an editor only their own hours, whatever they ask for", async () => {
    asMock(timeLogSession).mockResolvedValue({ userId: "me", isAdmin: false, teamReports: false });
    const res = await GET(req(`${RANGE}&user=u2&team=Email`));
    expect(asMock(buildInsights).mock.calls[0][3]).toMatchObject({ userId: "me" });
    expect(asMock(buildInsights).mock.calls[0][3].team).toBeUndefined();
    const body = await res.json();
    expect(body.people).toEqual([]);
    expect(body.clientVsEstimate).toEqual([]);
  });

  it("gives admins the team, or their own with ?mine=1", async () => {
    asMock(timeLogSession).mockResolvedValue({ userId: "boss", isAdmin: false, teamReports: true });
    await GET(req(`${RANGE}&user=u2`));
    expect(asMock(buildInsights).mock.calls[0][3]).toMatchObject({ userId: "u2" });
    await GET(req(`${RANGE}&mine=1`));
    expect(asMock(buildInsights).mock.calls[1][3]).toMatchObject({ userId: "boss" });
  });

  it("401 without a staff session", async () => {
    asMock(timeLogSession).mockResolvedValue(null);
    expect((await GET(req(RANGE))).status).toBe(401);
  });
});
