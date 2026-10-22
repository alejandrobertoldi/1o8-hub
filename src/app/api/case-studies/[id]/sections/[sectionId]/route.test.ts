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
const patch = (body: unknown) => new NextRequest("http://x", { method: "PATCH", body: JSON.stringify(body) });
const deck = (stage: string) => ({ id: "cs1", stage, format: "high_level", metrics: { overrides: {} }, sections: [] });
const sqlText = () => exec.mock.calls.map((c) => JSON.stringify(c[0])).join("\n");
beforeEach(() => { vi.clearAllMocks(); session.mockResolvedValue({ user: { role: "editor", id: "u1" } }); exec.mockResolvedValue([]); blockers.mockReturnValue([]); });

import { PATCH } from "./route";

describe("PATCH section", () => {
  it("merges copy and manualImages, ignores designImages", async () => {
    load.mockResolvedValue({ ...deck("drafting"), sections: [{ id: "s1", sectionType: "hl_cover", sortOrder: 0,
      content: { copy: { claim: "old", result: "keep" }, designImages: { "cover-hero": ["d"] }, manualImages: {} } }] });
    const res = await PATCH(patch({ copy: { claim: "new" }, manualImages: { "cover-hero": ["https://m"] }, designImages: { "cover-hero": ["evil"] } }), ctx());
    expect(res.status).toBe(200);
    const written = JSON.stringify(exec.mock.calls.at(-2)?.[0] ?? exec.mock.calls.at(-1)?.[0]);
    expect(written).toContain("new"); expect(written).toContain("keep"); expect(written).toContain("https://m");
    expect(written).not.toContain("evil");
  });
  it("rejects manual image values that are not http(s) or /api/ urls, with a message matching the rule", async () => {
    load.mockResolvedValue({ ...deck("drafting"), sections: [{ id: "s1", sectionType: "hl_cover", sortOrder: 0, content: { copy: {}, designImages: {}, manualImages: {} } }] });
    const res = await PATCH(patch({ manualImages: { "cover-hero": ["javascript:alert(1)"] } }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Image links must start with https://, http:// or /api/");
    expect((await PATCH(patch({ manualImages: { "cover-hero": ["http://ok", "/api/img/1"] } }), ctx())).status).toBe(200);
  });
  it("ignores copy keys and slot ids the slide catalog does not define", async () => {
    load.mockResolvedValue({ ...deck("drafting"), sections: [{ id: "s1", sectionType: "hl_cover", sortOrder: 0, content: { copy: {}, designImages: {}, manualImages: {} } }] });
    const res = await PATCH(patch({ copy: { claim: "ok", bogusKey: "JUNK_COPY" }, manualImages: { "cover-hero": ["https://m"], "not-a-slot": ["https://JUNK_SLOT"] } }), ctx());
    expect(res.status).toBe(200);
    const all = sqlText();
    expect(all).toContain("ok"); expect(all).toContain("https://m");
    expect(all).not.toContain("bogusKey"); expect(all).not.toContain("JUNK_COPY");
    expect(all).not.toContain("not-a-slot"); expect(all).not.toContain("JUNK_SLOT");
  });
  it("runs both UPDATEs in one transaction and writes only copy/manualImages keys", async () => {
    const tx = vi.fn(async (fn: (t: unknown) => unknown) => fn({ execute: (...a: unknown[]) => exec(...a) }));
    const dbMod = await import("@/lib/db");
    const original = (dbMod.db as unknown as { transaction: unknown }).transaction;
    (dbMod.db as unknown as { transaction: unknown }).transaction = tx;
    try {
      load.mockResolvedValue({ ...deck("drafting"), sections: [{ id: "s1", sectionType: "hl_cover", sortOrder: 0,
        content: { copy: {}, designImages: { "cover-hero": ["STALE_DESIGN"] }, manualImages: {} } }] });
      await PATCH(patch({ copy: { claim: "x" } }), ctx());
      expect(tx).toHaveBeenCalledTimes(1);
      expect(exec).toHaveBeenCalledTimes(2);
      const all = sqlText();
      expect(all).toContain("{copy}"); expect(all).toContain("{manualImages}");
      expect(all).not.toContain("STALE_DESIGN");
    } finally {
      (dbMod.db as unknown as { transaction: unknown }).transaction = original;
    }
  });
  it("legacy section_type → 400", async () => {
    load.mockResolvedValue({ ...deck("drafting"), sections: [{ id: "s1", sectionType: "executive_summary", sortOrder: 0, content: { copy: {}, designImages: {}, manualImages: {} } }] });
    expect((await PATCH(patch({ copy: { claim: "x" } }), ctx())).status).toBe(400);
    expect(exec).not.toHaveBeenCalled();
  });
  it("unknown section → 404; approved deck → drafting", async () => {
    load.mockResolvedValue({ ...deck("sent"), sections: [] });
    expect((await PATCH(patch({ copy: {} }), ctx())).status).toBe(404);
    load.mockResolvedValue({ ...deck("sent"), sections: [{ id: "s1", sectionType: "hl_cover", sortOrder: 0, content: { copy: {}, designImages: {}, manualImages: {} } }] });
    await PATCH(patch({ copy: { claim: "x" } }), ctx());
    expect(sqlText()).toContain("drafting");
  });
});
