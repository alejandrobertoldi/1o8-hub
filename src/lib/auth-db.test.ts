import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted runs before any vi.mock factory, so these bindings are
// safe to reference from inside the mock factories.
const { authMock, fixtures } = vi.hoisted(() => ({
  authMock: vi.fn(),
  fixtures: {
    usersSelectResult: [] as unknown[],
    aacSelectResult: [] as unknown[],
  },
}));

// Defeat React's request-deduping cache() in tests — each call must
// re-execute the wrapped function so tests can vary the auth/db fixtures.
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T): T => fn,
  };
});

vi.mock("@/lib/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn((shape?: unknown) => {
      // Discriminate on `role`, which only the users projection carries. The two
      // aac reads select { status } or { allowedSections }. Keying off
      // `allowedSections` alone was wrong once the users projection started
      // selecting that column explicitly instead of doing a bare select().
      const s =
        typeof shape === "object" && shape !== null
          ? (shape as Record<string, unknown>)
          : {};
      const isUsersQuery = shape === undefined || "role" in s;
      const result = isUsersQuery
        ? fixtures.usersSelectResult
        : fixtures.aacSelectResult;
      const chain: Record<string, unknown> = {};
      chain.from = () => chain;
      chain.where = () => chain;
      chain.limit = () => chain;
      // Drizzle's chain is thenable — `await` and `.then((rows) => rows[0])`
      // both go through this.
      chain.then = (fn: (value: unknown) => unknown) =>
        Promise.resolve(result).then(fn);
      return chain;
    }),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([]),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  },
}));

import { getAuthSession } from "./auth-db";
import { db } from "@/lib/db";

beforeEach(() => {
  vi.clearAllMocks();
  fixtures.usersSelectResult = [];
  fixtures.aacSelectResult = [];
});

