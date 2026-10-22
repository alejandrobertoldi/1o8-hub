import { describe, it, expect } from "vitest";

// Mirror the permission map from bulk-status/route.ts
const ROLE_ALLOWED_STATUSES: Record<string, readonly string[]> = {
  admin: ["draft", "in_review", "approved", "uploaded", "live"],
  editor: ["draft", "in_review"],
  client: ["draft", "approved"],
};

const ALL_STATUSES = ["draft", "in_review", "approved", "uploaded", "live"];

describe("Role permission map", () => {
  it("admin can set any status", () => {
    for (const status of ALL_STATUSES) {
      expect(ROLE_ALLOWED_STATUSES.admin).toContain(status);
    }
  });

  it("editor can only set draft and in_review", () => {
    expect(ROLE_ALLOWED_STATUSES.editor).toEqual(["draft", "in_review"]);
  });

  it("editor cannot set approved, uploaded, or live", () => {
    expect(ROLE_ALLOWED_STATUSES.editor).not.toContain("approved");
    expect(ROLE_ALLOWED_STATUSES.editor).not.toContain("uploaded");
    expect(ROLE_ALLOWED_STATUSES.editor).not.toContain("live");
  });

  it("client can only set draft and approved", () => {
    expect(ROLE_ALLOWED_STATUSES.client).toEqual(["draft", "approved"]);
  });

  it("client cannot set in_review, uploaded, or live", () => {
    expect(ROLE_ALLOWED_STATUSES.client).not.toContain("in_review");
    expect(ROLE_ALLOWED_STATUSES.client).not.toContain("uploaded");
    expect(ROLE_ALLOWED_STATUSES.client).not.toContain("live");
  });

  it("unknown role gets no permissions", () => {
    expect(ROLE_ALLOWED_STATUSES["viewer"]).toBeUndefined();
    expect(ROLE_ALLOWED_STATUSES["pending"]).toBeUndefined();
    expect(ROLE_ALLOWED_STATUSES["random"]).toBeUndefined();
  });
});
