import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  session: { user: { email: "sam@x.com", name: "Sam", role: "editor" } } as unknown,
  project: { id: "P1", clientIdCode: "TRS_SC_US", s6ApprovedAt: new Date() } as unknown,
  revisions: [] as unknown[],
  submit: vi.fn(),
  pushed: false,
}));
vi.mock("@/lib/auth-db", () => ({ getAuthSession: async () => h.session }));
vi.mock("@/lib/db", () => ({ db: { select: () => ({ from: () => ({ where: async () => (h.project ? [h.project] : []) }) }) } }));
vi.mock("@/lib/seo/revision-db", async (orig) => ({
  ...(await orig<typeof import("@/lib/seo/revision-db")>()),
  listRevisions: async () => h.revisions,
  submitRevision: h.submit,
  projectWasPushed: async () => h.pushed,
}));
vi.mock("@/lib/seo/revision-approvers", () => ({ loadClientApprovers: async () => ({ pm: { name: "Pat", email: "pat@x.com" }, am: null }) }));

import { GET, POST } from "./route";
import { RevisionConflictError } from "@/lib/seo/revision-db";

const ctx = { params: Promise.resolve({ id: "P1" }) };
beforeEach(() => { h.pushed = false; h.revisions = []; h.submit.mockReset(); h.session = { user: { email: "sam@x.com", name: "Sam", role: "editor" } }; h.project = { id: "P1", clientIdCode: "TRS_SC_US", s6ApprovedAt: new Date() }; });

describe("project revisions", () => {
  it("GET: open + current + canSubmit", async () => {
    h.revisions = [{ id: "R2", status: "pm_review", isCurrent: false }, { id: "R1", status: "approved", isCurrent: true }];
    const body = await (await GET(new Request("http://x") as never, ctx)).json();
    expect(body.open.id).toBe("R2");
    expect(body.current.id).toBe("R1");
    expect(body.canSubmit).toBe(false);
    expect(body.approvers.pm.email).toBe("pat@x.com");
    expect(body.pushed).toBe(false);
  });
  it("GET: pushed reflects a recorded push (S8 tick survives a reload)", async () => {
    h.pushed = true;
    const body = await (await GET(new Request("http://x") as never, ctx)).json();
    expect(body.pushed).toBe(true);
  });
  it("POST: viewer → 403; S6 not locked → 400", async () => {
    h.session = { user: { email: "v@x.com", role: "viewer" } };
    expect((await POST(new Request("http://x", { method: "POST" }) as never, ctx)).status).toBe(403);
    h.session = { user: { email: "sam@x.com", role: "editor" } };
    h.project = { id: "P1", clientIdCode: "TRS_SC_US", s6ApprovedAt: null };
    expect((await POST(new Request("http://x", { method: "POST" }) as never, ctx)).status).toBe(400);
  });
  it("POST: conflict → 409, success → 201", async () => {
    h.submit.mockRejectedValueOnce(new RevisionConflictError("still in review"));
    expect((await POST(new Request("http://x", { method: "POST" }) as never, ctx)).status).toBe(409);
    h.submit.mockResolvedValueOnce({ id: "R3" });
    const res = await POST(new Request("http://x", { method: "POST" }) as never, ctx);
    expect(res.status).toBe(201);
    expect(h.submit).toHaveBeenLastCalledWith("P1", { email: "sam@x.com", name: "Sam" });
  });
});
