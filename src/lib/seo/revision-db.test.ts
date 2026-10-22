// src/lib/seo/revision-db.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  updates: [] as Array<{ table: unknown; set: Record<string, unknown>; where: unknown }>,
  inserts: [] as Array<{ table: unknown; values: unknown }>,
  updateResult: [] as unknown[],
  selectResult: [] as unknown[],
  insertError: null as unknown,
}));
vi.mock("drizzle-orm", async (orig) => ({
  ...(await orig<typeof import("drizzle-orm")>()),
  eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
  and: (...parts: unknown[]) => ({ op: "and", parts }),
}));
vi.mock("@/lib/db", () => {
  const tx = {
    update: (table: unknown) => ({
      set: (set: Record<string, unknown>) => ({
        where: (where: unknown) => {
          h.updates.push({ table, set, where });
          const p = Promise.resolve([]);
          return Object.assign(p, { returning: async () => h.updateResult });
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        h.inserts.push({ table, values });
        const run = async () => { if (h.insertError) throw h.insertError; return [{ id: "new", ...(values as object) }]; };
        const eager = run();
        eager.catch(() => {}); // plumbing: swallow the unawaited eager promise; awaiting callers still see the rejection
        return Object.assign(eager, { returning: run });
      },
    }),
    select: () => ({ from: () => ({ where: async () => h.selectResult }) }),
  };
  return { db: { ...tx, transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } };
});

import { decideRevision, RevisionConflictError, submitRevision, RevisionInputError } from "./revision-db";
import { seoRevisions } from "@/lib/db/schema";

beforeEach(() => {
  h.updates.length = 0; h.inserts.length = 0; h.updateResult = []; h.selectResult = []; h.insertError = null;
});

const base = { revisionId: "R1", projectId: "P1", actor: { email: "pat@x.com", name: "Pat" }, note: null };

describe("decideRevision", () => {
  it("updates only if the revision is still in the expected status (race-safe)", async () => {
    h.updateResult = [{ id: "R1", status: "am_review" }];
    await decideRevision({ ...base, expectedStatus: "pm_review", action: "approve", step: "pm", actedAs: "assigned" });
    const u = h.updates.find((x) => x.table === seoRevisions)!;
    expect(u.set.status).toBe("am_review");
    expect(u.where).toEqual({ op: "and", parts: [{ op: "eq", col: seoRevisions.id, val: "R1" }, { op: "eq", col: seoRevisions.status, val: "pm_review" }] });
  });
  it("0 rows updated → RevisionConflictError (Review Focus 1)", async () => {
    h.updateResult = [];
    await expect(decideRevision({ ...base, expectedStatus: "pm_review", action: "approve", step: "pm", actedAs: "override" })).rejects.toBeInstanceOf(RevisionConflictError);
  });
  it("a forbidden action throws RevisionInputError before touching the DB", async () => {
    await expect(decideRevision({ ...base, expectedStatus: "pm_review", action: "send_to_client", step: "pm", actedAs: "assigned" })).rejects.toBeInstanceOf(RevisionInputError);
    expect(h.updates).toHaveLength(0);
  });
  it("approval clears the previous current revision first, then marks this one current with final_via", async () => {
    h.updateResult = [{ id: "R1", status: "approved" }];
    await decideRevision({ ...base, expectedStatus: "am_review", action: "approve_final", step: "am", actedAs: "assigned", note: "small fix" });
    const [clear, mark] = h.updates.filter((x) => x.table === seoRevisions);
    expect(clear.set).toEqual({ isCurrent: false });
    expect(mark.set).toMatchObject({ status: "approved", isCurrent: true, finalVia: "am_final", finalReason: "small fix" });
  });
  it("an owner override at the client step is am_final with the note as reason; a real client approval is client", async () => {
    h.updateResult = [{ id: "R1", status: "approved" }];
    await decideRevision({ ...base, expectedStatus: "client_review", action: "approve", step: "client", actedAs: "override", note: "client agreed by phone" });
    let [, mark] = h.updates.filter((x) => x.table === seoRevisions);
    expect(mark.set).toMatchObject({ finalVia: "am_final", finalReason: "client agreed by phone" });
    h.updates.length = 0;
    await decideRevision({ ...base, expectedStatus: "client_review", action: "approve", step: "client", actedAs: "client" });
    [, mark] = h.updates.filter((x) => x.table === seoRevisions);
    expect(mark.set).toMatchObject({ finalVia: "client", finalReason: null });
  });
});

describe("submitRevision", () => {
  it("no S6 content → RevisionInputError", async () => {
    h.selectResult = [{ asin: "A1", generatedContent: {} }];
    await expect(submitRevision("P1", { email: "s@x.com", name: "S" })).rejects.toBeInstanceOf(RevisionInputError);
  });
  it("S6 text identical to the current approved revision → RevisionInputError, nothing inserted", async () => {
    h.selectResult = [{ asin: "A1", generatedContent: { Title: "t" }, n: 1, content: { A1: { Title: "t" } } }];
    await expect(submitRevision("P1", { email: "s@x.com", name: "S" })).rejects.toThrow(/No changes since r1/);
    expect(h.inserts).toHaveLength(0);
  });
  it("unique violation (another open revision) → RevisionConflictError", async () => {
    h.selectResult = [{ asin: "A1", generatedContent: { Title: "t" }, n: 0 }]; // serves both the content read and the max() read
    h.insertError = Object.assign(new Error("dup"), { code: "23505" });
    await expect(submitRevision("P1", { email: "s@x.com", name: "S" })).rejects.toBeInstanceOf(RevisionConflictError);
  });
});
