import { describe, it, expect } from "vitest";
import { toSessionModeUrl } from "@/lib/archive/pooler-url";

describe("toSessionModeUrl", () => {
  it("swaps the transaction-mode pooler port (6543) for the session-mode port (5432)", () => {
    expect(toSessionModeUrl("postgresql://user:pass@aws-1-us-west-1.pooler.supabase.com:6543/postgres?sslmode=require")).toBe(
      "postgresql://user:pass@aws-1-us-west-1.pooler.supabase.com:5432/postgres?sslmode=require"
    );
  });

  it("leaves a URL with no :6543/ untouched (already non-transaction-pooled)", () => {
    const url = "postgresql://user:pass@localhost:5432/postgres";
    expect(toSessionModeUrl(url)).toBe(url);
  });

  it("does not use URL-object round-tripping, so a password with special characters survives byte-for-byte", () => {
    const url = "postgresql://user:p%40ss%23word@aws-1-us-west-1.pooler.supabase.com:6543/postgres?sslmode=require";
    expect(toSessionModeUrl(url)).toBe(
      "postgresql://user:p%40ss%23word@aws-1-us-west-1.pooler.supabase.com:5432/postgres?sslmode=require"
    );
  });
});
