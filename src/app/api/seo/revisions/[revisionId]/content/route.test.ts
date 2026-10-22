import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  session: { user: { email: "sam@x.com", name: "Sam", role: "editor" } } as unknown,
  status: "pm_review",
  content: { A1: { DetailedBulletPoint_5: "old bullet", Title: "T" } } as Record<string, Record<string, string>>,
  gc: { DetailedBulletPoint_5: "old bullet", DetailedBulletPoint_5_CharLength: 10 } as Record<string, unknown>,
  writes: [] as Array<{ table: string; set?: unknown; values?: unknown }>,
  suggestion: [] as unknown[],
}));
vi.mock("@/lib/auth-db", () => ({ getAuthSession: async () => h.session }));
vi.mock("@/lib/seo/revision-db", () => ({
  getRevisionWithProject: async (id: string) => id === "R1"
    ? { revision: { id: "R1", status: h.status, content: h.content }, project: { id: "P1", name: "TRS_v01", clientIdCode: "TRS_SC_US" } }
    : null,
}));
vi.mock("@/lib/db", () => {
  const name = (t: Record<symbol, unknown>) => String(t?.[Symbol.for("drizzle:Name")]);
  const tx = {
    select: () => ({ from: (t: Record<symbol, unknown>) => ({ where: () => ({ limit: async () => (name(t) === "seo_revision_comments" ? h.suggestion : [{ generatedContent: h.gc }]) }) }) }),
    update: (t: Record<symbol, unknown>) => ({ set: (set: unknown) => ({ where: () => { h.writes.push({ table: name(t), set }); return Object.assign(Promise.resolve(), { returning: async () => [{ id: "R1" }] }); } }) }),
    insert: (t: Record<symbol, unknown>) => ({ values: async (values: unknown) => { h.writes.push({ table: name(t), values }); } }),
  };
  return { db: { transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx) } };
});

import { PATCH } from "./route";
const call = (body: unknown) => PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify(body) }) as never, { params: Promise.resolve({ revisionId: "R1" }) });
const ok = { asin: "A1", fieldKey: "DetailedBulletPoint_5", value: "new bullet", expectedValue: "old bullet" };

beforeEach(() => {
  h.session = { user: { email: "sam@x.com", name: "Sam", role: "editor" } };
  h.status = "pm_review"; h.writes.length = 0;
  h.content = { A1: { DetailedBulletPoint_5: "old bullet", Title: "T" } };
  h.suggestion = [];
});