describe("getAuthSession", () => {
  it("returns null when no session", async () => {
    authMock.mockResolvedValue(null);
    const result = await getAuthSession();
    expect(result).toBeNull();
  });

  it("returns null when session has no email", async () => {
    authMock.mockResolvedValue({ user: {} });
    const result = await getAuthSession();
    expect(result).toBeNull();
  });

  it("for client role, resolves allowedSections from aac (union across assigned codes), not from users.allowed_sections", async () => {
    authMock.mockResolvedValue({
      user: { email: "client@example.com", name: "Client User", image: null },
    });
    fixtures.usersSelectResult =[
      {
        id: "u-client",
        email: "client@example.com",
        name: "Client User",
        image: null,
        role: "client",
        clientIdCode: "C1,C2",
        // This stale value MUST be ignored — Task 4 moved client/prospect to aac.
        allowedSections: ["should-not-be-used"],
      },
    ];
    fixtures.aacSelectResult =[
      { allowedSections: ["timeline", "sales"] },
      { allowedSections: ["sales", "aplus"] },
    ];

    const result = await getAuthSession();

    expect(result?.user.role).toBe("client");
    expect(result?.user.clientIdCode).toBe("C1,C2");
    expect(new Set(result?.user.allowedSections)).toEqual(
      new Set(["timeline", "sales", "aplus"]),
    );
    expect(result?.user.allowedSections).not.toContain("should-not-be-used");
  });

  it("for prospect role, resolves allowedSections from aac", async () => {
    authMock.mockResolvedValue({
      user: { email: "prospect@example.com", name: "Prospect", image: null },
    });
    fixtures.usersSelectResult =[
      {
        id: "u-prospect",
        email: "prospect@example.com",
        name: "Prospect",
        image: null,
        role: "prospect",
        clientIdCode: "P1",
        allowedSections: ["should-not-be-used"],
      },
    ];
    fixtures.aacSelectResult =[{ allowedSections: ["timeline"] }];

    const result = await getAuthSession();

    expect(result?.user.role).toBe("prospect");
    expect(result?.user.allowedSections).toEqual(["timeline"]);
  });

  it("for client role with no clientIdCode, returns empty allowedSections", async () => {
    authMock.mockResolvedValue({
      user: { email: "orphan@example.com", name: "Orphan", image: null },
    });
    fixtures.usersSelectResult =[
      {
        id: "u-orphan",
        email: "orphan@example.com",
        name: "Orphan",
        image: null,
        role: "client",
        clientIdCode: null,
        allowedSections: ["should-not-be-used"],
      },
    ];

    const result = await getAuthSession();

    expect(result?.user.allowedSections).toEqual([]);
  });

  it("for admin role, uses users.allowed_sections (aac is not consulted)", async () => {
    authMock.mockResolvedValue({
      user: { email: "admin@example.com", name: "Admin", image: null },
    });
    fixtures.usersSelectResult =[
      {
        id: "u-admin",
        email: "admin@example.com",
        name: "Admin",
        image: null,
        role: "admin",
        clientIdCode: null,
        allowedSections: ["sales", "reports"],
      },
    ];
    fixtures.aacSelectResult =[{ allowedSections: ["should-not-leak"] }];

    const result = await getAuthSession();

    expect(result?.user.role).toBe("admin");
    expect(result?.user.allowedSections).toEqual(["sales", "reports"]);
  });

  // ── Profile-sync write guard ───────────────────────────────────────────
  //
  // getAuthSession runs on every API route and every server component, so a
  // spurious UPDATE here is an extra write transaction on every request. In
  // production that guard misfired 235,900 times against an 81-row table,
  // because it compared a NULL column against an `undefined` token field and
  // `null !== undefined` is true, then wrote the same values back — so it could
  // never satisfy its own condition.
  describe("name/image profile sync", () => {
    const baseUser = {
      id: "u-1",
      name: "Existing Name",
      image: null as string | null,
      role: "admin" as const,
      clientIdCode: null,
      allowedSections: [] as string[],
    };

    it("does NOT write when the provider omits name and image (NULL column vs undefined token)", async () => {
      // This is the exact production case: 58 of 81 users have image NULL and
      // Google sends no `picture`, so session.user.image is undefined.
      authMock.mockResolvedValue({
        user: { email: "a@example.com", name: "Existing Name" },
      });
      fixtures.usersSelectResult = [{ ...baseUser, image: null }];

      await getAuthSession();

      expect(db.update).not.toHaveBeenCalled();
    });

    it("does NOT write when the stored values already match the token", async () => {
      authMock.mockResolvedValue({
        user: { email: "a@example.com", name: "Existing Name", image: "https://img/1.png" },
      });
      fixtures.usersSelectResult = [{ ...baseUser, image: "https://img/1.png" }];

      await getAuthSession();

      expect(db.update).not.toHaveBeenCalled();
    });

    it("DOES write when the provider sends a genuinely new image", async () => {
      authMock.mockResolvedValue({
        user: { email: "a@example.com", name: "Existing Name", image: "https://img/NEW.png" },
      });
      fixtures.usersSelectResult = [{ ...baseUser, image: "https://img/OLD.png" }];

      await getAuthSession();

      expect(db.update).toHaveBeenCalledTimes(1);
    });

    it("DOES write when the provider first supplies an image for a NULL column", async () => {
      authMock.mockResolvedValue({
        user: { email: "a@example.com", name: "Existing Name", image: "https://img/first.png" },
      });
      fixtures.usersSelectResult = [{ ...baseUser, image: null }];

      await getAuthSession();

      expect(db.update).toHaveBeenCalledTimes(1);
    });

    it("does NOT null out a stored name when the provider omits it", async () => {
      authMock.mockResolvedValue({ user: { email: "a@example.com" } });
      fixtures.usersSelectResult = [{ ...baseUser, name: "Keep Me", image: null }];

      await getAuthSession();

      expect(db.update).not.toHaveBeenCalled();
    });

    it("does NOT overwrite a stored avatar with the provider's Google picture", async () => {
      const stored = "https://p.supabase.co/storage/v1/object/public/avatars/u-1.png?v=abc";
      authMock.mockResolvedValue({
        user: { email: "stored-a@example.com", name: "Existing Name", image: "https://lh3.googleusercontent.com/a/x" },
      });
      fixtures.usersSelectResult = [{ ...baseUser, image: stored }];

      await getAuthSession();

      expect(db.update).not.toHaveBeenCalled();
    });

    it("still writes a changed name but keeps the stored avatar", async () => {
      const stored = "https://p.supabase.co/storage/v1/object/public/avatars/u-1.png?v=abc";
      authMock.mockResolvedValue({
        user: { email: "stored-b@example.com", name: "New Name", image: "https://lh3.googleusercontent.com/a/x" },
      });
      fixtures.usersSelectResult = [{ ...baseUser, image: stored }];

      await getAuthSession();

      expect(db.update).toHaveBeenCalledTimes(1);
      const setFn = vi.mocked(db.update).mock.results[0].value.set as ReturnType<typeof vi.fn>;
      expect(setFn.mock.calls[0][0]).toEqual({ name: "New Name", image: stored });
    });
  });

  it("for editor role, uses users.allowed_sections", async () => {
    authMock.mockResolvedValue({
      user: { email: "editor@example.com", name: "Editor", image: null },
    });
    fixtures.usersSelectResult =[
      {
        id: "u-editor",
        email: "editor@example.com",
        name: "Editor",
        image: null,
        role: "editor",
        clientIdCode: null,
        allowedSections: ["products"],
      },
    ];

    const result = await getAuthSession();

    expect(result?.user.allowedSections).toEqual(["products"]);
  });
});
