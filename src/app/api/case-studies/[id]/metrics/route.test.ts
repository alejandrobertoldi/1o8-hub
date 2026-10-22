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

describe("PATCH metric override", () => {
  it("rejects non-scalar keys", async () => {
    load.mockResolvedValue(deck("drafting"));
    expect((await PATCH(patch({ key: "salesMonthly", value: 1 }), ctx())).status).toBe(400);
  });
  it("rejects non-numeric values for numeric keys", async () => {
    load.mockResolvedValue(deck("drafting"));
    expect((await PATCH(patch({ key: "sessions", value: "lots" }), ctx())).status).toBe(400);
  });
  it("writes one key with jsonb_set, never replacing the whole metrics object", async () => {
    load.mockResolvedValue(deck("drafting"));
    expect((await PATCH(patch({ key: "sessions", value: 1234 }), ctx())).status).toBe(200);
    expect(sqlText()).toContain("jsonb_set");
    expect(sqlText()).not.toMatch(/SET metrics = \$/);
  });
  it("null clears the override (#- path)", async () => {
    load.mockResolvedValue(deck("drafting"));
    await PATCH(patch({ key: "sessions", value: null }), ctx());
    expect(sqlText()).toContain("#-");
  });
  it("editing an approved deck drops it to drafting", async () => {
    load.mockResolvedValue(deck("approved"));
    await PATCH(patch({ key: "sessions", value: 5 }), ctx());
    expect(sqlText()).toContain("drafting");
  });
});
