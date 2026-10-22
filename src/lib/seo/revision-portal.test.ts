import { describe, it, expect } from "vitest";
import { portalClientAllowed, toClientProduct, toClientRevision } from "./revision-portal";

const rev = { id: "R1", revisionNumber: 2, status: "client_review", submittedAt: new Date("2026-10-02T00:00:00Z"), content: { A1: { Title: "t" } }, finalReason: "SECRET-OVERRIDE-REASON", submittedByEmail: "sam@x.com" } as never;
const comments = [
  { id: "C1", asin: "A1", fieldKey: "Title", parentCommentId: null, audience: "internal", authorName: "Pat", body: "SECRET-PM-NOTE", createdAt: new Date(), resolvedAt: null },
  { id: "C2", asin: "A1", fieldKey: "Title", parentCommentId: null, audience: "client", authorName: "Maria", body: "Shorter please", createdAt: new Date(), resolvedAt: null },
] as never;
const events = [
  { step: "pm", action: "request_changes", note: "SECRET-EVENT-NOTE", actorName: "Pat", createdAt: new Date() },
  { step: "client", action: "approve", note: null, actorName: "Maria", createdAt: new Date("2026-10-04T00:00:00Z") },
] as never;

describe("toClientRevision (Review Focus 3)", () => {
  it("keeps client comments and the client's decision, drops everything internal", () => {
    const out = toClientRevision(rev, "TRS_v01", comments, events);
    expect(out.comments.map((c) => c.id)).toEqual(["C2"]);
    expect(out.decision).toEqual({ at: "2026-10-04T00:00:00.000Z", byName: "Maria", action: "approve" });
    const json = JSON.stringify(out);
    for (const secret of ["SECRET-PM-NOTE", "SECRET-EVENT-NOTE", "SECRET-OVERRIDE-REASON", "sam@x.com"]) expect(json).not.toContain(secret);
  });
});

describe("portalClientAllowed (Review Focus 4)", () => {
  it("multi-account client user sees each of their clients, not others", () => {
    const s = { user: { role: "client", clientIdCode: "TRT_SC_US, TRS_SC_US" } };
    expect(portalClientAllowed(s, "TRS_SC_US")).toBe(true);
    expect(portalClientAllowed(s, "REA_SC_US")).toBe(false);
  });
  it("admins may preview; editors and viewers may not", () => {
    expect(portalClientAllowed({ user: { role: "owner" } }, "REA_SC_US")).toBe(true);
    expect(portalClientAllowed({ user: { role: "editor" } }, "REA_SC_US")).toBe(false);
  });
});

describe("toClientProduct (client-safe catalog fields)", () => {
  it("keeps what the PDP renders and drops every internal column", () => {
    const row = {
      id: "P1", asin: "A1", itemName: "Widget", contentSeo: { ProductDescription: "d" },
      changeLog: [{ changedBy: "staff@marketfoundry.agency" }], rawColumnValues: { PortalNotes: "SECRET" },
      costPrice: "9.99", isDirty: true, otherAttributes: { x: "y" },
    } as never;
    const out = toClientProduct(row);
    expect(out.itemName).toBe("Widget");
    expect(out.asin).toBe("A1");
    expect(out.contentSeo).toEqual({ ProductDescription: "d" });
    const json = JSON.stringify(out);
    for (const secret of ["staff@marketfoundry.agency", "SECRET", "costPrice", "isDirty", "changeLog", "rawColumnValues", "otherAttributes"]) expect(json).not.toContain(secret);
  });
});
