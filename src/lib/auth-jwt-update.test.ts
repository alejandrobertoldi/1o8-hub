import { describe, it, expect, vi } from "vitest";

const { captured, dbRows } = vi.hoisted(() => ({
  captured: { config: null as null | { callbacks: { jwt: (args: Record<string, unknown>) => Promise<Record<string, unknown>> } } },
  dbRows: [] as unknown[],
}));

vi.mock("next-auth", () => ({
  default: (config: typeof captured.config) => {
    captured.config = config;
    return { handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() };
  },
}));
vi.mock("next-auth/providers/google", () => ({ default: () => ({ id: "google" }) }));
vi.mock("next-auth/providers/credentials", () => ({ default: () => ({ id: "dev-login" }) }));
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => {
      const chain: Record<string, unknown> = {};
      for (const k of ["from", "where", "limit"]) chain[k] = () => chain;
      chain.then = (fn: (v: unknown) => unknown) => Promise.resolve(dbRows).then(fn);
      return chain;
    }),
  },
}));

import "./auth";

const jwt = (args: Record<string, unknown>) => captured.config!.callbacks.jwt(args);

describe("jwt callback on session update()", () => {
  it("ignores a role the browser sends and keeps the DB role", async () => {
    dbRows.splice(0, dbRows.length, { id: "u1", role: "viewer", isSuperAdmin: false, clientIdCode: null, allowedSections: ["calendar"] });
    const token = await jwt({
      token: { email: "me@1o8.agency", role: "viewer", allowedSections: ["calendar"] },
      trigger: "update",
      session: { role: "owner", isSuperAdmin: true, allowedSections: ["admin"], clientIdCode: "ELK" },
    });
    expect(token.role).toBe("viewer");
    expect(token.isSuperAdmin).toBe(false);
    expect(token.allowedSections).toEqual(["calendar"]);
    expect(token.clientIdCode).toBeNull();
  });

  it("picks up a role an admin changed in the DB", async () => {
    dbRows.splice(0, dbRows.length, { id: "u1", role: "admin", isSuperAdmin: false, clientIdCode: null, allowedSections: [] });
    const token = await jwt({ token: { email: "me@1o8.agency", role: "viewer" }, trigger: "update", session: { refresh: true } });
    expect(token.role).toBe("admin");
  });

  it("drops to pending when the user no longer exists", async () => {
    dbRows.splice(0, dbRows.length);
    const token = await jwt({ token: { email: "gone@1o8.agency", role: "owner" }, trigger: "update", session: { role: "owner" } });
    expect(token.role).toBe("pending");
    expect(token.isSuperAdmin).toBe(false);
  });
});
