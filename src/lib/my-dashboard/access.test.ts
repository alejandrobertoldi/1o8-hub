import { describe, expect, it } from "vitest";
import { resolveTargetUser, resolveToday } from "./access";

const OTHER = "123e4567-e89b-12d3-a456-426614174000";

describe("resolveTargetUser", () => {
  it("staff without ?user sees themselves", () => expect(resolveTargetUser({ id: "me", role: "editor" }, null)).toEqual({ ok: true, id: "me", canPick: false }));
  it("staff asking for themselves is fine", () => expect(resolveTargetUser({ id: "me", role: "viewer" }, "me")).toEqual({ ok: true, id: "me", canPick: false }));
  it("non-admin asking for someone else gets 403", () => expect(resolveTargetUser({ id: "me", role: "editor" }, "other")).toEqual({ ok: false, status: 403 }));
  it.each(["super_admin", "owner"])("%s may view others", (role) =>
    expect(resolveTargetUser({ id: "me", role }, OTHER)).toEqual({ ok: true, id: OTHER, canPick: true }));
  it("owner asking for a malformed id gets 404", () => expect(resolveTargetUser({ id: "me", role: "owner" }, "not-a-uuid")).toEqual({ ok: false, status: 404 }));
  it("admin (not owner/super admin) may NOT view others and gets no picker", () => {
    expect(resolveTargetUser({ id: "me", role: "admin" }, "11111111-1111-1111-1111-111111111111")).toEqual({ ok: false, status: 403 });
    expect(resolveTargetUser({ id: "me", role: "admin" }, null)).toEqual({ ok: true, id: "me", canPick: false });
  });
  it("non-admin with a malformed id still gets 403", () => expect(resolveTargetUser({ id: "me", role: "editor" }, "not-a-uuid")).toEqual({ ok: false, status: 403 }));
  it.each(["client", "pending", "prospect", null])("%s is refused", (role) =>
    expect(resolveTargetUser({ id: "me", role }, null)).toEqual({ ok: false, status: 403 }));
});

describe("resolveToday", () => {
  const now = new Date("2026-10-07T23:30:00Z");
  it("accepts a browser date within ±1 day of server UTC", () => {
    expect(resolveToday("2026-10-08", now)).toBe("2026-10-08"); // Pakistan, already tomorrow
    expect(resolveToday("2026-10-06", now)).toBe("2026-10-06");
  });
  it("falls back to UTC for missing, malformed or far-off values", () => {
    for (const v of [null, "", "2026-13-01", "yesterday", "2026-10-20"]) expect(resolveToday(v, now)).toBe("2026-10-07");
  });
});