describe("PATCH revision content", () => {
  it("updates the revision and S6's copy, and logs an internal note on that field", async () => {
    const res = await call(ok);
    expect(res.status).toBe(200);
    const rev = h.writes.find((w) => w.table === "seo_revisions")?.set as { content: typeof h.content };
    expect(rev.content.A1.DetailedBulletPoint_5).toBe("new bullet");
    expect(rev.content.A1.Title).toBe("T");
    const gc = (h.writes.find((w) => w.table === "seo_asins")?.set as { generatedContent: Record<string, unknown> }).generatedContent;
    expect(gc).toMatchObject({ DetailedBulletPoint_5: "new bullet", DetailedBulletPoint_5_CharLength: 10 });
    const note = h.writes.find((w) => w.table === "seo_revision_comments")?.values as { audience: string; fieldKey: string; body: string };
    expect(note).toMatchObject({ audience: "internal", fieldKey: "DetailedBulletPoint_5" });
    // Logged already resolved, so it never counts as an open comment
    expect((note as unknown as { resolvedAt: unknown; resolvedBy: string }).resolvedAt).toBeInstanceOf(Date);
    expect((note as unknown as { resolvedBy: string }).resolvedBy).toBe("sam@x.com");
    expect(note.body).toContain('Before: "old bullet"');
  });
  it("someone changed it meanwhile → 409, nothing written", async () => {
    expect((await call({ ...ok, expectedValue: "stale" })).status).toBe(409);
    expect(h.writes).toHaveLength(0);
  });
  it("only during PM / AM review", async () => {
    h.status = "client_review";
    expect((await call(ok)).status).toBe(409);
    expect(h.writes).toHaveLength(0);
  });
  it("client and viewer roles cannot edit", async () => {
    for (const role of ["client", "viewer"]) {
      h.session = { user: { email: "c@x.com", role } };
      expect((await call(ok)).status).toBe(403);
    }
    expect(h.writes).toHaveLength(0);
  });
  it("unknown field or ASIN → 400; empty text → 400", async () => {
    expect((await call({ ...ok, fieldKey: "Nope" })).status).toBe(400);
    expect((await call({ ...ok, asin: "ZZ" })).status).toBe(400);
    expect((await call({ ...ok, value: "  " })).status).toBe(400);
  });
  it("a bullet over 200 characters → 400, nothing written; 200 is fine", async () => {
    const res = await call({ ...ok, value: "y".repeat(201) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/200 characters/);
    expect(h.writes).toHaveLength(0);
    expect((await call({ ...ok, value: "y".repeat(200) })).status).toBe(200);
  });
  it("backend search terms over 249 bytes → 400, nothing written; 249 is fine", async () => {
    h.content = { A1: { ...h.content.A1, BackendSearchTerms: "dog" } };
    const res = await call({ ...ok, fieldKey: "BackendSearchTerms", value: "x".repeat(250), expectedValue: "dog" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/249 bytes/);
    expect(h.writes).toHaveLength(0);
    expect((await call({ ...ok, fieldKey: "BackendSearchTerms", value: "x".repeat(249), expectedValue: "dog" })).status).toBe(200);
  });
});

import { suggestionNote } from "@/lib/seo/revision-edit";

describe("accept a client suggestion", () => {
  const sugg = (over: Record<string, unknown> = {}) => [{ id: "S1", asin: "A1", fieldKey: "DetailedBulletPoint_5", body: suggestionNote("old bullet", "client wording"), resolvedAt: null, authorName: "Maria", ...over }];
  it("during client review: applies the suggested text, resolves the suggestion, logs the edit", async () => {
    h.status = "client_review"; h.suggestion = sugg();
    const res = await call({ asin: "A1", fieldKey: "DetailedBulletPoint_5", acceptSuggestionId: "S1" });
    expect(res.status).toBe(200);
    expect((h.writes.find((w) => w.table === "seo_revisions")?.set as { content: typeof h.content }).content.A1.DetailedBulletPoint_5).toBe("client wording");
    const resolved = h.writes.find((w) => w.table === "seo_revision_comments" && w.set) as { set: { resolvedAt: unknown } };
    expect(resolved.set.resolvedAt).toBeInstanceOf(Date);
    const note = h.writes.find((w) => w.table === "seo_revision_comments" && w.values)?.values as { body: string };
    expect(note.body).toContain("Maria");
  });
  it("a client suggestion over the bullet limit can't be accepted → 400, nothing written", async () => {
    h.status = "client_review"; h.suggestion = sugg({ body: suggestionNote("old bullet", "z".repeat(201)) });
    const res = await call({ asin: "A1", fieldKey: "DetailedBulletPoint_5", acceptSuggestionId: "S1" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/200 characters.*decline this suggestion/);
    expect(h.writes.filter((w) => w.table === "seo_revisions")).toHaveLength(0);
  });
  it("text changed since the suggestion → 409; already handled → 409; not a suggestion → 400", async () => {
    h.status = "client_review";
    h.suggestion = sugg({ body: suggestionNote("something else", "x") });
    expect((await call({ asin: "A1", fieldKey: "DetailedBulletPoint_5", acceptSuggestionId: "S1" })).status).toBe(409);
    h.suggestion = sugg({ resolvedAt: new Date() });
    expect((await call({ asin: "A1", fieldKey: "DetailedBulletPoint_5", acceptSuggestionId: "S1" })).status).toBe(409);
    h.suggestion = sugg({ body: "just a comment" });
    expect((await call({ asin: "A1", fieldKey: "DetailedBulletPoint_5", acceptSuggestionId: "S1" })).status).toBe(400);
    expect(h.writes.filter((w) => w.table === "seo_revisions")).toHaveLength(0);
  });
  it("plain staff edits are still not allowed during client review", async () => {
    h.status = "client_review";
    expect((await call(ok)).status).toBe(409);
  });
});
