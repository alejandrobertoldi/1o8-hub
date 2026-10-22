import { describe, it, expect } from "vitest";
import {
  resolveAccess,
  isKnownField,
  allowsTier,
  canWriteField,
  FIELD_TIERS,
  type Access,
} from "./access";

const ME = "11111111-1111-4111-8111-111111111111";
const THEM = "22222222-2222-4222-8222-222222222222";

/** Shorthand for building an Access without repeating three keys everywhere. */
function acc(p: Partial<Access>): Access {
  return { isSelf: false, isAdmin: false, isSuperAdmin: false, ...p };
}

describe("resolveAccess", () => {
  it("sets isSelf when the viewer is the target", () => {
    expect(resolveAccess({ id: ME, role: "editor" }, ME, false).isSelf).toBe(true);
  });

  it("clears isSelf for someone else's record", () => {
    expect(resolveAccess({ id: ME, role: "editor" }, THEM, false).isSelf).toBe(false);
  });

  it("sets isAdmin only for the admin role", () => {
    expect(resolveAccess({ id: ME, role: "admin" }, THEM, false).isAdmin).toBe(true);
  });

  it("clears isAdmin for editor and viewer", () => {
    expect(resolveAccess({ id: ME, role: "editor" }, THEM, false).isAdmin).toBe(false);
    expect(resolveAccess({ id: ME, role: "viewer" }, THEM, false).isAdmin).toBe(false);
  });

  it("takes isSuperAdmin from the explicit argument, never from the role string alone", () => {
    // F3: the caller decides JWT-vs-DB. An admin is not automatically super.
    expect(resolveAccess({ id: ME, role: "admin" }, THEM, false).isSuperAdmin).toBe(false);
    expect(resolveAccess({ id: ME, role: "viewer" }, THEM, true).isSuperAdmin).toBe(true);
    // Owner / Super Admin inherit admin-tier field writes.
    expect(resolveAccess({ id: ME, role: "owner" }, THEM, true).isAdmin).toBe(true);
    expect(resolveAccess({ id: ME, role: "super_admin" }, THEM, true).isAdmin).toBe(true);
  });

  it("lets all three flags be true at once", () => {
    // The whole reason this is a set of capabilities and not an ordered enum.
    expect(resolveAccess({ id: ME, role: "admin" }, ME, true)).toEqual({
      isSelf: true,
      isAdmin: true,
      isSuperAdmin: true,
    });
  });
});

describe("isKnownField", () => {
  it("accepts a field present in FIELD_TIERS", () => {
    expect(isKnownField("phone")).toBe(true);
  });

  it("rejects a field absent from FIELD_TIERS", () => {
    expect(isKnownField("salary")).toBe(false);
  });

  it("rejects inherited Object.prototype keys", () => {
    // A bare `in` returns true for these, so PATCH {"toString":"x"} would be
    // treated as a known field and fall through to a tier lookup of undefined.
    expect(isKnownField("toString")).toBe(false);
    expect(isKnownField("constructor")).toBe(false);
    expect(isKnownField("__proto__")).toBe(false);
    // Belt and braces: the map itself has no prototype, so even a lookup that
    // bypassed isKnownField could not resolve an inherited key to a tier.
    expect(Object.getPrototypeOf(FIELD_TIERS)).toBe(null);
  });
});

describe("canWriteField — self tier (phone)", () => {
  it("lets the owner write their own", () => {
    expect(canWriteField("phone", acc({ isSelf: true }))).toBe(true);
  });

  it("refuses a non-admin on someone else's", () => {
    expect(canWriteField("phone", acc({}))).toBe(false);
  });

  it("refuses a plain admin on someone ELSE's", () => {
    // One of the two cases the ordered-tier model got wrong.
    expect(canWriteField("phone", acc({ isAdmin: true }))).toBe(false);
  });

  it("lets a plain admin write their OWN", () => {
    // The other case the ordered-tier model got wrong: an admin viewing their
    // own record must still be able to edit their own phone number.
    expect(canWriteField("phone", acc({ isSelf: true, isAdmin: true }))).toBe(true);
  });

  it("lets a super-admin write anyone's", () => {
    expect(canWriteField("phone", acc({ isSuperAdmin: true }))).toBe(true);
  });
});

describe("canWriteField — admin tier (jobTitle / jobTitles / departments / leadsDepartments)", () => {
  it("lets an admin write someone else's", () => {
    expect(canWriteField("jobTitle", acc({ isAdmin: true }))).toBe(true);
    expect(canWriteField("jobTitles", acc({ isAdmin: true }))).toBe(true);
    expect(canWriteField("departments", acc({ isAdmin: true }))).toBe(true);
    expect(canWriteField("leadsDepartments", acc({ isAdmin: true }))).toBe(true);
  });

  it("refuses the owner when they are not an admin", () => {
    // Nobody promotes themselves by editing their own job title or department.
    expect(canWriteField("jobTitle", acc({ isSelf: true }))).toBe(false);
    expect(canWriteField("jobTitles", acc({ isSelf: true }))).toBe(false);
    expect(canWriteField("departments", acc({ isSelf: true }))).toBe(false);
    expect(canWriteField("leadsDepartments", acc({ isSelf: true }))).toBe(false);
  });

  it("refuses a non-admin on someone else's", () => {
    expect(canWriteField("jobTitle", acc({}))).toBe(false);
    expect(canWriteField("jobTitles", acc({}))).toBe(false);
    expect(canWriteField("departments", acc({}))).toBe(false);
    expect(canWriteField("leadsDepartments", acc({}))).toBe(false);
  });

  it("lets a super-admin who is not role-admin write it", () => {
    expect(canWriteField("jobTitle", acc({ isSuperAdmin: true }))).toBe(true);
    expect(canWriteField("jobTitles", acc({ isSuperAdmin: true }))).toBe(true);
    expect(canWriteField("departments", acc({ isSuperAdmin: true }))).toBe(true);
    expect(canWriteField("leadsDepartments", acc({ isSuperAdmin: true }))).toBe(true);
  });

  it("rejects the old vestigial field names (removed by the 0118 array + junction migration)", () => {
    expect(isKnownField("department")).toBe(false);
    expect(isKnownField("isDepartmentLead")).toBe(false);
  });
});

describe("canWriteField — admin tier (countryCode / residenceTimezone)", () => {
  it("lets an admin assign a holiday calendar", () => {
    expect(canWriteField("countryCode", acc({ isAdmin: true }))).toBe(true);
    expect(canWriteField("residenceTimezone", acc({ isAdmin: true }))).toBe(true);
  });

  it("refuses a non-admin owner", () => {
    expect(canWriteField("countryCode", acc({ isSelf: true }))).toBe(false);
    expect(canWriteField("residenceTimezone", acc({ isSelf: true }))).toBe(false);
  });
});

describe("allowsTier — superadmin tier", () => {
  it("admits a super-admin", () => {
    expect(allowsTier("superadmin", acc({ isSuperAdmin: true }))).toBe(true);
  });

  it("refuses a plain admin", () => {
    expect(allowsTier("superadmin", acc({ isAdmin: true }))).toBe(false);
  });

  it("refuses the owner", () => {
    // Pay is super-admin only, read AND write — you cannot read your own.
    expect(allowsTier("superadmin", acc({ isSelf: true }))).toBe(false);
  });
});
