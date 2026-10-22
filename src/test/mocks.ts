import { vi } from "vitest";

// Mock session object
export const mockSession = {
  user: { email: "test@marketfoundry.agency", role: "admin", name: "Test User" },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

// Chainable mock for Drizzle query builder
export function createChainMock(resolveValue: unknown = []) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = ["select", "from", "where", "orderBy", "limit", "leftJoin", "insert", "update", "set", "values", "returning", "execute"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // Terminal methods return the value
  chain.from = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockResolvedValue(resolveValue);
  chain.returning = vi.fn().mockResolvedValue(resolveValue);
  chain.limit = vi.fn().mockResolvedValue(resolveValue);
  chain.execute = vi.fn().mockResolvedValue(resolveValue);
  // For select().from().where().orderBy() chains
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.set = vi.fn().mockReturnValue(chain);
  chain.values = vi.fn().mockReturnValue(chain);
  chain.leftJoin = vi.fn().mockReturnValue(chain);
  return chain;
}

// Helper to create NextRequest
export function createRequest(url: string, options?: RequestInit) {
  return new Request(`http://localhost:3000${url}`, options);
}
