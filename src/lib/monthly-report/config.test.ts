import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDb } = vi.hoisted(() => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = ["select", "from", "where"];
  for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain);
  return { mockDb: chain };
});

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/db/schema", () => ({
  reportSectionConfig: {
    scope: "scope",
    scopeKey: "scope_key",
    sectionKey: "section_key",
    enabled: "enabled",
  },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  or: vi.fn(),
}));

import { resolveConfig, ALL_SECTION_KEYS } from "./config";

beforeEach(() => vi.clearAllMocks());

describe("resolveConfig", () => {
  it("defaults every section to enabled when table is empty", async () => {
    mockDb.where.mockResolvedValueOnce([]);
    const cfg = await resolveConfig("2348430");
    for (const key of ALL_SECTION_KEYS) {
      expect(cfg.enabled[key]).toBe(true);
    }
  });

  it("uses global rows when no client row exists", async () => {
    mockDb.where.mockResolvedValueOnce([
      { scope: "global", scopeKey: "default", sectionKey: "products", enabled: false },
    ]);
    const cfg = await resolveConfig("2348430");
    expect(cfg.enabled.products).toBe(false);
    expect(cfg.enabled.kpis).toBe(true); // default — no row for kpis
  });

  it("client row wins over global row", async () => {
    mockDb.where.mockResolvedValueOnce([
      { scope: "global", scopeKey: "default", sectionKey: "products", enabled: false },
      { scope: "client",  scopeKey: "2348430", sectionKey: "products", enabled: true },
    ]);
    const cfg = await resolveConfig("2348430");
    expect(cfg.enabled.products).toBe(true);
  });

  it("ignores rows for a different client", async () => {
    mockDb.where.mockResolvedValueOnce([
      { scope: "client", scopeKey: "9999999", sectionKey: "products", enabled: false },
    ]);
    const cfg = await resolveConfig("2348430");
    expect(cfg.enabled.products).toBe(true); // default, other client's row ignored
  });
});
