import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ session: null as unknown, decide: vi.fn(), status: "pm_review", sectionOn: true }));
vi.mock("@/lib/auth-db", () => ({ getAuthSession: async () => h.session }));
vi.mock("@/lib/seo/revision-db", async (orig) => ({
  ...(await orig<typeof import("@/lib/seo/revision-db")>()),
  getRevisionWithProject: async () => ({ revision: { id: "R1", status: h.status, submittedByEmail: "sam@x.com" }, project: { id: "P1", clientIdCode: "TRS_SC_US" } }),
  decideRevision: h.decide,
}));
vi.mock("@/lib/seo/revision-approvers", () => ({ loadClientApprovers: async () => ({ pm: { name: "Pat", email: "pat@x.com" }, am: { name: "Ann", email: "ann@x.com" } }) }));

vi.mock("@/lib/seo/revision-portal", () => ({ seoSectionEnabled: async () => h.sectionOn }));

import { POST } from "./route";
import { RevisionConflictError } from "@/lib/seo/revision-db";

const call = (body: unknown) => POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }) as never, { params: Promise.resolve({ revisionId: "R1" }) });
beforeEach(() => { h.decide.mockReset(); h.decide.mockResolvedValue({ id: "R1" }); h.status = "pm_review"; h.sectionOn = true; h.session = { user: { email: "pat@x.com", name: "Pat", role: "editor" } }; });

describe("POST decision", () => {
  it("assigned PM approves → decideRevision with step pm, assigned", async () => {
    expect((await call({ action: "approve", expectedStatus: "pm_review" })).status).toBe(200);
    expect(h.decide).toHaveBeenCalledWith(expect.objectContaining({ step: "pm", actedAs: "assigned", action: "approve", expectedStatus: "pm_review" }));
  });
  it("request_changes without a note → 400", async () => {
    expect((await call({ action: "request_changes", expectedStatus: "pm_review" })).status).toBe(400);
  });
  it("the AM may override the PM step (client team ladder); the author → 403", async () => {
    h.session = { user: { email: "ann@x.com", role: "admin" } };
    expect((await call({ action: "approve", expectedStatus: "pm_review" })).status).toBe(200);
    expect(h.decide).toHaveBeenLastCalledWith(expect.objectContaining({ step: "pm", actedAs: "override" }));
    h.session = { user: { email: "sam@x.com", role: "owner" } };
    expect((await call({ action: "approve", expectedStatus: "pm_review" })).status).toBe(403);
  });
  it("stale expectedStatus → 409 without calling the DB; a DB race → 409", async () => {
    expect((await call({ action: "approve", expectedStatus: "am_review" })).status).toBe(409);
    expect(h.decide).not.toHaveBeenCalled();
    h.decide.mockRejectedValueOnce(new RevisionConflictError("Already decided — reload"));
    expect((await call({ action: "approve", expectedStatus: "pm_review" })).status).toBe(409);
  });
  it("an editor at the client step → 403 (even with a note)", async () => {
    h.status = "client_review";
    h.session = { user: { email: "pat@x.com", role: "editor" } };
    expect((await call({ action: "approve", expectedStatus: "client_review", note: "n" })).status).toBe(403);
    expect(h.decide).not.toHaveBeenCalled();
  });
  it("an owner override approves at client_review with a note → step client, override", async () => {
    h.status = "client_review";
    h.session = { user: { email: "boss@x.com", role: "owner" } };
    expect((await call({ action: "approve", expectedStatus: "client_review", note: "client OK'd by email" })).status).toBe(200);
    expect(h.decide).toHaveBeenCalledWith(expect.objectContaining({ step: "client", actedAs: "override", action: "approve", note: "client OK'd by email" }));
  });
  it("an owner override at the client step without a note → 400; the author is still 403", async () => {
    h.status = "client_review";
    h.session = { user: { email: "boss@x.com", role: "owner" } };
    expect((await call({ action: "approve", expectedStatus: "client_review" })).status).toBe(400);
    expect((await call({ action: "request_changes", expectedStatus: "client_review" })).status).toBe(400);
    h.session = { user: { email: "sam@x.com", role: "owner" } };
    expect((await call({ action: "approve", expectedStatus: "client_review", note: "n" })).status).toBe(403);
    expect(h.decide).not.toHaveBeenCalled();
  });
  it("send_to_client while the client's SEO portal section is off → 400", async () => {
    h.status = "am_review";
    h.sectionOn = false;
    h.session = { user: { email: "ann@x.com", role: "editor" } };
    const res = await call({ action: "send_to_client", expectedStatus: "am_review" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("This client's SEO portal section is off — enable it or approve as final");
    expect(h.decide).not.toHaveBeenCalled();
    h.sectionOn = true;
    expect((await call({ action: "send_to_client", expectedStatus: "am_review" })).status).toBe(200);
  });
  it("non-editor roles are rejected even as the assigned PM's email → 403, no decision", async () => {
    h.session = { user: { email: "pat@x.com", role: "viewer" } };
    expect((await call({ action: "approve", expectedStatus: "pm_review" })).status).toBe(403);
    h.session = { user: { email: "pat@x.com", role: "client" } };
    expect((await call({ action: "approve", expectedStatus: "pm_review" })).status).toBe(403);
    expect(h.decide).not.toHaveBeenCalled();
  });
});
