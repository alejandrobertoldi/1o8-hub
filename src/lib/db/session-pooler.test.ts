import { describe, expect, it, vi } from "vitest";

vi.mock("postgres", () => ({ default: () => ({}) }));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: () => ({}) }));
process.env.DATABASE_URL ??= "postgres://x:y@localhost:5432/db";

const { toSessionPoolerUrl } = await import("./index");

describe("toSessionPoolerUrl", () => {
  it("moves Supabase's transaction pooler to the session pooler", () => {
    expect(toSessionPoolerUrl("postgresql://postgres.abc:p%40ss@aws-0-us-east-1.pooler.supabase.com:6543/postgres")).toBe(
      "postgresql://postgres.abc:p%40ss@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
    );
  });
  it("leaves other URLs alone", () => {
    expect(toSessionPoolerUrl("postgres://postgres:postgres@localhost:54330/hub")).toBe("postgres://postgres:postgres@localhost:54330/hub");
    expect(toSessionPoolerUrl("postgresql://u:p@aws-0-us-east-1.pooler.supabase.com:5432/postgres")).toContain(":5432/");
  });
});
