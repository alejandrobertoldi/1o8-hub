import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  updates: [] as Array<{ table: unknown; set: unknown; where: unknown }>,
}));

vi.mock("@/lib/auth-db", () => ({ getAuthSession: vi.fn(async () => ({ user: { role: "editor" } })) }));
vi.mock("drizzle-orm", async (orig) => ({
  ...(await orig<typeof import("drizzle-orm")>()),
  eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
  and: (...parts: unknown[]) => ({ op: "and", parts }),
}));
vi.mock("@/lib/db", () => ({
  db: {
    update: (table: unknown) => ({
      set: (set: unknown) => ({
        where: async (where: unknown) => {
          h.updates.push({ table, set, where });
        },
      }),
    }),
  },
}));

import { POST } from "./route";
import { seoAsins, seoProjects } from "@/lib/db/schema";

function call(body: unknown) {
  return POST(new Request("http://x/api/seo/projects/P1/save", { method: "POST", body: JSON.stringify(body) }) as never, {
    params: Promise.resolve({ id: "P1" }),
  });
}

beforeEach(() => {
  h.updates.length = 0;
});

describe("POST save s7_seo", () => {
  it("scopes each ASIN's generatedContent write to THIS project, not every project holding the ASIN", async () => {
    const res = await call({ phase: "s7_seo", data: { rows: [{ ASIN: "B0SHARED01", Title: "New v02 title" }] } });
    expect(res.status).toBe(200);
    const asinWrites = h.updates.filter((u) => u.table === seoAsins);
    expect(asinWrites).toHaveLength(1);
    expect(asinWrites[0].where).toEqual({
      op: "and",
      parts: [
        { op: "eq", col: seoAsins.projectId, val: "P1" },
        { op: "eq", col: seoAsins.asin, val: "B0SHARED01" },
      ],
    });
  });

  it("final save still stamps s6ApprovedAt on this project", async () => {
    await call({ phase: "s7_seo", data: { rows: [{ ASIN: "B0SHARED01", Title: "t" }], config: { in_progress: false } } });
    const projectWrites = h.updates.filter((u) => u.table === seoProjects);
    expect(projectWrites).toHaveLength(1);
    expect(projectWrites[0].where).toEqual({ op: "eq", col: seoProjects.id, val: "P1" });
  });
  it("explicit unlock clears s6ApprovedAt; an ordinary autosave leaves the lock alone", async () => {
    await call({ phase: "s7_seo", data: { rows: [{ ASIN: "B0SHARED01", Title: "t" }], config: { in_progress: true, unlock: true } } });
    const unlock = h.updates.filter((u) => u.table === seoProjects);
    expect(unlock).toHaveLength(1);
    expect((unlock[0].set as { s6ApprovedAt: unknown }).s6ApprovedAt).toBeNull();
    h.updates.length = 0;
    await call({ phase: "s7_seo", data: { rows: [{ ASIN: "B0SHARED01", Title: "t" }], config: { in_progress: true, step: "batch-description" } } });
    expect(h.updates.filter((u) => u.table === seoProjects)).toHaveLength(0);
  });
});
