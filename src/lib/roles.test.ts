import { describe, expect, it } from "vitest";
import {
  canAssignRole,
  isEditorOrAbove,
  hasAdminPowers,
  hasSuperPowers,
  isHubStaff,
  isUserRole,
  roleLabel,
} from "./roles";

describe("hasAdminPowers", () => {
  it("admits owner, super_admin, admin", () => {
    expect(hasAdminPowers("owner")).toBe(true);
    expect(hasAdminPowers("super_admin")).toBe(true);
    expect(hasAdminPowers("admin")).toBe(true);
  });

  it("refuses editor and below", () => {
    expect(hasAdminPowers("editor")).toBe(false);
    expect(hasAdminPowers("viewer")).toBe(false);
    expect(hasAdminPowers("client")).toBe(false);
  });
});

describe("hasSuperPowers", () => {
  it("admits owner and super_admin only", () => {
    expect(hasSuperPowers("owner")).toBe(true);
    expect(hasSuperPowers("super_admin")).toBe(true);
    expect(hasSuperPowers("admin")).toBe(false);
  });
});

describe("isHubStaff", () => {
  it("includes the staff ladder and excludes portal roles", () => {
    expect(isHubStaff("owner")).toBe(true);
    expect(isHubStaff("viewer")).toBe(true);
    expect(isHubStaff("client")).toBe(false);
    expect(isHubStaff("pending")).toBe(false);
  });
});

describe("canAssignRole", () => {
  it("only owner may assign owner", () => {
    expect(canAssignRole("owner", "owner")).toBe(true);
    expect(canAssignRole("super_admin", "owner")).toBe(false);
    expect(canAssignRole("admin", "owner")).toBe(false);
  });

  it("owner and super_admin may assign super_admin", () => {
    expect(canAssignRole("owner", "super_admin")).toBe(true);
    expect(canAssignRole("super_admin", "super_admin")).toBe(true);
    expect(canAssignRole("admin", "super_admin")).toBe(false);
  });

  it("admin+ may assign admin and portal roles", () => {
    expect(canAssignRole("admin", "admin")).toBe(true);
    expect(canAssignRole("admin", "editor")).toBe(true);
    expect(canAssignRole("admin", "client")).toBe(true);
    expect(canAssignRole("editor", "viewer")).toBe(false);
  });
});

describe("isUserRole / roleLabel", () => {
  it("accepts known roles", () => {
    expect(isUserRole("owner")).toBe(true);
    expect(isUserRole("super_admin")).toBe(true);
    expect(isUserRole("nope")).toBe(false);
  });

  it("labels Super Admin with a space", () => {
    expect(roleLabel("super_admin")).toBe("Super Admin");
  });
});

describe("isEditorOrAbove", () => {
  it("admits the whole editor-and-up ladder", () => {
    expect(isEditorOrAbove("owner")).toBe(true);
    expect(isEditorOrAbove("super_admin")).toBe(true);
    expect(isEditorOrAbove("admin")).toBe(true);
    expect(isEditorOrAbove("editor")).toBe(true);
  });

  it("refuses viewer and the portal roles", () => {
    expect(isEditorOrAbove("viewer")).toBe(false);
    expect(isEditorOrAbove("client")).toBe(false);
    expect(isEditorOrAbove("prospect")).toBe(false);
    expect(isEditorOrAbove("pending")).toBe(false);
  });

  it("refuses null, undefined and unknown strings", () => {
    expect(isEditorOrAbove(null)).toBe(false);
    expect(isEditorOrAbove(undefined)).toBe(false);
    expect(isEditorOrAbove("nope")).toBe(false);
  });
});
