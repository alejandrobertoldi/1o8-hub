import { describe, it, expect } from "vitest";
import { makeSectionAccess } from "./portal-report-access";

const GRANTED = ["reports-overview", "reports-inventory"];

describe("makeSectionAccess — a real client session", () => {
  const access = makeSectionAccess({
    isAdminPreview: false,
    isProspect: false,
    allowedSections: GRANTED,
  });

  it("allows a granted section", () => {
    expect(access.canAccessSection("overview")).toBe(true);
    expect(access.clientHasSection("overview")).toBe(true);
  });

  it("blocks an ungranted section", () => {
    expect(access.canAccessSection("share-of-voice")).toBe(false);
    expect(access.clientHasSection("share-of-voice")).toBe(false);
  });

  it("prefixes the bare section id with reports-", () => {
    // "inventory" alone is a different permission from "reports-inventory";
    // only the prefixed form may grant a report section.
    const onlyBare = makeSectionAccess({
      isAdminPreview: false,
      isProspect: false,
      allowedSections: ["inventory"],
    });
    expect(onlyBare.clientHasSection("inventory")).toBe(false);
  });
});

describe("makeSectionAccess — a prospect", () => {
  const access = makeSectionAccess({
    isAdminPreview: false,
    isProspect: true,
    allowedSections: [],
  });

  it("sees every section despite holding no grants (demo behavior)", () => {
    expect(access.canAccessSection("share-of-voice")).toBe(true);
    expect(access.clientHasSection("share-of-voice")).toBe(true);
  });
});

describe("makeSectionAccess — an admin previewing a client", () => {
  const access = makeSectionAccess({
    isAdminPreview: true,
    isProspect: false,
    allowedSections: GRANTED,
  });

  it("may open any section, granted or not", () => {
    expect(access.canAccessSection("overview")).toBe(true);
    expect(access.canAccessSection("share-of-voice")).toBe(true);
  });

  it("still reports the client's real grants, so the card grid can show them", () => {
    // This is the distinction that matters: collapsing these two into one
    // would make every card read as enabled during preview and destroy the
    // admin's view of what the client actually has (spec §9 correction 4).
    expect(access.clientHasSection("overview")).toBe(true);
    expect(access.clientHasSection("share-of-voice")).toBe(false);
  });
});
