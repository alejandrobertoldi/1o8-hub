import { describe, expect, it, vi, beforeEach } from "vitest";

const updateChain = {
  set: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  returning: vi.fn().mockResolvedValue([
    { clientIdCode: "C1", allowedSections: ["timeline", "sales"] },
  ]),
};

const insertChain = {
  values: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    update: vi.fn(() => updateChain),
    insert: vi.fn(() => insertChain),
  },
}));

import { PATCH } from "./route";
import { auth } from "@/lib/auth";

function makeReq(body: unknown) {
  return new Request("http://test/api/clients/C1/sections", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  updateChain.returning.mockResolvedValue([
    { clientIdCode: "C1", allowedSections: ["timeline", "sales"] },
  ]);
});

describe("PATCH /api/clients/[clientIdCode]/sections", () => {
  it("returns 403 for non-admin", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: "client", id: "u1" } } as never);
    const res = await PATCH(makeReq({ allowedSections: ["timeline"] }), { params: Promise.resolve({ clientIdCode: "C1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 400 on invalid section id", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: "admin", id: "u1" } } as never);
    const res = await PATCH(makeReq({ allowedSections: ["timeline", "not-a-real-section"] }), { params: Promise.resolve({ clientIdCode: "C1" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid section/i);
  });

  it("returns 400 when allowedSections is missing or not an array", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: "admin", id: "u1" } } as never);
    const res = await PATCH(makeReq({}), { params: Promise.resolve({ clientIdCode: "C1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 200 with body on success", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: "admin", id: "u1" } } as never);
    const res = await PATCH(makeReq({ allowedSections: ["timeline", "sales"] }), { params: Promise.resolve({ clientIdCode: "C1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clientIdCode).toBe("C1");
    expect(body.allowedSections).toEqual(["timeline", "sales"]);
  });

  // ── delta form ──────────────────────────────────────────────────
  // The whole-array form is a read-modify-write across the network: callers built
  // the array from the 60s-cached /api/clients payload, so a second toggle inside
  // that window reverted the first. The delta form never sends an array.

  it("applies a disable delta as SQL against the stored row, not a client array", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: "admin", id: "u1" } } as never);
    const res = await PATCH(
      makeReq({ sectionId: "timeline", enabled: false }),
      { params: Promise.resolve({ clientIdCode: "C1" }) },
    );
    expect(res.status).toBe(200);
    const setArg = updateChain.set.mock.calls[0][0] as { allowedSections: unknown };
    // An SQL expression, never a plain array — that is what makes it lost-update safe.
    expect(Array.isArray(setArg.allowedSections)).toBe(false);
    expect(String((setArg.allowedSections as { queryChunks?: unknown[] }).queryChunks?.length ?? 0) !== "0").toBe(true);
  });

  it("applies an enable delta", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: "admin", id: "u1" } } as never);
    const res = await PATCH(
      makeReq({ sectionId: "timeline", enabled: true }),
      { params: Promise.resolve({ clientIdCode: "C1" }) },
    );
    expect(res.status).toBe(200);
    expect(Array.isArray((updateChain.set.mock.calls[0][0] as { allowedSections: unknown }).allowedSections)).toBe(false);
  });

  it("enabling design also writes design subsection ids into the SQL expression", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: "admin", id: "u1" } } as never);
    const res = await PATCH(
      makeReq({ sectionId: "design", enabled: true }),
      { params: Promise.resolve({ clientIdCode: "C1" }) },
    );
    expect(res.status).toBe(200);
    const setArg = updateChain.set.mock.calls[0][0] as { allowedSections: unknown };
    expect(Array.isArray(setArg.allowedSections)).toBe(false);
    const bound: string[] = [];
    const walk = (node: unknown, seen = new Set<unknown>()) => {
      if (typeof node === "string") {
        bound.push(node);
        return;
      }
      if (!node || typeof node !== "object" || seen.has(node)) return;
      seen.add(node);
      const n = node as Record<string, unknown>;
      if (Array.isArray(n.queryChunks)) {
        for (const c of n.queryChunks) walk(c, seen);
      }
    };
    walk(setArg.allowedSections);
    expect(bound).toEqual(expect.arrayContaining([
      "design",
      "brandstory",
      "aplus",
      "listing-images",
      "storefront",
    ]));
  });

  it("rejects an unknown sectionId in the delta form", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: "admin", id: "u1" } } as never);
    const res = await PATCH(
      makeReq({ sectionId: "not-a-real-section", enabled: false }),
      { params: Promise.resolve({ clientIdCode: "C1" }) },
    );
    expect(res.status).toBe(400);
    expect(updateChain.set).not.toHaveBeenCalled();
  });

  it("rejects a delta with a non-boolean enabled", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { role: "admin", id: "u1" } } as never);
    const res = await PATCH(
      makeReq({ sectionId: "timeline", enabled: "yes" }),
      { params: Promise.resolve({ clientIdCode: "C1" }) },
    );
    expect(res.status).toBe(400);
    expect(updateChain.set).not.toHaveBeenCalled();
  });
});
